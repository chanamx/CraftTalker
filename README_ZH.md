# CraftTalker（语琢）

[English](README.md) | **中文**

最后更新：2026-07-07

CraftTalker / 语琢是一个面向 SillyTavern 兼容资产的现代化角色扮演聊天应用，当前技术栈是 React/Vite + Hono。它是独立产品，不是 Luker UI 的薄封装，也不是宽泛的 SillyTavern/Luker 代理。当前方向是保持 CraftTalker 原生体验快速、清晰、类型化，同时保留 ST 数据、增加边界明确的 ST 兼容桥，并为未来 Harness 运行时留出空间。

> 当前状态：活跃开发中。原生应用、Provider 系统、数据适配层和面向目标插件的 ST 兼容宿主已经可用；完整 SillyTavern Prompt/运行时行为兼容，以及长期 Harness 运行时，都还没有完成。

## 当前亮点

- 现代化聊天界面：React 19、Vite 8、Tailwind CSS v4、framer-motion、lucide 图标、React Router、TanStack Query、Zustand、i18next、懒加载弹窗路由和 ErrorBoundary 覆盖。
- 通过 `NativeEngine` 进行 SSE 聊天生成：前端按聊天维护流状态，后端按聊天加生成锁，支持停止、重新生成、继续、Swipe、编辑/删除、聊天重命名和可恢复生成记录。
- Provider 目录覆盖 OpenAI-compatible、Claude/Anthropic、Gemini、Azure OpenAI、Ollama 原生、LM Studio、vLLM、llama.cpp、常见中转/聚合服务和协议固定的自定义入口。新输入的 API Key 通过 `/api/llm-sessions` 进入服务端临时会话，前端设置保存 session id 而不是新输入的明文 key。
- Markdown 渲染支持 GFM、DOMPurify allow-list、安全外链、懒加载 Shiki 高亮和 KaTeX 数学公式。
- ST-compatible public script shims、扩展资源服务、懒加载前端 ST extension host、兼容抽屉、DOM anchors/mirrors、插件诊断，以及可选的 `npm run audit:st-shims` named-export 审计。
- Hono 后端同时提供原生 API 和受限 ST-compatible 表面：characters、chats、worlds、presets、engine、runs、LLM sessions/models、extensions、chat-completions backends、worldinfo、tokenizers、files、avatars、image-backend pings、root scripts、`/version`、`/thumbnail`、`/user/files`、`/User Avatars` 和 `/cors`。

## 兼容性现实

CraftTalker 的目标是强 SillyTavern 兼容，但不应被描述为“100% ST 兼容”。当前实现明确分层：

- ST 数据兼容：在当前适配器覆盖范围内保留文件形状、未知字段、扩展负载和原始资产语义。
- ST 行为兼容：重要行为通过显式兼容模块、路由和诊断实现或桥接。
- CraftTalker 原生体验：React/Hono 工作流和类型化服务，不依赖 ST globals 或 ST DOM ids。
- Harness 未来：独立 RP 运行时，包含状态、记忆、工具、事件日志、验证、产物和显式 commit 边界。

当前已实现或部分实现：

