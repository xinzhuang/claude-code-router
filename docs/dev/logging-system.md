# Logging System Architecture

The project uses a **three-tier logging system**:

---

## 1. Fastify/Pino Structured Logs

Implemented through Fastify 5's built-in pino logger. All HTTP request lifecycle, routing decisions, provider errors, transformer/tokenizer lifecycle events are written here.

**Configuration**: `packages/server/src/index.ts` (lines 121-165)

```
File: ~/.claude-code-router/logs/ccr-YYYYMMDDHHMMSS.log
Rotation: Daily, max 3 files, 50MB max per file
Level: Controlled by LOG_LEVEL env var, default "debug"
Disable: Set LOG: false in config
```

**Logger setup** (from `packages/server/src/index.ts`):

```typescript
// Mode 1: Rotating file stream (default when config.LOG !== false)
loggerConfig = {
    level: config.LOG_LEVEL || "debug",
    stream: createStream(generator, {
        path: HOME_DIR,                     // ~/.claude-code-router/
        maxFiles: 3,                        // keep max 3 files
        interval: "1d",                     // rotate daily
        compress: false,                    // no gzip compression
        maxSize: "50M"                      // max 50MB per file
    }),
};

// Mode 2: Disabled (config.LOG === false)
loggerConfig = false;

// Mode 3: External logger (if options.logger is passed)
loggerConfig = options.logger;
```

**What gets logged**:

| Scenario | Source File | Level |
|----------|------------|-------|
| Every `/v1/messages` request body | `packages/core/src/server.ts` | info |
| Routing decisions (long context/background/think) | `packages/core/src/utils/router.ts` | info |
| Provider registration | `packages/core/src/services/provider.ts` | info/error |
| Transformer registration/load failure | `packages/core/src/services/transformer.ts` | info/error |
| Tokenizer init/failure | `packages/core/src/services/tokenizer.ts` | info/error |
| Upstream request details (URL, headers, proxy) | `packages/core/src/utils/request.ts` | debug |
| Fallback model attempts/failures | `packages/core/src/api/routes.ts` | warn/info/error |
| Upstream response errors (status, model) | `packages/core/src/api/routes.ts` | error |
| Custom router load failure | `packages/core/src/utils/router.ts` | error |
| Uncaught exception/unhandled rejection | `packages/server/src/index.ts` | error |
| Plugin enable failure | `packages/core/src/plugins/plugin-manager.ts` | error |

**All pino logger usage sites**:

`packages/core/src/server.ts`:
- `this.app.log.error(...)` — TokenizerService initialization failure
- `req.log.info({ data: body, type: "request body" })` — Every `/v1/messages` request body
- `req.log.error({error: err}, "Error in modelProviderMiddleware:")` — Model parsing error
- `this.app.log.info(...)` — Server startup message
- `this.app.log.info(...)` — Shutdown signal received
- `this.app.log.error(...)` — Server startup error

`packages/core/src/api/middleware.ts`:
- `request.log.error(error)` — Any API error in error handler

`packages/core/src/api/routes.ts`:
- `req.log.warn(...)` — Fallback model attempt
- `req.log.info(...)` — Trying specific fallback model
- `req.log.warn(...)` — Fallback provider not found
- `req.log.info(...)` — Fallback model succeeded
- `req.log.warn(...)` — Fallback model failed
- `req.log.error(...)` — All fallback models failed
- `fastify.log.error(...)` — Provider response error (status, model, error text)

`packages/core/src/utils/request.ts`:
- `logger?.debug(...)` — Final outgoing HTTP request with headers, URL, proxy info

`packages/core/src/utils/router.ts`:
- `req.log.info(...)` — Using long context model (token count + threshold)
- `req.log.info(...)` — Using background model for Haiku
- `req.log.info(...)` — Using think model
- `req.log.error(...)` — Custom router load failure
- `req.log.error(...)` — Router middleware error

