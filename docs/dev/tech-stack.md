# 模块技术栈分析

## 概览

```
core (ESM)    server (CJS)   shared (CJS)   cli (CJS)        ui (ESM)
Fastify       Fastify        零框架依赖      esbuild bundle   React 19
esbuild 双输出 esbuild        esbuild        minimist         Vite 7
tiktoken      rotating-file  json5          inquirer         Tailwind 4
多 LLM SDK    lru-cache      archiver       find-process     Radix UI
                             adm-zip        archiver         Monaco
                                                             cmdk
```

---

## core — @musistudio/llms

通用 LLM API 转换框架。唯一作为独立 npm 库发布的包。

| 分类 | 技术 | 版本 | 用途 |
|------|------|------|------|
| **运行时** | Node.js | >= 18 | 目标平台 |
| **模块系统** | ESM (`"type": "module"`) | — | 双格式输出 (CJS/ESM) |
| **HTTP 框架** | Fastify | ^5.4.0 | 高性能 HTTP 服务器 |
| **插件系统** | fastify-plugin | ^5.1.0 | 打破 Fastify 封装，注册全局插件 |
| **跨域** | @fastify/cors | ^11.0.1 | 跨域请求支持 |
| **分词器** | tiktoken | ^1.0.21 | Token 计数 (cl100k_base, 基于 WASM) |
| **分词器** | @huggingface/tokenizers | ^0.0.6 | 模型专属分词 |
| **LLM SDK** | @anthropic-ai/sdk | ^0.54.0 | Anthropic API 客户端 |
| **LLM SDK** | openai | ^5.6.0 | OpenAI API 客户端 |
| **LLM SDK** | @google/genai | ^1.7.0 | Google Gemini API 客户端 |
| **认证** | google-auth-library | ^10.1.0 | Vertex AI 身份认证 |
| **HTTP 客户端** | undici | ^7.10.0 | HTTP/1.1 客户端 (Node.js 原生) |
| **配置** | json5 | ^2.2.3 | JSON5 解析（支持注释、尾逗号） |
| **配置** | dotenv | ^16.5.0 | .env 文件加载 |
| **工具** | lru-cache | ^11.2.2 | LRU 缓存（会话用量、项目映射） |
| **工具** | uuid | ^11.1.0 | UUID 生成 |
| **工具** | jsonrepair | ^3.13.0 | 修复上游返回的畸形 JSON |
| **构建** | esbuild | ^0.25.1 | 双格式 CJS/ESM 打包 |
| **构建** | tsx | ^4.20.3 | 构建脚本中的 TypeScript 执行器 |
| **语言** | TypeScript | ^5.8.2 | 严格模式, ES2022 目标 |

### 选型理由

- **Fastify 替代 Express**: 吞吐量高 2-3 倍，内置 pino 日志、插件封装机制。作为处理高并发 SSE 流的代理服务器，性能至关重要。
- **tiktoken**: OpenAI 官方分词器，基于 WASM 保证精度。cl100k_base 编码对 GPT-4/Claude 的路由决策足够准确。
- **undici 替代 axios/node-fetch**: Node.js 原生 HTTP 客户端，开销更低，流式支持更好，无需额外依赖。
- **三个 LLM SDK**: 与各供应商类型安全地交互，避免手动构建复杂请求体。
- **lru-cache**: 零依赖、高性能内存缓存，用于会话-项目映射（1000 条目）和图片数据缓存（100 条目）。
- **ESM + 双格式构建**: core 以 ESM 为主满足现代消费方需求，同时输出 CJS 确保旧版 Node.js 工具兼容。
- **esbuild 双输出**: 自定义构建脚本 (`scripts/build.ts`) 并行生成 `dist/cjs/server.cjs` 和 `dist/esm/server.mjs`。外置重型依赖（fastify、tiktoken）以减小产物体积。

### 构建流程

```
tsx scripts/build.ts
  ├─ esbuild → dist/cjs/server.cjs  (CommonJS)
  ├─ esbuild → dist/esm/server.mjs  (ESM)
  └─ 自定义 pathAliasPlugin 解析 @/* → src/*
     外置: fastify, dotenv, @fastify/cors, undici, tiktoken, lru-cache
```

---

## server — @CCR/server