| 范围 | 当前状态 |
| --- | --- |
| 角色卡与资产 | 支持 PNG `chara` 与 V3 `ccv3` 读取；V3 PNG 写入同时写 `chara` 和 `ccv3`；JSON 导入/导出经过 ST-like 序列化。常见 V2/V3 未知字段、`assets`、group greetings、nickname、扩展负载和 `extensions.regex_scripts` 会被保留。导入 PNG 卡保留为 `character.png`；自定义显示头像使用 `avatar.png`；头像/卡片读取已有 ST 风格 `/characters/<name>.png` 和 `/thumbnail` 兼容。 |
| 角色 API | 保留原生 CRUD/export 路由，同时提供受限 ST 风格 multipart `/api/characters/import`、FormData `/api/characters/create` 与 `/api/characters/edit`、只读 `POST /api/characters/export`，以及常见插件状态使用的 typed `data.extensions` 写回。宽泛任意角色修改仍不开放。 |
| 聊天 JSONL | 编辑、Swipe 和 message-variable 路径会保留 metadata 与未知消息字段。新消息使用 ISO send date。已支持 Swipe、Continue、Regenerate、重命名、特定 ST 查询的 raw JSONL 读取、受限 JSONL 导入，以及 typed message `variables` / `variables_initialized` 持久化。Group chat 在有真实模型前明确阻断。 |
| 生成与 runs | 按聊天加锁保护 send/stream/regenerate/continue。生成记录持久化到 `data/runs/`，包含状态、partial content、错误、时间戳和已提交行号。runs 明确不保存 API key、prompt、messages、session id 或完整请求配置。可恢复 partial run 可通过 `/api/runs` commit 或 discard。 |
| World info | 生成与 public prompt check 共享 `world-info-runtime.service.ts`。支持 character/global/chat/persona 来源、tokenizer budget、宏、scan inject、forced/vector activation metadata、sticky/cooldown timing 和 ST-shaped `/api/worldinfo/check`。ST world-info position 现在覆盖 `0-7`，其中 `7=outlet`。vectorized entries 在真实向量运行时完成前仍会跳过。 |
| 世界书 | 支持 `extensions.world` 主绑定、通过受限 `extensions.worlds` 的额外绑定、启用的全局世界书、绑定/解绑、ST-shaped settings、创建空世界书、保存已有世界书、内存 entry helpers 和 global selection bridges。整本删除、任意 settings 写入和不安全 world-info mutation 仍然阻断。 |
| 预设 | 生成预设继续使用 ST 风格 `.settings` 目录。模板预设目录 `instruct`、`context`、`sysprompt`、`reasoning` 以 raw JSON 存储并保留未知字段，包括 preset-level `regex_scripts`。 |
| Provider 兼容 | 原生生成和 ST host chat-completions bridge 共用 provider catalog 与 body builders。OpenAI-compatible、OpenAI Responses、Claude Messages、Gemini generateContent、Azure deployment chat 和 Ollama native chat 都是显式格式。Vertex 等未实现表面会明确失败，而不是静默路由到错误 provider。 |
| ST 扩展 | 支持 local/system/global 扩展发现、manifest/resource serving、compatibility report、settings persistence、只读 version snapshot、public shims、popup/dialog 兼容、slash-command fallback、tags/persona/group-name facade、chat-completions service bridge、扩展设置抽屉，以及对本地审计集 JS-Slash-Runner、LittleWhiteBox、ST-Prompt-Template 的 smoke 覆盖。这是部分运行时兼容，不是完整任意扩展兼容。 |
| 文件、头像、媒体、代理 | Extension-owned `/user/files` 与 `/api/files/*` 存储限制在安全文件名/类型内。Persona avatars 使用受限 `/api/avatars/*` 和 `/User Avatars/*` 桥。消息媒体渲染是 DOM-only 兼容。通用 `/cors` 与 SD/Comfy ping 默认 fail-closed，只有设置显式 allowlist 环境变量后才允许窄范围可信探测。 |
| Harness | Harness 方向已有文档，但还不是已完成运行时。当前代码应理解为原生应用加兼容桥。 |

## 安全与可靠性

当前加固包括：

- `server/src/lib/path-utils.ts` 通过 `path.relative` 做路径包含校验。
- 角色导入限制为 `.png` 和 `.json`；直接路径导入限制在 `LUKER_IMPORT_DIR` 或临时导入目录。
- 上传临时文件使用 `safePath` 和 `randomUUID`；user files、persona avatars、extension resources、character assets 和兼容代理路径都会校验文件名与 base containment。
- Markdown/XSS 加固：DOMPurify allow-list、清洗后的高亮 HTML、剥离危险协议/样式/事件处理器，以及安全外链。
- 第一阶段服务端 LLM key session 通过 `/api/llm-sessions` 实现；旧客户端加密设置仍作为迁移/本地存储支持存在。
- CORS 与 CSRF 共用 `server/src/config/origins.ts`；CSRF 在非 `test` 和 `development` 环境启用。
- Extension management、通用 CORS proxy、SD/Comfy proxy、group chat 和 unsafe script execution 默认 fail-closed，除非存在窄范围可信桥。
- Vite/Rolldown 已配置 build input 和 vendor splitting；最新已知构建无大 chunk 警告，ST extension host 保持为懒加载 async chunk。

