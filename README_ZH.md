# CraftTalker（语琢）

[English](README.md) | **中文**

SillyTavern/Luker 生态的现代化聊天前端，基于 React 19 + Hono 构建。

## 功能特性

- 🎨 现代化 UI — React 19 + Tailwind CSS v4 + framer-motion
- 💬 实时对话 — SSE 流式生成、Markdown 渲染、虚拟滚动
- 🤖 多 LLM 支持 — OpenAI / Kobold / TextGen / NovelAI
- 📖 世界书 — 角色绑定与通用世界书管理
- 🎭 角色卡 — PNG V2/V3 导入、完整编辑器、克隆、导出
- ⚙️ 预设管理 — 多种 API 类型的采样参数预设
- 🌙 亮色/暗色主题 — oklch Design Token 体系
- 📱 响应式布局 — 桌面三栏 + 移动端抽屉
- 🚀 新手引导 — 3 步首次使用向导

## 技术栈

| 层级 | 技术 | 版本 |
|------|------|------|
| 前端框架 | React + Vite + TypeScript | 19.2 / 8.0 / 6.0 |
| 样式 | Tailwind CSS v4 (oklch) | 4.2 |
| 动效 | framer-motion | 12 |
| 状态管理 | Zustand + persist | — |
| 服务端状态 | TanStack Query | v5 |
| 后端 | Hono + Zod | 4.6 |
| 测试 | Vitest + React Testing Library | 4.1 |

## 快速开始

### 环境要求

- Node.js >= 18
- npm >= 9

### 安装与运行

```bash
# 安装前端依赖
npm install

# 安装后端依赖
cd server && npm install && cd ..

# 启动开发服务器（前端 :5173，后端 :3000）
npm run dev
```

或使用一键启动脚本：

```bash
start.bat
```

### 生产构建

```bash
npm run build
```

## 项目结构

```
CraftTalker/
├── src/                        # 前端 (React + Vite)
│   ├── components/             # UI 组件
│   │   ├── character/          # 角色编辑器、面板、导入
│   │   ├── chat/               # 聊天区、输入框、消息
│   │   ├── layout/             # 应用布局
│   │   ├── onboarding/         # 首次使用向导
│   │   ├── settings/           # 设置与预设
│   │   ├── sidebar/            # 角色侧边栏
│   │   ├── ui/                 # 通用 UI 基础组件
│   │   └── world/              # 世界书编辑器
│   ├── hooks/                  # 自定义 React Hooks
│   ├── lib/                    # 工具函数、API 客户端、i18n
│   ├── locales/                # 翻译文件
│   ├── routes/                 # 路由组件
│   ├── stores/                 # Zustand 状态仓库
│   └── types.ts                # 共享 TypeScript 类型
├── server/                     # 后端 (Hono)
│   ├── src/
│   │   ├── engine/             # LLM 引擎 (NativeEngine / STEngine)
│   │   ├── lib/                # JSONL、PNG 解析器、Prompt 构建器
│   │   ├── middleware/         # 错误处理中间件
│   │   ├── routes/             # API 路由
│   │   └── services/           # 业务逻辑层
│   └── data/                   # 用户数据（已 gitignore）
└── public/                     # 静态资源
```

## 数据兼容性

CraftTalker 与 SillyTavern/Luker 保持 100% 数据兼容：

| 数据类型 | 格式 | 兼容度 |
|----------|------|--------|
| 角色卡 | PNG V2/V3 元数据 | ✅ 100% |
| 聊天记录 | JSONL | ✅ 100% |
| 世界书 | JSON | ✅ 100% |
| 预设 | JSON (.settings) | ✅ 100% |

## 开源协议

本项目基于 GNU Affero General Public License v3.0 开源 — 详见 [LICENSE](LICENSE) 文件。