核心服务器，负责 API 路由、Agent 管理和 SSE 流处理。在 `@musistudio/llms` Server 基础上添加 CCR 专属端点。

| 分类 | 技术 | 版本 | 用途 |
|------|------|------|------|
| **运行时** | Node.js | >= 20 | 目标平台 |
| **模块系统** | CommonJS | — | 标准 Node.js 模块 |
| **框架** | @musistudio/llms | workspace:* | 核心 LLM 服务器（Fastify 封装） |
| **静态文件** | @fastify/static | ^8.2.0 | 在 /ui/ 路径提供 UI HTML |
| **文件上传** | @fastify/multipart | ^9.0.0 | 文件上传支持 |
| **日志** | rotating-file-stream | ^3.2.7 | 兼容 Pino 的日志文件轮转 |
| **分词器** | tiktoken | ^1.0.21 | Token 计数 |
| **缓存** | lru-cache | ^11.2.2 | 图片数据缓存（Agent 系统） |
| **压缩** | adm-zip | ^0.5.16 | 预设 ZIP 处理 |
| **配置** | json5 | ^2.2.3 | JSON5 配置解析 |
| **配置** | dotenv | ^16.4.7 | .env 加载 |
| **安全** | shell-quote | ^1.8.3 | Shell 参数转义，防止注入 |
| **工具** | uuid | ^11.1.0 | UUID 生成 |
| **构建** | esbuild | ^0.25.1 | 单文件打包 |
| **开发** | ts-node | ^10.9.2 | 开发模式 |

### 选型理由

- **rotating-file-stream**: 兼容 Pino 日志格式，无原生依赖。按日轮转，最多 3 个文件 × 50MB，磁盘占用可控。
- **@fastify/static + @fastify/multipart**: Fastify 官方生态插件。`static` 用于提供单文件 UI HTML；`multipart` 处理预设安装时的文件上传。
- **adm-zip**: 同步方式处理 ZIP 导入导出，轻量纯 JS，无原生依赖。
- **shell-quote**: 在 CLI 激活命令中构建环境变量时防止 Shell 注入。
- **tiktoken + lru-cache 重复声明**: server 独立于 core 自行打包，esbuild 将所有依赖内联到单个 `dist/index.js`。

### 构建流程

```
node scripts/build-server.js
  ├─ tsc --emitDeclarationOnly  → dist/*.d.ts
  ├─ esbuild → dist/index.js   (单文件打包，压缩)
  └─ 复制 tiktoken_bg.wasm → dist/
```

---

## cli — @CCR/cli

命令行工具，提供 `ccr` 命令。将 server + shared 及所有依赖打包为单个可执行文件。

| 分类 | 技术 | 版本 | 用途 |
|------|------|------|------|
| **运行时** | Node.js | >= 20 | 目标平台 |
| **模块系统** | CommonJS | — | 标准 Node.js CLI |
| **参数解析** | minimist | ^1.2.8 | 轻量 argv 解析器 |
| **交互提示** | @inquirer/prompts | ^5.0.0 | 模型选择 TUI |
| **进程管理** | find-process | ^2.0.0 | 跨平台 PID 查找 |
| **浏览器** | openurl | ^1.1.1 | 在默认浏览器打开 URL |
| **压缩** | archiver | ^7.0.1 | ZIP 创建（预设导出） |
| **压缩** | adm-zip | ^0.5.16 | ZIP 读取（预设导入） |
| **构建** | esbuild | ^0.25.1 | 单文件打包 |
| **开发** | ts-node | ^10.9.2 | 开发模式 |

### 选型理由

- **minimist 替代 commander/yargs**: 零依赖，体积极小。CLI 只有扁平命令（`ccr start/stop/restart/status/code...`），不需要嵌套子命令或复杂参数解析。
- **@inquirer/prompts**: 提供丰富的交互式 TUI，包括 select、confirm、input 等带键盘导航的提示。
- **find-process**: 跨平台进程查找（含 Windows `tasklist`），用于验证服务器 PID 是否存活。
- **archiver（流式） + adm-zip（同步）**: archiver 用于导出（流式 ZIP 创建），adm-zip 用于导入（随机访问 ZIP 读取）。针对不同访问模式选择不同工具。
- **esbuild 全量打包**: `cli.js` 是自包含的单文件（数 MB），内含 server、shared 及所有 JS 依赖。仅 `tiktoken_bg.wasm` 和 `index.html`（UI）作为独立文件。

