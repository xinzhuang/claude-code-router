# Core Package (@musistudio/llms) Deep Dive

## Overview

`@musistudio/llms` is a **reusable, publishable npm package** providing a universal LLM API transformation server. It is **not CCR-specific** — it can be used independently to build any LLM proxy/gateway.

- **Version**: 1.0.51
- **Module type**: ESM with dual CJS/ESM exports
- **Entry**: `dist/cjs/server.cjs` (CJS) and `dist/esm/server.mjs` (ESM)

## Source Structure

```
packages/core/src/
├── server.ts                          Main Server class (Fastify wrapper)
├── api/
│   ├── routes.ts                      API route handlers, transformer endpoint logic
│   └── middleware.ts                  Error handling middleware
├── services/
│   ├── config.ts                      ConfigService — JSON5, env vars, .env loading
│   ├── provider.ts                    ProviderService — provider registry, model routing
│   ├── transformer.ts                 TransformerService — transformer registry and initialization
│   └── tokenizer.ts                   TokenizerService — tiktoken/huggingface/api tokenizers
├── transformer/
│   ├── index.ts                       Exports all 21 built-in transformers
│   ├── anthropic.transformer.ts       Anthropic API format
│   ├── openai.transformer.ts          OpenAI Chat Completions API
│   ├── openai.responses.transformer.ts OpenAI Responses API
│   ├── deepseek.transformer.ts        DeepSeek API format
│   ├── gemini.transformer.ts          Google Gemini API format
│   ├── vertex-gemini.transformer.ts   Vertex AI Gemini format
│   ├── vertex-claude.transformer.ts   Vertex AI Claude format
│   ├── groq.transformer.ts            Groq API format
│   ├── openrouter.transformer.ts      OpenRouter API format
│   ├── cerebras.transformer.ts        Cerebras API format
│   ├── vercel.transformer.ts          Vercel AI format
│   ├── tooluse.transformer.ts         Tool use format adaptation
│   ├── maxtoken.transformer.ts        Max tokens parameter handling
│   ├── maxcompletiontokens.transformer.ts Max completion tokens
│   ├── reasoning.transformer.ts       Reasoning/thinking mode
│   ├── forcereasoning.transformer.ts  Force reasoning mode
│   ├── sampling.transformer.ts        Sampling parameters
│   ├── enhancetool.transformer.ts     Enhanced tool descriptions
│   ├── cleancache.transformer.ts      Cache control cleanup
│   ├── streamoptions.transformer.ts   Stream options adaptation
│   └── customparams.transformer.ts    Custom parameter injection
├── plugins/
│   ├── index.ts                       Plugin exports
│   ├── plugin-manager.ts              PluginManager singleton
│   ├── token-speed.ts                 Token speed measurement plugin
│   ├── types.ts                       CCRPlugin, PluginMetadata interfaces
│   └── output/
│       ├── index.ts                   OutputManager exports
│       ├── output-manager.ts          Output routing manager
│       ├── console-handler.ts         Console output handler
│       ├── temp-file-handler.ts       Temp file output handler
│       ├── webhook-handler.ts         Webhook output handler
│       └── types.ts                   Output handler types
├── tokenizer/
│   ├── tiktoken-tokenizer.ts          Tiktoken-based (cl100k_base)
│   ├── huggingface-tokenizer.ts       HuggingFace model tokenizer
│   └── api-tokenizer.ts              API-based tokenizer
├── types/
│   ├── llm.ts                         Unified type definitions
│   ├── transformer.ts                 Transformer interface
│   └── tokenizer.d.ts                 Tokenizer interfaces
└── utils/
    ├── router.ts                      Request routing logic (getUseModel)
    ├── cache.ts                       LRU cache for session usage
    ├── request.ts                     Unified HTTP sender (proxy, HTTPS support)
    ├── converter.ts                   Format converters
    ├── gemini.util.ts                 Gemini-specific utilities
    ├── image.ts                       Image processing utilities
    ├── thinking.ts                    Thinking/reasoning utilities
    ├── toolArgumentsParser.ts         Tool argument parsing
    ├── vertex-claude.util.ts          Vertex Claude utilities
    └── sse/
        ├── SSEParser.transform.ts     Parse SSE text → event objects
        ├── SSESerializer.transform.ts Event objects → SSE text
        └── rewriteStream.ts          Intercept/modify ReadableStream
```

## Key Types

### Transformer Interface (`types/transformer.ts`)

```typescript
export type Transformer = {
  transformRequestIn?: (request: any, provider: any, context: any) => Promise<Record<string, any>>;
  transformResponseIn?: (response: any, context?: any) => Promise<Response>;
  transformRequestOut?: (request: any, context: any) => Promise<UnifiedChatRequest>;
  transformResponseOut?: (response: any, context: any) => Promise<Response>;
  endPoint?: string;
  name?: string;
  auth?: (request: any, provider: any, context: any) => Promise<any>;
  logger?: any;
};
```

### UnifiedChatRequest (`types/llm.ts`)

```typescript
interface UnifiedChatRequest {
  messages: UnifiedMessage[];
  model: string;
  max_tokens?: number;
  temperature?: number;
  stream?: boolean;
  tools?: UnifiedTool[];
  tool_choice?: "auto" | "none" | "required" | string | { type: string; ... };
  reasoning?: { effort?: ThinkLevel; max_tokens?: number; enabled?: boolean };
}
```

