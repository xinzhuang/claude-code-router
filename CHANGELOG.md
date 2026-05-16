# 更新日志

本项目所有重要变更均记录在此文件中。

格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，
版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/spec/v2.0.0.html)。

## [2.2.0] - 2026-05-16

### 新增

- **日志查看器与调试页的对话视图** — 新增聊天式对话渲染组件，将日志条目以对话气泡形式展示。LogViewer 支持 raw/conversation 视图切换，DebugPage 新增 Conversation 标签页。包含 `ConversationMessage` 和 `ConversationViewer` 组件，带有滑入动画效果。

## [2.1.0] - 2026-05-16

### 新增

- **全场景模型 Fallback** — 当模型返回 HTTP 错误（`provider_response_error`）时，CCR 按顺序依次尝试 fallback 模型，直到成功。支持所有路由场景：`default`、`background`、`think`、`longContext`、`webSearch`。通过 `config.json` 中的 `fallback` 对象配置。

  ```json
  {
    "fallback": {
      "default": ["openrouter,anthropic/claude-sonnet-4", "deepseek,deepseek-chat"],
      "background": ["gemini-cli,gemini-2.5-flash"],
      "think": ["openrouter,anthropic/claude-sonnet-4"],
      "longContext": ["openrouter,anthropic/claude-sonnet-4"],
      "webSearch": ["gemini-cli,gemini-2.5-flash"]
    }
  }
  ```

- **`ccr model` 交互式 fallback 配置** — 交互式模型选择器新增 "Fallback Models" 选项，支持为每个场景（default、background、think、longContext、webSearch）配置 fallback 模型列表，支持添加、移除和清空操作。
- **Web UI fallback 配置** — Router 配置页面新增 fallback 模型管理。每个场景下方展示已配置的 fallback 模型列表（可删除的标签）和添加模型的下拉选择器。支持中英文国际化。
- **配置示例更新** — `config.example.json` 新增所有场景的 `fallback` 配置示例。

### 修复

- 修复 fallback 错误日志中的拼写错误（"yichu" → "scenario"）。

## [2.0.0] - 2026-05-XX

### 亮点

- Monorepo 架构，包含五个包：`core`、`server`、`cli`、`shared`、`ui`。
- 支持 22+ 内置 Transformer，覆盖主流 LLM 提供商（Anthropic、OpenAI、Gemini、DeepSeek、Groq、OpenRouter 等）。
- 预设系统，支持配置的保存、分享和复用。
- Web UI 管理界面。
- 通过 `<CCR-SUBAGENT-MODEL>` 标签实现子代理模型路由。
