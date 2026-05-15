# Data Flow and Request Lifecycle

## Complete Request Path

```
Claude Code CLI
  │
  │  HTTP POST /v1/messages
  │  Headers: x-api-key, anthropic-version, content-type
  │  Body: { model, messages, max_tokens, stream, tools, thinking, ... }
  │
  ▼
CCR Server (Fastify, port 3456)
  │
  ├─ 1. Auth Middleware (apiKeyAuth)
  │     Check x-api-key / Authorization header
  │     Skip for public paths: /, /health, /ui/*
  │
  ├─ 2. preHandler: Pathname Extraction
  │     Set req.pathname from URL (for preset namespace detection)
  │
  ├─ 3. preHandler: Router (core routing logic)
  │     Calculate token count → determine scenario → select provider+model
  │     See "Routing Decision Tree" below
  │
  ├─ 4. preHandler: Agent Detection
  │     For each registered agent:
  │       if agent.shouldHandle(req, config):
  │         agent.reqHandler(req, config)  // modify request
  │         inject agent.tools into req.body.tools
  │
  ├─ 5. Core API Handler (routes.ts)
  │     a. Resolve provider+model → upstream URL + headers
  │     b. Run transformer chain:
  │        - transformRequestOut (internal → provider format)
  │        - Provider-level transformers (transformRequestIn)
  │        - Model-specific transformers
  │     c. Send HTTP request to upstream LLM provider
  │     d. Run response transformer chain (reverse order)
  │     e. Return streaming/non-streaming response
  │
  ├─ 6. onSend: SSE Stream Processing
  │     - Parse SSE events from upstream response
  │     - Detect agent tool calls (content_block_start)
  │     - If agent tool call detected:
  │       • Collect tool arguments from input_json_delta events
  │       • Execute agent tool handler
  │       • Append tool_use + tool_result to messages
  │       • Make new fetch() to /v1/messages
  │       • Pipe new response SSE events back through original stream
  │     - Populate usage cache (token counts)
  │
  ├─ 7. onSend: Plugin Hooks
  │     token-speed plugin: measure and report tokens/second
  │
  ▼
Response to Claude Code CLI (SSE stream)
```

## Routing Decision Tree

Located in `core/src/utils/router.ts`, function `getUseModel()`:

```
getUseModel(req, config)
  │
  ├─ 1. Explicit model format?
  │     req.body.model contains "," → "provider,model"
  │     Validate provider exists and model is in provider.models
  │     → Use directly
  │
  ├─ 2. Long context?
  │     tokenCount > longContextThreshold (default 60000)
  │     OR (previous usage > threshold AND current > 20000)
  │     → Router.longContext
  │
  ├─ 3. Subagent tag?
  │     System prompt contains <CCR-SUBAGENT-MODEL>provider,model</CCR-SUBAGENT-MODEL>
  │     → Extract and use specified model
  │
  ├─ 4. Background task?
  │     Model name includes "claude" AND "haiku"
  │     → Router.background
  │
  ├─ 5. Web search?
  │     tools array includes web_search type tools
  │     → Router.webSearch
  │
  ├─ 6. Think mode?
  │     req.body.thinking is set
  │     → Router.think
  │
  └─ 7. Default
        → Router.default
```

Additional routing layers (applied before the decision tree):

```
1. Project-specific routing:
   Check ~/.claude/projects/<project-id>/claude-code-router.json
   or <sessionId>.json for per-project Router overrides

2. Custom router:
   If CUSTOM_ROUTER_PATH is set, load JS module
   Call customRouter(req, config, context) → model decision
```

## Transformer Pipeline

The transformer chain is the heart of protocol adaptation. Located in `core/src/api/routes.ts`:

```
Request (Anthropic format from Claude Code)
  │
  ▼
┌─────────────────────────────────────────────────┐
│ transformRequestOut                              │
│ Converts from provider format to unified format  │
│ (e.g., AnthropicTransformer.transformRequestOut) │
└─────────────────────┬───────────────────────────┘
                      │
┌─────────────────────▼───────────────────────────┐
│ Provider-level transformers (transformRequestIn) │
│ Applied to all models in a provider              │
│ (e.g., maxtoken, tooluse, reasoning)             │
└─────────────────────┬───────────────────────────┘
                      │
┌─────────────────────▼───────────────────────────┐
│ Model-specific transformers                      │
│ Applied only for specific models                 │
│ (config: provider.transformer.<model>.use)       │
└─────────────────────┬───────────────────────────┘
                      │
                      ▼
            HTTP request to upstream LLM provider
                      │
                      ▼
┌─────────────────────────────────────────────────┐
│ Response transformers (reverse order)            │
│ Model-specific → Provider-level → transformResponseIn │
└─────────────────────┬───────────────────────────┘
                      │
                      ▼
          Response (Anthropic format to Claude Code)
```

**Bypass optimization**: If a provider uses only one transformer matching the current transformer name, the entire chain is skipped (passthrough mode) for better performance.

## Agent Tool Call Flow

The agent system enables pluggable feature modules that can inject tools and intercept tool calls:

```
Phase 1: Request Injection (preHandler)
───────────────────────────────────────
  Agent.shouldHandle(req, config) → true
  Agent.reqHandler(req, config)
    → Modify request body (e.g., replace images with text placeholders)
    → Cache original data (e.g., image bytes in LRU cache)
  Inject agent.tools into req.body.tools
    → Add tool definitions (name, description, input_schema)

Phase 2: LLM Processing
────────────────────────
  LLM receives request with injected tools
  LLM decides to call agent tool → returns tool_use content block

Phase 3: Stream Interception (onSend)
──────────────────────────────────────
  SSEParserTransform parses upstream SSE text → event objects
  Detect content_block_start with agent tool name
  Collect input_json_delta fragments → build tool arguments
  On content_block_stop:
    Parse complete tool arguments
    Call agent.tool.handler(args, context)
      → May make separate HTTP request (e.g., to vision model)
    Append tool_use + tool_result to req.body.messages
    Make new fetch() to /v1/messages with updated messages
    Pipe new response SSE events back through rewriteStream
```

## SSE Stream Processing

Three components handle SSE stream manipulation:

### SSEParserTransform
Transforms raw SSE text into structured event objects:
```
Input:  "event: content_block_start\ndata: {\"type\":\"...\"}\n\n"
Output: { event: "content_block_start", data: { type: "..." } }
```

### SSESerializerTransform
Transforms structured event objects back to SSE text:
```
Input:  { event: "content_block_start", data: { type: "..." } }
Output: "event: content_block_start\ndata: {\"type\":\"...\"}\n\n"
```

### rewriteStream
Intercepts ReadableStream chunks via async processor:
```typescript
rewriteStream(readableStream, async (chunk) => {
  // Return modified chunk, or undefined to skip
  return transformedChunk;
});
```

## Configuration Loading Flow

```
Server startup
  │
  ├─ initConfig()
  │   ├─ Read ~/.claude-code-router/config.json (JSON5)
  │   ├─ Interpolate env vars: $VAR_NAME or ${VAR_NAME}
  │   └─ Assign all values to process.env
  │
  ├─ ConfigService (core)
  │   ├─ Load JSON5 config from file
  │   ├─ Merge with initialConfig (from server.ts)
  │   ├─ Load .env files
  │   └─ Provide get(), set(), getAll(), reload()
  │
  └─ Hot reload
      Requires ccr restart (not automatic)
```

## Session-to-Project Mapping

When Claude Code sends a request, the server maps sessions to projects for per-project routing:

```
searchProjectBySession(sessionId)
  │
  ├─ Check LRU cache (1000 entries)
  │   If cached → return project path
  │
  └─ Scan ~/.claude/projects/ directories
    For each project directory:
      Check for {sessionId}.jsonl file
      If found → cache and return project path
```

## Fallback System

Per-scenario fallback model lists in config:

```
Router: {
  default: "provider,model",
  background: "provider,model",
  think: "provider,model",
  longContext: "provider,model",
  fallback: {
    default: ["fallback-provider,fallback-model"],
    background: [...],
    think: [...],
    longContext: [...]
  }
}
```

When the primary model request fails, the server tries fallback models in order.
