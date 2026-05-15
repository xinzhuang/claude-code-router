# Architecture Overview

## Monorepo Structure

pnpm workspace monorepo with 5 packages + 1 docs site:

```
claude-code-router/
├── packages/
│   ├── core/      @musistudio/llms  v1.0.51  Universal LLM API transformation framework
│   ├── server/    @CCR/server       v2.0.0   Core server (API routing, agents, SSE)
│   ├── cli/       @CCR/cli          v2.0.0   Command-line tool (ccr command)
│   ├── shared/    @CCR/shared       v2.0.0   Shared constants, utilities, presets
│   └── ui/        @CCR/ui           v2.0.0   Web management UI (React + Vite)
├── docs/          Docusaurus documentation site
├── scripts/       Build and release scripts
└── examples/      Example configurations
```

## Dependency Graph

```
                    ┌─────────────┐
                    │   cli       │
                    │  @CCR/cli   │
                    └──────┬──────┘
                           │ (devDep, bundled at build time)
                    ┌──────┴──────┐
                    │   server    │
                    │ @CCR/server │
                    └──────┬──────┘
                           │ (runtime dep)
                    ┌──────┴──────┐
                    │    core     │
                    │@musistudio/ │
                    │   llms      │
                    └──────┬──────┘
                           │ (devDep)
                    ┌──────┴──────┐
                    │   shared    │
                    │ @CCR/shared │
                    └─────────────┘

  ui (@CCR/ui) ─── standalone SPA, communicates with server via REST API only
```

**Key relationships:**

- `cli` depends on `server` and `shared` as devDependencies. esbuild bundles everything into a single `dist/cli.js`.
- `server` depends on `core` (@musistudio/llms) as a runtime dependency. Imports the `Server` class and adds CCR-specific endpoints.
- `core` depends on `shared` for constants (`CLAUDE_PROJECTS_DIR`, `HOME_DIR`, etc.).
- `shared` has zero internal dependencies. Pure utility library.
- `ui` is completely standalone — React SPA that only uses REST API at runtime.

## Build Order

```
1. shared   →  tsc (declarations) + esbuild (bundle)
2. core     →  esbuild (dual CJS/ESM output)
3. server   →  tsc (declarations) + esbuild (bundle) + copy tiktoken_bg.wasm
4. cli      →  esbuild (bundle) + copy tiktoken_bg.wasm + copy UI index.html → root dist/
5. ui       →  tsc + vite (single-file HTML build)
```

## Package Summaries

### @musistudio/llms (core)

Reusable, publishable npm package providing a universal LLM API transformation server. **Not CCR-specific.** Contains:

- **Server class** — Fastify-based HTTP server with plugin architecture
- **Transformer system** — 21 built-in transformers (Anthropic, OpenAI, Gemini, DeepSeek, Groq, etc.)
- **Routing system** — Request routing by token count, scenario (background/think/longContext/webSearch/image)
- **Provider management** — Multi-provider registry with per-model configuration
- **Tokenizer service** — tiktoken, HuggingFace, API-based tokenizers
- **Plugin system** — Fastify plugin manager (token-speed measurement built-in)
- **SSE stream processing** — Parse/serialize/rewrite Server-Sent Events

Key source structure: `core/src/`

```
src/
├── server.ts              Main Server class
├── api/
│   ├── routes.ts          API route handlers, transformer pipeline
│   └── middleware.ts      Error handling middleware
├── services/
│   ├── config.ts          ConfigService (JSON5, env vars, .env)
│   ├── provider.ts        ProviderService (provider registry)
│   ├── transformer.ts     TransformerService (transformer registry)
│   └── tokenizer.ts       TokenizerService (tiktoken/huggingface/api)
├── transformer/           21 built-in transformers
├── plugins/               Plugin system (PluginManager, token-speed)
├── tokenizer/             Tokenizer implementations
├── types/                 Type definitions (llm.ts, transformer.ts)
└── utils/
    ├── router.ts          Request routing logic
    ├── cache.ts           LRU cache for session usage
    ├── request.ts         Unified HTTP sender (proxy support)
    └── sse/               SSE stream utilities
```