`packages/core/src/services/transformer.ts`:
- `this.logger.info(...)` — Transformer registration (with/without endpoint)
- `this.logger.error(...)` — Transformer load error from config
- `this.logger.error(...)` — TransformerService init error
- `this.logger.error(...)` — Transformer registration error

`packages/core/src/services/tokenizer.ts`:
- `this.logger?.info(...)` — TokenizerService initialized
- `this.logger?.error(...)` — TokenizerService initialization error
- `this.logger?.info(...)` — Initializing HuggingFace tokenizer
- `this.logger?.info(...)` — Calling initialize() on tokenizer
- `this.logger?.info(...)` — Tokenizer initialized successfully
- `this.logger?.error(...)` — Failed to initialize tokenizer (with stack)
- `this.logger?.error(...)` — Error disposing tokenizer

`packages/core/src/services/provider.ts`:
- `this.logger.info(...)` — Provider registered
- `this.logger.error(...)` — Provider registration error

`packages/core/src/tokenizer/huggingface-tokenizer.ts`:
- `this.logger?.warn(...)` — Failed to load from cache
- `this.logger?.info(...)` — Downloading tokenizer files
- `this.logger?.info(...)` — Initializing HuggingFace tokenizer
- `this.logger?.info(...)` — Tokenizer initialized
- `this.logger?.error(...)` — Failed to initialize tokenizer
- `this.logger?.error(...)` — Error counting tokens

`packages/core/src/tokenizer/api-tokenizer.ts`:
- `this.logger?.error(...)` — Failed to extract token count from API response

`packages/core/src/plugins/plugin-manager.ts`:
- `fastify.log?.error(...)` — Failed to enable plugin

`packages/core/src/plugins/token-speed.ts`:
- `fastify.log?.warn(...)` — TokenizerService not available
- `fastify.log?.debug(...)` — No tokenizer config for model
- `fastify.log?.info(...)` — Created tokenizer for model
- `fastify.log?.warn(...)` — Failed to create tokenizer
- `fastify.log?.warn(...)` — Failed to output streaming stats
- `fastify.log?.warn(...)` — Error processing token stats
- `fastify.log?.warn(...)` — Background stats processing failed

`packages/server/src/index.ts`:
- `serverInstance.app.log.error(...)` — Uncaught exception
- `serverInstance.app.log.error(...)` — Unhandled rejection

`packages/server/src/server.ts`:
- `req.log?.info/warn/error(...)` — Tokenizer lookup for count_tokens endpoint

Transformer files using `this.logger.debug(...)`:
- `packages/core/src/transformer/anthropic.transformer.ts`
- `packages/core/src/transformer/openai.responses.transformer.ts`

---

## 2. Console Output

Unstructured text output to stdout/stderr, directed at the running terminal.

**CLI commands** (`packages/cli/src/cli.ts`, `packages/cli/src/utils/index.ts`):
- Startup/stop/restart/status messages
- "No providers configured. Listening on 0.0.0.0..."
- "Service not running, starting service..."
- "claude-code-router server is running"

**Config loading** (`packages/core/src/services/config.ts`):
- "Loaded JSON config from: <path>"
- "Failed to load JSON config from..."
- "JSON config file not found:"

**Server startup** (`packages/server/src/index.ts`):
- Config file backup notification
- Agent tool execution errors (raw error dump)
- Unexpected stream processing errors
- Background stream reading errors

**Transformer stream errors** (multiple files, `console.error/warn`):
- `packages/core/src/transformer/deepseek.transformer.ts` — SSE stream parsing errors
- `packages/core/src/transformer/vercel.transformer.ts` — Decode/buffer warnings, stream errors
- `packages/core/src/transformer/openrouter.transformer.ts` — Decode/buffer warnings, stream errors
- `packages/core/src/transformer/groq.transformer.ts` — Decode/buffer warnings, stream errors
- `packages/core/src/transformer/tooluse.transformer.ts` — Stream errors
- `packages/core/src/transformer/enhancetool.transformer.ts` — Various stream/processing errors
- `packages/core/src/transformer/reasoning.transformer.ts` — Debug JSON dump, stream errors
- `packages/core/src/transformer/forcereasoning.transformer.ts` — Stream errors
- `packages/core/src/transformer/openai.responses.transformer.ts` — Stream errors, debug content dump
- `packages/core/src/transformer/anthropic.transformer.ts` — Stream/processing errors

