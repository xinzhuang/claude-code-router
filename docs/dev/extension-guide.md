# Extension and Secondary Development Guide

This guide covers how to extend Claude Code Router through custom transformers, agents, plugins, routers, and presets.

## Extension Points Overview

| Extension Point | Location | Purpose |
|----------------|----------|---------|
| Custom Transformer | config `transformers[]` or `core/src/transformer/` | Adapt requests/responses for new LLM providers |
| Custom Agent | `server/src/agents/` | Pluggable feature modules with tool injection |
| Custom Plugin | `core/src/plugins/` | Fastify plugins for server capabilities |
| Custom Router | config `CUSTOM_ROUTER_PATH` | Custom request routing logic |
| Preset | config `presets/` or marketplace | Shareable configuration bundles |
| System Prompt Rewrite | config `REWRITE_SYSTEM_PROMPT` | Modify system prompts globally |

---

## 1. Adding a New Transformer

Transformers adapt between the Anthropic API format (Claude Code) and different LLM provider APIs.

### Option A: External Transformer (via config.json)

Create a JavaScript file that exports a `Transformer` object:

```javascript
// my-transformer.js
module.exports = {
  name: "my-transformer",

  async transformRequestIn(request, provider, context) {
    // Adapt internal unified format → provider format
    // request: UnifiedChatRequest
    // Return: provider-specific request body
    return {
      model: request.model,
      messages: request.messages.map(m => ({
        role: m.role,
        content: m.content
      })),
      // ... provider-specific fields
    };
  },

  async transformResponseIn(response, context) {
    // Adapt provider response → internal unified format
    // Return: Anthropic-compatible response
    return {
      id: response.id,
      type: "message",
      content: response.choices[0].message.content,
      // ...
    };
  },

  endPoint: "/chat/completions"  // Provider API endpoint
};
```

Register in `config.json`:

```json
{
  "transformers": [
    {
      "path": "/path/to/my-transformer.js",
      "options": { "customParam": "value" }
    }
  ]
}
```

### Option B: Built-in Transformer (in core package)

1. Create `packages/core/src/transformer/my-provider.transformer.ts`:

```typescript
import { Transformer } from '../types/transformer';

export const MyProviderTransformer: Transformer = {
  name: "my-provider",

  async transformRequestIn(request, provider, context) {
    // Adapt request to my-provider format
    const adapted = {
      model: request.model,
      messages: request.messages,
      // ...
    };
    return adapted;
  },

  async transformResponseIn(response, context) {
    // Adapt my-provider response to unified format
    return adaptedResponse;
  },

  endPoint: "/v1/chat/completions"
};
```

2. Export from `packages/core/src/transformer/index.ts`:

```typescript
export * from './my-provider.transformer';
```

3. Use in provider config:

```json
{
  "Providers": [{
    "name": "my-provider",
    "api_base_url": "https://api.my-provider.com",
    "api_key": "$MY_PROVIDER_KEY",
    "models": ["model-1", "model-2"],
    "transformer": {
      "use": ["my-provider"]
    }
  }]
}
```

### Transformer Interface

```typescript
type Transformer = {
  name?: string;
  endPoint?: string;
  transformRequestIn?: (request, provider, context) => Promise<Record<string, any>>;
  transformResponseIn?: (response, context?) => Promise<Response>;
  transformRequestOut?: (request, context) => Promise<UnifiedChatRequest>;
  transformResponseOut?: (response, context) => Promise<Response>;
  auth?: (request, provider, context) => Promise<any>;
  logger?: any;
};
```

Key methods:
- `transformRequestIn`: Unified format → provider format (outgoing)
- `transformResponseIn`: Provider response → unified format (incoming)
- `transformRequestOut`: Provider format → unified format (for incoming requests)
- `transformResponseOut`: Unified response → provider format (for outgoing responses)
- `auth`: Custom authentication logic
- `endPoint`: API endpoint path appended to `api_base_url`

---

## 2. Adding a New Agent

Agents are pluggable feature modules that can inject tools and intercept tool calls in the SSE stream.

