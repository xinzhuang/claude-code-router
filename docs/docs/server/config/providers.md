---
sidebar_position: 2
---

# Providers Configuration

Detailed guide for configuring LLM providers.

## Supported Providers

### DeepSeek

```json
{
  "NAME": "deepseek",
  "HOST": "https://api.deepseek.com",
  "APIKEY": "your-api-key",
  "MODELS": ["deepseek-chat", "deepseek-coder"],
  "transformers": ["anthropic"]
}
```

### Groq

```json
{
  "NAME": "groq",
  "HOST": "https://api.groq.com/openai/v1",
  "APIKEY": "your-api-key",
  "MODELS": ["llama-3.3-70b-versatile"],
  "transformers": ["anthropic"]
}
```

### Gemini

```json
{
  "NAME": "gemini",
  "HOST": "https://generativelanguage.googleapis.com/v1beta",
  "APIKEY": "your-api-key",
  "MODELS": ["gemini-1.5-pro"],
  "transformers": ["anthropic"]
}
```

### OpenRouter

```json
{
  "NAME": "openrouter",
  "HOST": "https://openrouter.ai/api/v1",
  "APIKEY": "your-api-key",
  "MODELS": ["anthropic/claude-3.5-sonnet"],
  "transformers": ["anthropic"]
}
```

## Provider Configuration Options

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `NAME` | string | Yes | Unique provider identifier |
| `HOST` | string | Yes | API base URL |
| `APIKEY` | string | Yes | API authentication key |
| `MODELS` | string[] | No | List of available models |
| `transformers` | string[] | No | List of transformers to apply |

## Model Selection

When selecting a model in routing, use the format:

```
{provider-name},{model-name}
```

For example:

```
deepseek,deepseek-chat
```

## Anthropic-Compatible Providers

Many Chinese LLM providers now offer Anthropic Messages API-compatible endpoints. These providers accept requests in Anthropic format directly, enabling **passthrough mode** with zero format conversion overhead.

### How It Works

Configure the provider with the `Anthropic` transformer and `UseBearer: true` option:

```json
{
  "name": "zhipu-anthropic",
  "api_base_url": "https://open.bigmodel.cn/api/anthropic/v1/messages",
  "api_key": "your-api-key",
  "models": ["glm-4-plus", "glm-4-flash"],
  "transformer": {
    "use": [
      ["Anthropic", {"UseBearer": true}]
    ]
  }
}
```

When the `Anthropic` transformer is the only transformer for a provider and matches the endpoint transformer (`/v1/messages`), the server automatically enters **passthrough mode**:

1. Incoming Anthropic-format request passes through unmodified
2. Auth header switches from `x-api-key` to `Authorization: Bearer` (via `UseBearer`)
3. Request is sent directly to the provider's `api_base_url`
4. Response is returned as-is to the client

### Configuration Options

| Option | Value | Description |
|--------|-------|-------------|
| `UseBearer` | `true` | Use `Authorization: Bearer` header (required for most third-party providers) |
| `UseBearer` | `false` (default) | Use `x-api-key` header (standard Anthropic API auth) |

### Supported Providers

Templates are available in the UI (Provider edit dialog > "Import from template") and CLI (`ccr model` > Add New Provider > Select from template):

- **zhipu-anthropic** (智谱): `https://open.bigmodel.cn/api/anthropic/v1/messages`
- **xiaomi-mimo** (小米): `https://api.xiaomimimo.com/anthropic/v1/messages`

## Next Steps

- [Routing Configuration](/docs/config/routing) - Configure how requests are routed
- [Transformers](/docs/config/transformers) - Apply transformations to requests