### LLMProvider (`types/llm.ts`)

```typescript
interface LLMProvider {
  name: string;
  baseUrl: string;
  apiKey: string;
  models: string[];
  transformer?: {
    use?: Transformer[];
    [modelName: string]: { use?: Transformer[] };
  };
}
```

### ModelRoute / RequestRouteInfo

```typescript
interface ModelRoute {
  provider: string;
  model: string;
  baseUrl: string;
  apiKey: string;
}

interface RequestRouteInfo {
  provider: LLMProvider;
  model: string;
  route: ModelRoute;
}
```

## Server Class (`server.ts`)

The main Server class wraps Fastify and provides:

```typescript
class Server {
  // Core properties
  fastify: FastifyInstance;
  config: ConfigService;
  providers: ProviderService;
  transformers: TransformerService;
  tokenizers: TokenizerService;

  // Methods
  registerNamespace(name: string, config: Config): void;
  start(): Promise<void>;
}
```

### Namespace System

Each namespace gets its own isolated set of services:
- `ConfigService` — independent config
- `ProviderService` — independent provider registry
- `TransformerService` — independent transformer registry
- `TokenizerService` — independent tokenizer

This enables presets to have completely isolated configurations.

## Services

### ConfigService (`services/config.ts`)

```typescript
class ConfigService {
  constructor(filePath: string, initialConfig?: Record<string, any>);
  get(key: string): any;
  set(key: string, value: any): void;
  getAll(): Record<string, any>;
  reload(): void;
  getHttpsProxy(): string | undefined;
}
```

Features:
- Reads JSON5 config files
- Supports `.env` file loading
- Merges with initial config passed at construction
- Environment variable interpolation

### ProviderService (`services/provider.ts`)

```typescript
class ProviderService {
  providers: Map<string, LLMProvider>;

  register(provider: LLMProvider): void;
  get(name: string): LLMProvider | undefined;
  resolveModel(modelRoute: string): RequestRouteInfo;
  list(): LLMProvider[];
}
```

Model resolution: `resolveModel("provider,model")` returns the full route info including baseUrl and apiKey.

### TransformerService (`services/transformer.ts`)

```typescript
class TransformerService {
  transformers: Map<string, Transformer>;

  register(transformer: Transformer): void;
  get(name: string): Transformer | undefined;
  init(providerConfig: any): void;  // Initialize from config
}
```

Initialization reads the provider's `transformer` config:
- `transformer.use[]` — applied to all models
- `transformer.<model>.use[]` — applied to specific models

### TokenizerService (`services/tokenizer.ts`)

```typescript
class TokenizerService {
  tokenize(text: string, model?: string): Promise<number>;
  // Supports: tiktoken (default), huggingface, api
}
```

Three tokenizer backends:
1. **tiktoken** (default) — Uses cl100k_base encoding
2. **huggingface** — Model-specific tokenization via @huggingface/tokenizers
3. **api** — Token counting via external API call

## Routing System (`utils/router.ts`)

See [data-flow.md](./data-flow.md#routing-decision-tree) for the full decision tree.

Token calculation uses `tiktoken` (cl100k_base) to estimate request size. The tokenizer is registered as a Fastify `preHandler` hook at namespace level.

### Session-to-Project Mapping

`searchProjectBySession(sessionId)` scans `~/.claude/projects/` directories for `{sessionId}.jsonl` files with LRU caching (1000 entries). This enables per-project routing overrides.

## Plugin System

### PluginManager (`plugins/plugin-manager.ts`)

```typescript
class PluginManager {
  private plugins: Map<string, CCRPlugin>;

  register(plugin: CCRPlugin, fastify: FastifyInstance): void;
  get(name: string): CCRPlugin | undefined;
}
```

### CCRPlugin Interface (`plugins/types.ts`)

```typescript
interface CCRPlugin {
  name: string;
  version: string;
  register(fastify: FastifyInstance, options: any): void;
}
```

### Built-in Plugin: token-speed

Measures and reports tokens/second for streaming responses. Registered globally via `fastify-plugin`.

## Build Configuration

Dual CJS/ESM build via esbuild (`scripts/build.ts`):

```javascript
// CJS output
esbuild.build({
  entryPoints: ['src/server.ts'],
  outfile: 'dist/cjs/server.cjs',
  format: 'cjs',
  platform: 'node',
  // External: fastify, dotenv, tiktoken, etc.
});

// ESM output
esbuild.build({
  entryPoints: ['src/server.ts'],
  outfile: 'dist/esm/server.mjs',
  format: 'esm',
  platform: 'node',
  // Same externals
});
```

Custom `pathAliasPlugin` resolves `@/*` imports to `src/*`.

## Dependencies

Runtime dependencies:
- `fastify` — HTTP server framework
- `@fastify/cors` — CORS support
- `tiktoken` — Token counting
- `@huggingface/tokenizers` — Alternative tokenizer
- `@anthropic-ai/sdk` — Anthropic API client
- `openai` — OpenAI API client
- `@google/genai` — Google Gemini API client
- `google-auth-library` — Google auth for Vertex AI
- `json5` — JSON5 config parsing
- `jsonrepair` — JSON repair utility
- `lru-cache` — LRU caching
- `undici` — HTTP client
- `uuid` — UUID generation
- `dotenv` — .env file loading