### Agent Interface

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
  input_schema: any;  // JSON Schema for tool parameters
  handler: (args: any, context: any) => Promise<string>;
}
```

### Example: Creating a Search Agent

1. Create `packages/server/src/agents/search.agent.ts`:

```typescript
import { IAgent, ITool } from './type';

export const SearchAgent: IAgent = {
  name: "search",

  tools: new Map<string, ITool>([
    ["webSearch", {
      name: "webSearch",
      description: "Search the web for information",
      input_schema: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search query" }
        },
        required: ["query"]
      },
      handler: async (args, context) => {
        const { query } = args;
        // Implement search logic
        const results = await performSearch(query);
        return JSON.stringify(results);
      }
    }]
  ]),

  shouldHandle(req, config) {
    // Only activate if search is enabled in config
    return config.Router?.webSearch !== undefined;
  },

  reqHandler(req, config) {
    // Modify request before sending to LLM
    // e.g., inject system prompt about search capability
  }
};
```

2. Register in `packages/server/src/agents/index.ts`:

```typescript
import { SearchAgent } from './search.agent';

// In AgentsManager initialization:
this.agents.push(SearchAgent);
```

### Agent Lifecycle

```
1. preHandler hook:
   - For each registered agent:
     - if shouldHandle() → true
     - Call reqHandler() to modify request
     - Inject agent.tools into request body

2. LLM processes request with injected tools

3. onSend hook (SSE stream processing):
   - Parse SSE events from upstream
   - Detect tool_use for agent tools
   - Collect tool arguments
   - Call tool.handler()
   - Append tool_use + tool_result to messages
   - Make new request to /v1/messages
   - Pipe new response back through stream
```

---

## 3. Adding a New Plugin

Plugins are Fastify plugins registered via the PluginManager.

### Plugin Interface

```typescript
interface CCRPlugin {
  name: string;
  version: string;
  register: (fastify: FastifyInstance, options: any) => void;
}
```

### Example: Creating a Rate Limit Plugin

1. Create `packages/core/src/plugins/rate-limit.ts`:

```typescript
import { FastifyInstance } from 'fastify';
import { CCRPlugin } from './types';

