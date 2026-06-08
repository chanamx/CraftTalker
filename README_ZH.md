# CraftTalker（语琢）

[English](README.md) | **中文**

最后更新：2026-06-09

CraftTalker 是一个面向 SillyTavern 兼容资产的现代化角色扮演聊天应用，当前技术栈是 React/Vite + Hono。它的产品方向是独立的 CraftTalker/语琢，而不是 Luker 或 SillyTavern 的薄封装；同时会尽量保留真实角色卡、聊天、世界书和预设数据的兼容性。

> 当前状态：活跃开发中。原生引擎与兼容适配层已经可用，但还不能宣称完整复刻 SillyTavern 的 Prompt 构建和运行时行为。

## 当前亮点

- 现代化聊天界面：React 19、Vite 8、Tailwind CSS v4、framer-motion、lucide 图标、React Router、TanStack Query、Zustand、i18next。
- 角色侧栏、角色信息面板、首次使用引导、路由级弹窗、响应式布局、亮/暗主题、Toast 消息和 ErrorBoundary 覆盖；开启开发者模式后，前端报错页会显示更完整的浏览器端诊断信息。
- SSE 流式生成：前端按聊天维护流状态，避免切换聊天导致生成丢失；支持重复生成保护、停止、重新生成、继续、Swipe、消息编辑/删除、聊天创建/删除和聊天显示名重命名。
- Markdown 渲染支持 GFM、HTML 清洗、安全外链、Shiki 代码高亮和 KaTeX 数学公式。
- Hono 后端提供角色、聊天、世界书、预设、引擎选择和健康检查 API。
- 引擎抽象已接入当前生成路径：`NativeEngine` 是当前实际使用的生成引擎，`STEngine`/worker 已存在但仍是 SillyTavern 行为兼容的骨架。

## 兼容性现实

CraftTalker 的目标是强 SillyTavern 数据兼容，但当前代码不为“100% 兼容”。项目目前清晰区分三层：

- 数据兼容：在适配层已覆盖的范围内保留源文件结构和未知字段。
- 行为兼容：已实现的部分尽量对齐 ST；完整 Prompt 构建行为仍是后续工作。
- CraftTalker 原生体验：围绕兼容数据构建更现代的 React 工作流。

当前已实现或部分实现：

| 范围 | 当前状态 |
| --- | --- |
| 角色卡 | 支持 PNG `chara` 与 V3 `ccv3` 读取；V3 PNG 写入会同时写 `chara` 和 `ccv3`；JSON 导入/导出经过 ST-like 序列化。当前适配器会保留常见 V2/V3 顶层和 `data` 未知字段、assets、group greetings、nickname、扩展负载以及 `extensions.regex_scripts`。 |
| 角色导入 | PNG 导入会保留原卡为 `character.png`；`avatar.png` 只用于用户自定义显示头像；头像读取会回退到 `character.png`。内嵌 `character_book` 会抽取为绑定世界书。 |
| 聊天 | JSONL 聊天通过对象合并路径读写，保留 metadata 与消息未知字段；已支持 Swipe 数据。所有 ST JSONL 边缘字段的完整覆盖仍需继续审计。 |
| 世界书 | 支持通过 `character.extensions.world` 绑定角色世界书、启用的全局世界书、绑定/解绑、启用/禁用、关键词匹配、二级关键词、正则、大小写、整词、概率、排序，以及 ST-like `0-6` 插入位置。更深的递归、分组、向量化语义仍需继续审计。 |
| 预设 | 生成预设继续使用 ST 风格 `.settings` 目录：`koboldAI_Settings`、`openAI_Settings`、`textGen_Settings`、`novelAI_Settings`。模板预设目录 `instruct`、`context`、`sysprompt`、`reasoning` 已按 JSON 识别。模板预设在所有 UI/API 路径中的 raw 字段保留仍应继续复核后再宣称完整兼容。 |
| 宏 | 已有 Prompt-time 宏解析；它是对 Prompt 输入的视图，不应修改原始角色卡或世界书数据。 |

## 安全与可靠性

当前代码近期已经包含这些加固：

