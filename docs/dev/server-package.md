# Server Package (@CCR/server) Deep Dive

## Overview

The server package is the core runtime that handles API routing, request transformation, agent management, and SSE stream processing. It wraps `@musistudio/llms` (core) Server class with CCR-specific REST endpoints and hooks.

## Source Structure

```
packages/server/src/
├── index.ts                           Entry point — startup, hooks, agent stream processing
├── server.ts                          createServer() — wraps core Server with REST endpoints
├── middleware/
│   └── auth.ts                        API key authentication middleware
├── agents/
│   ├── index.ts                       AgentsManager — singleton, registers all agents
│   ├── type.ts                        IAgent, ITool interfaces
│   └── image.agent.ts                 Image analysis agent
├── utils/
│   ├── index.ts                       Config I/O, env var interpolation, backup management
│   ├── SSEParser.transform.ts         Parse SSE text → structured event objects
│   ├── SSESerializer.transform.ts     Structured event objects → SSE text
│   └── rewriteStream.ts              Intercept/modify ReadableStream data
└── types/
    ├── llms-plugin.d.ts               Module augmentation for plugin system
    └── types.d.ts                     Module augmentation for @musistudio/llms
```

## Startup Sequence (`index.ts`)

```
main()
  │
  ├─ 1. initializeClaudeConfig()
  │     Create ~/.claude.json with random userID (required by Claude Code)
  │
  ├─ 2. initDir()
  │     Create directories:
  │       ~/.claude-code-router/
  │       ~/.claude-code-router/plugins/
  │       ~/.claude-code-router/logs/
  │
  ├─ 3. initConfig()
  │     Read ~/.claude-code-router/config.json (JSON5)
  │     Interpolate env vars: $VAR_NAME or ${VAR_NAME}
  │     Assign all config values to process.env
  │
  ├─ 4. Host determination
  │     If Providers configured AND APIKEY set → use config HOST
  │     If no providers → 0.0.0.0 (no auth)
  │     If providers but no APIKEY → 127.0.0.1 (local only)
  │
  ├─ 5. Logger setup
  │     rotating-file-stream → ~/.claude-code-router/logs/ccr-*.log
  │     Configurable via LOG_LEVEL env var
  │
  ├─ 6. createServer() (server.ts)
  │     Creates core Server instance with Fastify
  │     Registers CCR-specific REST API endpoints
  │
  ├─ 7. Preset registration
  │     Iterate installed presets
  │     Register each as Fastify namespace at /preset/<preset-name>
  │
  ├─ 8. Plugin registration
  │     Read config.plugins or config.Plugins
  │     Register enabled plugins (currently: token-speed)
  │
  └─ 9. Hook registration
        ├─ preHandler #1: apiKeyAuth
        ├─ preHandler #2: Pathname extraction
        ├─ preHandler #3: Agent detection
        ├─ onError: Error event emission
        ├─ onSend #1: SSE stream processing (agent tool calls, usage cache)
        └─ onSend #2: Send event emission
```

## REST API Endpoints (`server.ts`)

The `createServer()` function registers these CCR-specific endpoints on the Fastify instance:

### Config Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/config` | Read current configuration |
| POST | `/api/config` | Update configuration (with backup) |

### Service Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/transformers` | List available transformers |
| GET/POST | `/api/restart` | Restart the service |
| GET | `/health` | Health check endpoint |

### Log Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/logs/files` | List log files |
| GET | `/api/logs` | Read log content |
| DELETE | `/api/logs` | Delete log files |

### Preset Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/presets` | List installed presets |
| GET | `/api/presets/market` | List marketplace presets |
| GET | `/api/presets/:name` | Get preset info |
| POST | `/api/presets` | Install preset |
| DELETE | `/api/presets/:name` | Delete preset |
| POST | `/api/presets/install/github` | Install from GitHub |

### Update Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/update/check` | Check for updates |
| POST | `/api/update/perform` | Perform update |

### Static Files

| Path | Purpose |
|------|---------|
| `/ui/*` | Serve built UI (index.html from @CCR/ui) |

## Middleware

### Authentication (`middleware/auth.ts`)

```
apiKeyAuth(request, reply)
  │
  ├─ Skip for public paths: /, /health, /ui/*
  │
  ├─ Check x-api-key header
  │
  ├─ Check Authorization header (Bearer token)
  │
  ├─ If no APIKEY configured:
  │     Allow from localhost only (CORS restriction)
  │
  └─ If APIKEY configured:
        Validate against configured key
        Return 401 on mismatch
```

## Agent System

### IAgent Interface (`agents/type.ts`)

```typescript
interface IAgent {
  name: string;
  tools: Map<string, ITool>;
  shouldHandle: (req: any, config: any) => boolean;
  reqHandler: (req: any, config: any) => void;
  resHandler?: (payload: any, config: any) => void;
}

interface ITool {
  name: string;
  description: string;
  input_schema: any;
  handler: (args: any, context: any) => Promise<string>;
}
```