仍需重点推进：

- 内存型 LLM key sessions 需要升级为生产级 vault/session/proxy 设计。
- 生产 CSRF/session 行为需要面向部署的测试。
- 长流清理、多进程生成锁和持久队列/worker 行为仍需审查。
- ST 兼容还需要持续用真实资产和真实插件审计，尤其是更深的 world-info recursion/vector 行为、聊天边缘 payload、attachments、media、quick replies、reasoning/logprobs、presets 和 extension data。

## 技术栈

| 层级 | 当前实现 |
| --- | --- |
| 前端 | React 19.2、Vite 8.0、TypeScript 6.0、React Router 7.15、TanStack Query 5.100、TanStack Virtual 3.13、Zustand 5.0 |
| 样式/UI | Tailwind CSS v4、framer-motion、lucide-react、自定义 CSS 变量 |
| 内容渲染 | marked、DOMPurify、懒加载 Shiki、KaTeX |
| ST 兼容前端依赖 | jQuery 4、lodash 4、showdown 2、toastr 2、highlight.js 11、本地 public ST shims |
| 后端 | Hono 4、`@hono/node-server`、Zod 3、TypeScript 5.6、tiktoken |
| 测试 | Vitest 4、React Testing Library、jsdom |
| 存储 | 默认使用 `server/data` 文件存储，可用 `LUKER_DATA_DIR` 覆盖 |

历史命名说明：`luker-ui`、`luker-server`、`LUKER_DATA_DIR` 等仍是兼容时期内部标识。用户可见命名是 CraftTalker / 语琢；广泛 key/path/package 重命名会等到有安全迁移方案再做。

## 快速开始

### 环境要求

- 当前 Vite 8 工具链需要 Node.js 20.19+ 或 22.12+。
- 使用随对应 Node.js 安装的 npm。

### 安装依赖

```bash
npm install
cd server
npm install
cd ..
```

### 开发运行

使用两个终端：

```bash
# 终端 1：后端 http://localhost:3000
cd server
npm run dev
```

```bash
# 终端 2：前端 http://localhost:5173
npm run dev
```

Vite 开发服务器会把 `/api`、ST script/resource roots、`/version`、`/user/files`、`/User Avatars`、`/characters`、`/thumbnail` 和 `/cors` 代理到后端。如果后端不在 `http://localhost:3000`，可设置 `CRAFTTALKER_API_TARGET`。

Windows 下可以使用 `start.bat`：它会检查 Node 版本、安装或修复前后端依赖、准备数据目录、启动后端并运行 Vite 开发服务器。

### 构建

```bash
# 前端
npm run build

# 后端
cd server
npm run build
```

`npm run preview` 可预览前端构建产物。后端在 `server` 目录执行 `npm run build` 后，可用 `npm start` 启动。

## 环境变量

| 变量 | 作用 |
| --- | --- |
| `PORT` | 后端端口，默认 `3000`。 |
| `LUKER_DATA_DIR` | 覆盖后端数据存储目录，默认是 `server/data`。 |
| `LUKER_IMPORT_DIR` | 允许从受控目录直接导入角色文件，默认是临时 `luker-import`。 |
| `ALLOWED_ORIGINS` | 额外允许的 CORS/CSRF 来源，多个值用英文逗号分隔。 |
| `CRAFTTALKER_API_TARGET` | Vite 开发代理目标，默认 `http://localhost:3000`。 |
| `CRAFTTALKER_ST_CORS_PROXY_ENABLED` | 设为 `true` 后启用受限 ST `/cors` 代理。默认关闭。 |
| `CRAFTTALKER_ST_CORS_PROXY_ALLOWLIST` | 受限 `/cors` 代理的可信 host allowlist。 |
| `CRAFTTALKER_ST_IMAGE_BACKEND_PING_ENABLED` | 设为 `true` 后启用可信 SD/Comfy ping-only 探测。默认关闭。 |
| `CRAFTTALKER_ST_IMAGE_BACKEND_ALLOWLIST` | SD/Comfy ping-only 探测允许的精确可信 origin。 |
| `NODE_ENV` | `test` 与 `development` 会跳过 CSRF 中间件，方便本地工具链。 |