- `server/src/lib/path-utils.ts` 使用 `path.relative` 做路径包含校验。
- 角色导入限制为 `.png` 和 `.json`；直接路径导入只允许来自 `LUKER_IMPORT_DIR` 或临时导入目录。
- 上传临时文件使用 `safePath` 和 `randomUUID`。
- Markdown/XSS 加固：DOMPurify allow-list、Shiki 输出二次清洗、剥离危险协议/样式/事件处理器，并为安全外链设置 `target="_blank"` 与 `rel="noopener noreferrer"`。
- 客户端设置通过 Web Crypto 加密存储作为过渡方案，并会在首次读取时迁移旧的明文设置。
- CORS 与 CSRF 共用 `server/src/config/origins.ts`；CSRF 在非 test/development 环境启用。

仍需优先处理：

- 客户端加密保存 API Key 不是最终生产安全模型。生产环境应改为服务端保存密钥，并向前端暴露会话/代理访问。
- 生产 CSRF/session 策略还需要完整部署方案与测试。
- 长流式生成目前仍会在服务端累积完整生成内容后再保存。

## 技术栈

| 层级 | 当前实现 |
| --- | --- |
| 前端 | React 19、Vite 8、TypeScript 6、React Router 7、TanStack Query 5、Zustand 5 |
| 样式/UI | Tailwind CSS v4、framer-motion、lucide-react、自定义 CSS 变量 |
| 内容渲染 | marked、DOMPurify、Shiki、KaTeX |
| 后端 | Hono、`@hono/node-server`、Zod、TypeScript 5.6 |
| 测试 | Vitest、React Testing Library、jsdom |
| 存储 | 前端本地状态 + 后端默认 `server/data` 文件存储 |

依赖注意事项：当前源码会使用 `react-router`、`i18next`、`react-i18next`、`zustand`、`shiki`、`katex` 等包。它们存在于当前 lockfile/安装树中，但在做依赖清理、全新分发或声明依赖状态前，应重新核对 `package.json` 与 lockfile 的一致性。

## 快速开始

### 环境要求

- 当前 Vite/Vitest 8 工具链推荐 Node.js 20.19+ 或 22.12+。
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

Vite 开发服务器会把 `/api` 代理到 `http://localhost:3000`。

Windows 下也可以使用 `start.bat`：它会安装缺失依赖、准备数据目录、启动后端并运行 Vite 开发服务器。该脚本的窗口标题和输出里仍保留部分 Luker 历史命名。

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
| `LUKER_IMPORT_DIR` | 允许从受控目录直接导入角色文件，默认是临时 `luker-import` 目录。 |
| `ALLOWED_ORIGINS` | 额外允许的 CORS/CSRF 来源，多个值用英文逗号分隔。 |
| `NODE_ENV` | `test` 与 `development` 会跳过 CSRF 中间件，方便本地工具链。 |

## 项目结构

```text
CraftTalker/
├── src/                        # 前端 (React + Vite)
│   ├── components/             # 角色、聊天、布局、设置、世界书、通用 UI
│   ├── hooks/                  # Query 与应用工作流 hooks
│   ├── lib/                    # API 客户端、i18n、安全存储、toast、工具函数
│   ├── locales/                # 翻译文件
│   ├── routes/                 # 路由/弹窗组件
│   ├── stores/                 # Zustand 状态仓库
│   └── types.ts                # 前端共享类型
├── server/                     # 后端 (Hono + Node)
│   ├── src/
│   │   ├── config/             # Provider 与 origin 配置
│   │   ├── engine/             # NativeEngine 与 STEngine 骨架
│   │   ├── lib/                # JSONL、PNG/角色卡解析、宏、路径、世界书匹配
│   │   ├── middleware/         # 错误与 CSRF 中间件
│   │   ├── routes/             # /api 路由
│   │   └── services/           # 角色/聊天/预设/世界书服务
│   └── data/                   # 默认用户数据目录
├── public/                     # 静态资源
├── vite.config.ts              # Vite、Tailwind、代理、构建配置
└── start.bat                   # Windows 开发启动脚本
```

## 验证命令

代码改动后常用检查：

```bash
npm run test
npm run build
cd server
npm run test
npm run build
cd ..
git diff --check
```

## 后续重点

- 将 API Key 与供应商请求迁移到服务端 session/proxy 模型。
- 继续审计 ST 兼容性：预设负载、聊天 JSONL 边缘字段、世界书递归/分组/向量字段，以及精确 Prompt 行为。
- 改善长流式生成的内存行为，并考虑按聊天加服务端生成锁。
- 保持 CraftTalker/语琢 作为用户可见产品方向；`luker-*` 内部命名在有安全迁移计划前暂缓大规模重命名。

## 开源协议

本项目基于 GNU Affero General Public License v3.0 开源。详见 [LICENSE](LICENSE)。