export const RateLimitPlugin: CCRPlugin = {
  name: "rate-limit",
  version: "1.0.0",

  register(fastify: FastifyInstance, options: any) {
    const limits = new Map<string, { count: number; resetAt: number }>();

    fastify.addHook('preHandler', async (request, reply) => {
      const key = request.ip;
      const now = Date.now();
      const limit = limits.get(key);

      if (!limit || now > limit.resetAt) {
        limits.set(key, { count: 1, resetAt: now + 60000 });
        return;
      }

      if (limit.count >= options.maxRequests) {
        reply.code(429).send({ error: 'Rate limit exceeded' });
        return;
      }

      limit.count++;
    });
  }
};
```

2. Export from `packages/core/src/plugins/index.ts`

3. Enable in config:

```json
{
  "plugins": [
    { "name": "rate-limit", "enabled": true }
  ]
}
```

---

## 4. Custom Router

Custom routers allow fully custom request routing logic via a JavaScript module.

### Create Router File

```javascript
// custom-router.js
module.exports = function customRouter(req, config, context) {
  const { pathname, body, tokenCount } = context;

  // Example: Route based on custom header
  const priority = req.headers['x-priority'];
  if (priority === 'high') {
    return {
      provider: "premium-provider",
      model: "large-model"
    };
  }

  // Example: Route based on content length
  if (tokenCount > 100000) {
    return {
      provider: "long-context-provider",
      model: "context-200k"
    };
  }

  // Return null to use default routing
  return null;
};
```

### Register in config.json

```json
{
  "CUSTOM_ROUTER_PATH": "/path/to/custom-router.js"
}
```

### Context Object

```typescript
interface RouterContext {
  pathname: string;      // Request URL path
  body: any;             // Request body
  tokenCount: number;    // Estimated token count
  sessionId: string;     // Session ID from request
  config: any;           // Full config object
}
```

---

## 5. System Prompt Rewriting

Modify system prompts globally before they reach the LLM.

### Create rewrite file

```javascript
// rewrite-prompt.js
module.exports = function rewriteSystemPrompt(systemPrompt, context) {
  // Add custom instructions
  return systemPrompt + "\n\nAdditional instructions: Always respond in English.";
};
```

### Register in config.json

```json
{
  "REWRITE_SYSTEM_PROMPT": "/path/to/rewrite-prompt.js"
}
```

---

## 6. Creating and Sharing Presets

Presets are shareable configuration bundles.

### Preset Structure

```
presets/my-preset/
└── manifest.json
```

### manifest.json

```json
{
  "name": "my-preset",
  "version": "1.0.0",
  "description": "My custom configuration",
  "author": "Developer Name",
  "keywords": ["openai", "production"],
  "Providers": [
    {
      "name": "openai",
      "api_base_url": "https://api.openai.com",
      "api_key": "{{apiKey}}",
      "models": ["gpt-4o", "gpt-4o-mini"],
      "transformer": {
        "use": ["openai"]
      }
    }
  ],
  "Router": {
    "default": "openai,gpt-4o",
    "background": "openai,gpt-4o-mini"
  },
  "schema": [
    {
      "id": "apiKey",
      "type": "password",
      "label": "OpenAI API Key",
      "prompt": "Enter your OpenAI API key"
    }
  ]
}
```

### Dynamic Schema

The `schema` field defines input fields for installation:

```json
{
  "schema": [
    {
      "id": "apiKey",
      "type": "password",
      "label": "API Key",
      "prompt": "Enter your API key",
      "required": true
    },
    {
      "id": "region",
      "type": "select",
      "label": "Region",
      "options": ["us", "eu", "asia"],
      "default": "us"
    },
    {
      "id": "model",
      "type": "text",
      "label": "Model Name",
      "condition": {
        "field": "region",
        "equals": "us"
      }
    }
  ]
}
```

### Export/Install

```bash
# Export current config as preset
ccr preset export my-preset

# Install preset from directory
ccr preset install /path/to/preset

# Install from URL
ccr preset install https://example.com/preset.zip

# Install from marketplace
ccr install my-preset

# List presets
ccr preset list
```

---

## 7. Key File Locations for Development

| What | Where |
|------|-------|
| Add transformer | `packages/core/src/transformer/` |
| Add agent | `packages/server/src/agents/` |
| Add plugin | `packages/core/src/plugins/` |
| Modify routing | `packages/core/src/utils/router.ts` |
| Modify API endpoints | `packages/server/src/server.ts` |
| Modify hooks | `packages/server/src/index.ts` |
| Modify SSE processing | `packages/server/src/utils/` or `packages/core/src/utils/sse/` |
| Modify CLI commands | `packages/cli/src/cli.ts` |
| Modify shared constants | `packages/shared/src/constants.ts` |
| Modify UI components | `packages/ui/src/` |
| Config example | `custom-router.example.js` |
| Type definitions | `packages/server/src/types/`, `packages/core/src/types/` |

## 8. Development Workflow

### Running in Development Mode

```bash
# Individual packages
pnpm dev:core      # Core package (tsx watch)
pnpm dev:server    # Server (tsx watch)
pnpm dev:cli       # CLI (tsx watch)
pnpm dev:ui        # UI (Vite dev server)

# Build all
pnpm build

# Build individual
pnpm build:shared
pnpm build:core
pnpm build:server
pnpm build:cli
pnpm build:ui
```

### Adding a New Provider Support

To add support for a new LLM provider:

1. **Create a transformer** in `packages/core/src/transformer/`
2. **Export** from `packages/core/src/transformer/index.ts`
3. **Add provider config** to your `config.json`
4. **Test** with `ccr code`

### Adding New CLI Commands

1. Add command handler in `packages/cli/src/utils/`
2. Register in the switch statement in `packages/cli/src/cli.ts`
3. Rebuild with `pnpm build:cli`