## 项目结构

```text
CraftTalker/
├── src/                        # 前端 (React + Vite)
│   ├── components/             # 角色、聊天、布局、设置、世界书、通用 UI
│   ├── hooks/                  # Query 与应用工作流 hooks，包括 runs
│   ├── lib/                    # API facade、domain clients、i18n、存储、ST host bridge
│   ├── locales/                # 翻译文件
│   ├── routes/                 # 懒加载路由/弹窗组件
│   ├── stores/                 # Zustand 状态仓库
│   └── types.ts                # 前端共享类型
├── server/                     # 后端 (Hono + Node)
│   ├── src/
│   │   ├── config/             # Provider 与 origin 配置
│   │   ├── engine/             # NativeEngine、body/stream builders、STEngine 骨架
│   │   ├── lib/                # JSONL、PNG/角色卡、宏、路径、tokenizer、ST compat helpers
│   │   ├── middleware/         # 错误与 CSRF 中间件
│   │   ├── routes/             # 原生与 ST-compatible API 路由
│   │   └── services/           # 角色/聊天/预设/世界书/run/provider/extension 服务
│   └── data/                   # 默认用户数据、runs、extensions、files、avatars
├── public/                     # 静态资源与 ST-compatible root/public scripts
├── scripts/                    # 本地审计脚本，包括 ST public-shim import audit
├── docs/                       # Agent notes、active priorities、verification、architecture docs
├── vite.config.ts              # Vite、Tailwind、代理、构建拆分、Vitest 配置
└── start.bat                   # Windows 开发启动脚本
```

## 验证

2026-07-07 最新已知本地基线：

- Root `npm run test`：17 个文件 / 176 个 frontend/root 测试通过。Root Vitest 现在排除 `server/**`。
- Server `npm run test`：24 个文件 / 281 个测试通过。
- Root 与 server typecheck 通过。
- Root 与 server build 通过；无 Vite large chunk warning。
- `npm run audit:st-shims` 通过：扫描 610 个文件，检查 501 个 named imports 和 10 个 namespace/default imports。
- `git diff --check` 无 whitespace 错误；脏 Windows 工作区仍可能显示常见 LF-to-CRLF 提醒。

代码改动后常用检查：

```bash
npm run typecheck -- --pretty false
npm run test
npm run build
npm run audit:st-shims

cd server
npm run typecheck -- --pretty false
npm run test
npm run build
cd ..

git diff --check
```

做稳定性检查时，建议顺序运行较重的前端测试、前端构建、后端测试和后端构建。

## 后续重点

- 将内存型 LLM key sessions 加固为生产级 vault/session/proxy 设计。
- 持续用真实资产和真实插件行为审计 ST 兼容，同时保持 host boundary 显式、类型化。
- 改善长流清理，并把 `data/runs/` 演进为持久生成队列/worker 模型。
- 保持体积卫生可见：third-party extension corpora、logs、screenshots、caches、dependency folders 和 generated artifacts 都不是核心产品源码。
- PC 端优先保持 React/Vite Web 或 PWA，Hono/Node 继续作为主后端，直到有具体约束证明需要其他 host。Tauri/Rust 是可选 fallback，不是默认方向。
- Harness 要谨慎生长，从 intent/context/run-journal/commit 边界开始，而不是隐藏出第二套运行时。

## 开源协议

本项目基于 GNU Affero General Public License v3.0 开源。详见 [LICENSE](LICENSE)。