### AgentsManager (`agents/index.ts`)

Singleton that manages agent registration:

```typescript
class AgentsManager {
  private agents: IAgent[] = [];

  register(agent: IAgent): void;
  getTools(): Map<string, ITool>;          // Collect all agent tools
  getAgents(): IAgent[];                    // Get all registered agents
}
```

### ImageAgent (`agents/image.agent.ts`)

Handles image-related requests when the current model is not a vision model.

**Behavior:**

1. `shouldHandle()`: Returns true if request contains images AND the current model is NOT the configured image model
2. `reqHandler()`:
   - Replaces image content blocks with `[Image #N]` text placeholders
   - Caches actual image data in LRU cache (100 entries, 5-minute TTL)
   - Injects system prompt explaining the model is text-only but has an image analysis tool
   - Injects `analyzeImage` tool definition
3. `analyzeImage` tool handler:
   - Retrieves cached image data
   - Makes HTTP POST to local server `/v1/messages` with the vision model
   - Returns vision model's response as tool result

**Agent tool call interception** (in `index.ts` main hook):

```
onSend hook:
  │
  ├─ Parse SSE stream via SSEParserTransform
  │
  ├─ Detect content_block_start for agent tool names
  │
  ├─ Collect input_json_delta fragments
  │
  ├─ On content_block_stop:
  │     ├─ Parse complete tool arguments
  │     ├─ Call agent.tool.handler(args, context)
  │     ├─ Append tool_use + tool_result to req.body.messages
  │     ├─ Make new fetch() to /v1/messages
  │     └─ Pipe new response SSE events through rewriteStream
  │
  └─ Populate usage cache (input/output token counts)
```

## SSE Stream Processing

### SSEParserTransform (`utils/SSEParser.transform.ts`)

A `TransformStream<string, any>` that parses raw SSE text into structured event objects.

```
Input chunks:
  "event: content_block_start\n"
  "data: {\"type\":\"...\"}\n"
  "\n"

Output:
  { event: "content_block_start", data: { type: "..." } }
```

Handles: `event:`, `data:`, `id:`, `retry:` fields. JSON-parses data fields. Handles `[DONE]` sentinel.

### SSESerializerTransform (`utils/SSESerializer.transform.ts`)

A `TransformStream<any, string>` that serializes structured event objects back to SSE text format.

```
Input:
  { event: "content_block_start", data: { type: "..." } }

Output:
  "event: content_block_start\n"
  "data: {\"type\":\"...\"}\n"
  "\n"
```

### rewriteStream (`utils/rewriteStream.ts`)

Generic ReadableStream interceptor:

```typescript
function rewriteStream(
  stream: ReadableStream,
  processor: (chunk: any) => Promise<any | undefined>
): ReadableStream;
```

Reads each chunk from the source stream, passes it to the processor. Only enqueues the return value if it is not `undefined`. Used to intercept and modify SSE events in-flight.

## Configuration Utilities (`utils/index.ts`)

### Config File I/O

```typescript
function readConfig(): Record<string, any>;     // Read JSON5 config
function writeConfig(config: any): void;         // Write with backup
function initConfig(): Record<string, any>;      // Read + interpolate env vars
```

### Environment Variable Interpolation

```typescript
function interpolateEnvVars(obj: any): any;
// Replaces $VAR_NAME or ${VAR_NAME} with process.env.VAR_NAME values
```

### Backup Management

```typescript
function backupConfig(): void;
// Creates timestamped .bak file
// Keeps last 3 backups, deletes older ones
```

## Type Augmentations

### Server types (`types/types.d.ts`)

Augments the `@musistudio/llms` module with CCR-specific types:

- `ServerConfig` — Server configuration interface
- `Server` — Extended server class interface
- `ConfigService`, `ProviderService`, `TransformerService` — Service interfaces
- `Usage` — Token usage tracking
- `sessionUsageCache` — LRU cache for session usage data
- `RouterContext` — Routing context passed to custom routers
- `TokenizerType`, `TokenizerConfig`, `TokenizeRequest`, `TokenizerResult`, `TokenizerService`
- `TokenStats`, `getTokenSpeedStats()`, `getGlobalTokenSpeedStats()`

### Plugin types (`types/llms-plugin.d.ts`)

Augments `@musistudio/llms` with plugin system types:

- `CCRPluginOptions`, `CCRPlugin`, `PluginMetadata`
- `PluginManager` class interface
- `pluginManager` singleton, `tokenSpeedPlugin`
- Re-exports `SSEParserTransform`, `SSESerializerTransform`, `rewriteStream()`

## Building

```bash
# From monorepo root
pnpm build:server

# Equivalent to:
tsc --emitDeclarationOnly           # Generate .d.ts files
esbuild src/index.ts \
  --bundle \
  --platform=node \
  --minify \
  --tree-shaking=true \
  --outfile=dist/index.js           # Single bundled file
```

Additional build step copies `tiktoken_bg.wasm` to dist directory.