### 构建流程

```
node scripts/build-cli.js
  ├─ 确认 shared 已构建
  ├─ 构建 server（依赖）
  ├─ 构建 UI（依赖）
  ├─ esbuild → dist/cli.js  (打包全部: cli + server + shared)
  ├─ 复制 tiktoken_bg.wasm → dist/
  ├─ 复制 UI index.html → dist/
  └─ 复制 dist/ → 项目根 dist/  (npm bin 入口: dist/cli.js)
```

---

## shared — @CCR/shared

纯工具库。零框架依赖，仅做数据处理。

| 分类 | 技术 | 版本 | 用途 |
|------|------|------|------|
| **配置** | json5 | ^2.2.3 | 预设 manifest 的 JSON5 解析 |
| **压缩** | archiver | ^7.0.1 | ZIP 创建（预设导出） |
| **压缩** | adm-zip | ^0.5.16 | ZIP 读取（预设导入） |
| **构建** | esbuild | ^0.25.1 | 单文件打包 |

### 选型理由

- **极简依赖**: 仅 3 个运行时依赖。被 cli、server、core 共同消费，保持精简可避免依赖冲突。
- **无框架引入**: 无 Fastify、无 HTTP、无文件系统监听。纯数据转换（预设合并、配置脱敏、模板变量替换）。
- **json5**: 预设 manifest 使用 JSON5 格式以支持注释和可读性。由 shared 统一提供解析，确保所有消费方行为一致。

### 构建流程

```
node scripts/build-shared.js
  ├─ tsc --emitDeclarationOnly  → dist/*.d.ts
  └─ esbuild → dist/index.js   (单文件打包，压缩)
```

---

## ui — @CCR/ui

Web 管理界面。独立 React SPA，仅通过 REST API 与服务器通信。

| 分类 | 技术 | 版本 | 用途 |
|------|------|------|------|
| **框架** | React | ^19.1.0 | UI 库 |
| **渲染** | ReactDOM | ^19.1.0 | DOM 渲染 |
| **路由** | react-router-dom | ^7.7.0 | SPA 路由（MemoryRouter） |
| **构建** | Vite | ^7.0.4 | 快速开发服务器 + 生产构建 |
| **单文件** | vite-plugin-singlefile | ^2.3.0 | 将所有 JS/CSS 内联到单个 HTML |
| **CSS** | Tailwind CSS | ^4.1.11 | 原子化 CSS 框架 |
| **CSS 插件** | @tailwindcss/vite | ^4.1.11 | Tailwind Vite 集成 |
| **CSS 动画** | tailwindcss-animate | ^1.0.7 | 动画工具类 |
| **CSS 合并** | tailwind-merge | ^3.3.1 | 合并 Tailwind class 不产生冲突 |
| **CSS 工具** | class-variance-authority | ^0.7.1 | 组件变体系统 |
| **CSS 工具** | clsx | ^2.1.1 | 条件 className 拼接 |
| **CSS 后处理** | tw-animate-css | ^1.3.5 | 动画 CSS 工具 |
| **UI 原语** | @radix-ui/react-* | 各异 | 无障碍 Headless UI 组件（8 个包） |
| **代码编辑器** | @monaco-editor/react | ^4.7.0 | JSON 配置编辑器 |
| **命令面板** | cmdk | ^1.1.1 | 键盘优先的命令面板 (Cmd+K) |
| **拖拽排序** | react-dnd + react-dnd-html5-backend | ^16.0.1 | Provider 列表拖拽重排 |
| **颜色选择** | react-colorful | ^5.6.1 | 状态栏配色 |
| **图标** | lucide-react | ^0.525.0 | 图标库 |
| **图标** | remixicon | ^4.7.0 | 补充图标库 |
| **国际化** | i18next | ^25.3.2 | 国际化框架 |
| **国际化** | react-i18next | ^15.6.1 | React i18n 绑定 |
| **国际化** | i18next-browser-languagedetector | ^8.2.0 | 自动检测浏览器语言 |
| **语言** | TypeScript | ~5.8.3 | 严格模式, ESNext 模块, react-jsx |
| **代码检查** | ESLint + typescript-eslint | ^9.30.1 / ^8.35.1 | 代码质量 |