### @CCR/server

Core server handling API routing and transformations. Entry point: `server/src/index.ts`

Startup sequence:
1. `initializeClaudeConfig()` — Creates `~/.claude.json`
2. `initDir()` — Creates directories under `~/.claude-code-router/`
3. `initConfig()` — Loads JSON5 config, interpolates env vars, sets `process.env`
4. Determines host (0.0.0.0 vs 127.0.0.1 based on APIKEY presence)
5. Creates server via `createServer()`
6. Registers presets as Fastify namespaces
7. Registers plugins
8. Registers hooks (auth, pathname extraction, agent detection, SSE processing)

Key source structure: `server/src/`

```
src/
├── index.ts               Entry point, startup, hooks, agent stream processing
├── server.ts              createServer() — wraps core Server with CCR REST endpoints
├── middleware/
│   └── auth.ts            API key authentication
├── agents/
│   ├── index.ts           AgentsManager (singleton)
│   ├── type.ts            IAgent, ITool interfaces
│   └── image.agent.ts     Image analysis agent
├── utils/
│   ├── index.ts           Config I/O, env var interpolation, backup
│   ├── SSEParser.transform.ts    Parse SSE text → event objects
│   ├── SSESerializer.transform.ts  Event objects → SSE text
│   └── rewriteStream.ts  Intercept/modify ReadableStream chunks
└── types/
    ├── llms-plugin.d.ts   Plugin type augmentations
    └── types.d.ts         Module augmentation for @musistudio/llms
```

### @CCR/cli

Command-line tool providing the `ccr` command. Entry point: `cli/src/cli.ts`

| Command | Purpose |
|---------|---------|
| `start` | Start server as background process |
| `stop` | Kill server by PID |
| `restart` | Stop then start |
| `status` | Show running status |
| `code` | Auto-start server, spawn `claude` CLI with env vars |
| `model` | Interactive TUI for model selection |
| `preset` | Manage presets (export/install/list/info/delete) |
| `activate` | Output shell env vars |
| `ui` | Open web UI in browser |
| `statusline` | Format status line from JSON stdin |

### @CCR/shared

Pure utility library with no internal dependencies:

- **Constants**: `HOME_DIR`, `CONFIG_FILE`, `PLUGINS_DIR`, `PRESETS_DIR`, `PID_FILE`, etc.
- **Preset system**: Export, install, merge, validation, marketplace, schema, sensitive field handling

### @CCR/ui

React 19 SPA built with Vite. Served by the server at `/ui/` via `@fastify/static`.

Tech stack: React 19, Vite 7, Tailwind CSS 4, Radix UI, Monaco Editor, react-dnd, i18next, React Router DOM 7

Builds to a single `index.html` via `vite-plugin-singlefile`.

## Configuration

Location: `~/.claude-code-router/config.json` (JSON5 format)

Key fields:
- `PORT` (default: 3456), `HOST`, `APIKEY`
- `Providers[]` — Array of provider objects (name, api_base_url, api_key, models[], transformer config)
- `Router` — Routing rules (default, background, think, longContext, webSearch, image)
- `transformers[]` — External transformer plugins
- `plugins[]` — Plugin configuration
- `CUSTOM_ROUTER_PATH` — Custom JS router function
- `LOG`, `LOG_LEVEL` — Logging configuration

## Docker Deployment

Multi-stage Dockerfile at `packages/server/Dockerfile`:
- Stage 1 (builder): node:20-alpine, installs pnpm, builds core → shared → server
- Stage 2 (production): node:20-alpine, PM2 + pm2-logrotate, exposes port 3456

## Requirements

- Node.js >= 20.0.0
- pnpm >= 8.0.0