**Vertex credential errors**:
- `packages/core/src/transformer/vertex-claude.transformer.ts` — Error getting access token / extracting project_id
- `packages/core/src/transformer/vertex-gemini.transformer.ts` — Error getting access token / extracting project_id

**OutputManager** (`packages/core/src/plugins/output/output-manager.ts`):
- Handler registration/output failures

**Statusline** (`packages/cli/src/utils/statusline.ts`):
- Error executing statusline script

---

## 3. Token-Speed Plugin Logs

Pluggable Output Handler system for token generation speed metrics.

**Configuration**:
```json
{
  "plugins": [{ "name": "token-speed", "enabled": true }]
}
```

**Tracked metrics**:
- `requestId` — Fastify request ID (first 8 chars)
- `sessionId` — Extracted from `metadata.user_id` pattern `_session_<uuid>`
- `tokenCount` — Total output tokens
- `tokensPerSecond` — Real-time (sliding 1-second window for streaming) or average (for final)
- `timeToFirstToken` — Time from request start to first content event
- `duration` — Total request duration
- `stream` — Whether it's a streaming request
- `tokenTimestamps` — Array of timestamps for each token (for sliding window calculation)

**Token counting**: Uses configured tokenizers (Tiktoken, HuggingFace, API) when available. Falls back to `estimateTokens()` heuristic: ~4 chars/token for English, ~1.5 chars/token for Chinese.

### Output Handler Types

| Handler | Target | Description |
|---------|--------|-------------|
| `console` | stdout | text/JSON/markdown formats, ANSI colored output, configurable log level |
| `temp-file` | `$TMPDIR/claude-code-router/session-<sessionId>.json` | Overwritten per session, JSON format |
| `webhook` | HTTP POST endpoint | Bearer/basic/custom auth, exponential backoff retry (3 attempts, 1s base), 30s timeout |

**Default from server registration**: Only `temp-file` is enabled. The plugin's own defaults include both `console` and `temp-file`, but server overrides this.

### Statusline Integration

The CLI statusline (`packages/cli/src/utils/statusline.ts`) reads token-speed stats from temp files:
- Reads from `$TMPDIR/claude-code-router/session-<sessionId>.json`
- Considers data stale if older than 3 seconds
- Displays tokens/second and streaming indicator in the status bar

---

## Log File Locations Summary

| Path | Purpose | Rotation |
|------|---------|----------|
| `~/.claude-code-router/logs/ccr-YYYYMMDDHHMMSS.log` | Pino structured JSON logs (all HTTP/routing/provider/transformer events) | Daily, max 3 files, 50MB |
| `~/.claude-code-router/claude-code-router.log` | Application log (env var `LOG_FILE`) | No rotation |
| `$TMPDIR/claude-code-router/session-<sessionId>.json` | Token speed metrics (temp files) | Overwritten per session |
| `~/.claude-code-router/logs/app.log` | Referenced in API (default read target for log endpoints) | No rotation |

---

## Log Management API Endpoints

Defined in `packages/server/src/server.ts`:

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/logs/files` | List all `.log` files in `~/.claude-code-router/logs/` with name, size, lastModified |
| `GET` | `/api/logs?file=<path>` | Read log file content; defaults to `~/.claude-code-router/logs/app.log` |
| `DELETE` | `/api/logs?file=<path>` | Clear log file content; defaults to `~/.claude-code-router/logs/app.log` |

The UI's `LogViewer` component uses these endpoints for log browsing.