### 选型理由

- **React 19**: 最新稳定版，性能提升，支持 use() hook。作为全新 SPA 无需考虑旧版兼容。
- **Vite 7**: 最快的开发体验。原生 ESM、即时 HMR，完全替代 webpack。
- **vite-plugin-singlefile**: 关键架构选择。将整个 SPA 构建为单个 `index.html`（JS/CSS 全部内联）。该文件被复制到 CLI 的 dist 目录，由 Fastify 在 `/ui/` 路径下提供。无需独立资源服务，无 CORS 问题，部署零复杂度。
- **Tailwind CSS 4**: 新引擎（基于 Rust），构建更快。`@tailwindcss/vite` 替代 PostCSS 插件，性能更优。
- **Radix UI 替代直接使用 shadcn/ui**: 无障碍 Headless 原语。项目在 `src/ui/` 中遵循 shadcn 模式自建组件库，但直接导入 Radix。
- **cmdk**: 为高级用户提供命令面板 (Cmd+K)，契合开发者工具的调性。
- **Monaco Editor**: VS Code 级别的 JSON 编辑器，支持语法高亮、校验、自动补全。依赖较大（~2MB），但对于配置编辑场景物有所值。
- **react-dnd**: Provider 列表的拖拽排序。HTML5 backend 确保浏览器兼容性。
- **MemoryRouter**: 使用 React Router 的 MemoryRouter（而非 BrowserRouter），因为 SPA 从单个 HTML 文件提供服务，无需服务端路由支持。
- **i18next**: 业界标准国际化方案。支持中英文，自动检测浏览器语言。
- **react-colorful**: 轻量（~2KB）颜色选择器，用于状态栏主题配色。

### 构建流程

```
tsc -b && vite build
  ├─ React 插件
  ├─ Tailwind CSS 插件
  └─ viteSingleFile 插件
  → dist/index.html  (单文件，所有 JS/CSS 已内联)
```

---

## 横切关注点

### TypeScript 配置对比

| 包 | 目标 | 模块 | 严格模式 | 特殊配置 |
|----|------|------|----------|----------|
| **base** | ES2022 | CommonJS | 是 | core/server/shared/cli 共享 |
| **core** | ES2022 | CommonJS | 是 | `baseUrl: ./src`，路径别名 `@/*` |
| **ui** | ES2022 | ESNext | 是 | `"jsx": "react-jsx"`，`moduleResolution: bundler`，DOM lib |

### 构建工具对比

| 包 | 工具 | 产物 | 打包策略 |
|----|------|------|----------|
| **core** | esbuild（自定义脚本） | 双格式 `.cjs` + `.mjs` | 外置 fastify、tiktoken、lru-cache |
| **server** | esbuild | 单文件 `index.js` | 全量打包，复制 tiktoken WASM |
| **shared** | esbuild | 单文件 `index.js` | 全量打包 |
| **cli** | esbuild | 单文件 `cli.js` | 打包 cli + server + shared，复制 WASM + UI HTML |
| **ui** | Vite | 单文件 `index.html` | 内联所有 JS/CSS，Tailwind 编译 |

### 依赖重叠

因各包独立打包，以下依赖在多个包中重复声明：

| 依赖 | core | server | cli | shared |
|------|------|--------|-----|--------|
| tiktoken | ✓ | ✓ | — | — |
| lru-cache | ✓ | ✓ | — | — |
| json5 | ✓ | ✓ | — | ✓ |
| adm-zip | — | ✓ | ✓ | ✓ |
| archiver | — | — | ✓ | ✓ |
| dotenv | ✓ | ✓ | — | — |
| uuid | ✓ | ✓ | — | — |

此重叠源于各包独立打包机制。运行时仅 cli 的打包产物生效（已内含 server + shared），因此重复声明不产生实际开销。

### 运行时依赖 vs 开发依赖策略

- **core**: LLM SDK 和 fastify 为**运行时**依赖 — 作为独立库使用时需要
- **server**: @musistudio/llms 为**运行时**依赖；shared 为**开发**依赖（构建时打包）
- **cli**: server 和 shared 均为**开发**依赖 — esbuild 将它们打包进单个产物
- **shared**: 无框架依赖
- **ui**: 完全独立，无 workspace 包依赖
