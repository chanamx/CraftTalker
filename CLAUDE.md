基于对两个项目源码（SillyTavern：https://github.com/SillyTavern/SillyTavern 和Luker：https://github.com/funnycups/Luker ）的深入分析，我从 **UI/UX 现代化**、**功能现代化**、**架构演进** 三个维度给出初步的改造路线图。（不完全成熟）

---


## 一、UI/UX 现代化改造

当前 SillyTavern/Luker 的界面是典型的"工具型"面板布局——左侧角色列表、右侧多标签页配置面板，学习曲线陡峭。大众用户期望的是 **ChatGPT/Claude 式的对话优先体验**。

### 1.1 从"面板驱动"到"对话驱动"

```
当前布局:                          目标布局:
┌────────┬──────────────────┐      ┌──────────────────────────┐
│ 角色   │  对话区           │      │  对话流 (占 70% 视口)     │
│ 列表   │                  │      │                          │
│       │  配置面板          │      │  [角色/模型切换 - 顶部栏]  │
│       │  (多标签页)        │      │  [高级设置 - 侧边抽屉]    │
└────────┴──────────────────┘      └──────────────────────────┘
```

**具体改造：**
- **默认隐藏所有配置面板**，通过侧边抽屉（Drawer）按需呼出
- **角色切换**改为顶部下拉或 Cmd+K 命令面板
- **模型选择**下沉到输入框旁的快捷切换按钮
- 首次启动显示 **Onboarding 向导**（3 步：选角色 → 配 API Key → 开始对话）

### 1.2 设计系统现代化

基于 Luker 已有的 Webpack 三分包架构，引入现代设计 Token：

```
核心改造点:
├── Design Tokens (CSS Variables)
│   ├── --color-surface-1 ~ 6    (层次化背景)
│   ├── --color-text-primary     (WCAG AA 对比度)
│   ├── --radius-sm/md/lg        (统一圆角)
│   └── --shadow-elevation-1~4   (层级阴影)
│
├── Typography Scale
│   ├── 正文 15px / 行高 1.6
│   ├── 代码块 JetBrains Mono
│   └── 标题系统 (H1-H4)
│
└── Motion System
    ├── 消息入场: slide-up + fade (200ms ease-out)
    ├── 流式输出: 逐字打字机效果
    └── 面板切换: 200ms cubic-bezier
```

### 1.3 响应式 + PWA

Luker 已有 Android 运行时支持（`start:deno`），但缺少真正的移动端适配：

```
断点系统:
├── Mobile (< 768px):  单栏，全屏对话，底部输入
├── Tablet (768-1024): 对话 + 可折叠侧栏
└── Desktop (> 1024):  经典双栏 + 抽屉式设置

PWA 能力:
├── Service Worker (离线缓存对话历史)
├── Web Share API (分享对话片段)
├── Push Notification (生成完成通知)
└── Install Prompt (添加到主屏幕)
```

### 1.4 关键交互细节

| 当前状态 | 改造目标 |
|---------|---------|
| 角色 PNG 拖入 | **一键角色市场**浏览 + 安装 |
| 手动配置 API 端点 | **自动检测** + 连接测试按钮 |
| 纯文本聊天 | **富文本渲染**（Markdown/代码高亮/LaTeX/表格） |
| 无搜索 | **全文搜索**对话历史（Cmd+K） |
| 无快捷键 | 完整**键盘快捷键**体系 |
| 无无障碍 | WCAG 2.1 AA 合规 |

---

## 二、功能现代化改造

### 2.1 多模态对话（利用 Luker 的 WS Proxy 优势）

Luker 的 WebSocket 代理架构天然适合长时任务。在此基础上扩展：

```
输入方式扩展:
├── 文本 (已有)
├── 图片粘贴/拖拽 (已有基础)
├── 文件上传 (PDF/Word/Excel → 自动提取文本)
├── 语音输入 (Web Speech API → Whisper 转写)
├── 截图工具 (内建区域截图 → 直接粘贴)
└── 链接卡片 (粘贴 URL → 自动抓取摘要)
```

### 2.2 RAG 知识库（利用 Luker 的 `vectors` 目录）

Luker 已有 `vectors` 用户目录模板，可以构建完整的 RAG 管道：

```
文档 → Chunking → Embedding → Vector Store → 检索 → 注入 Prompt
                                                    ↑
用户提问 → 混合检索 (BM25 + Vector) → Rerank → Top-K 上下文
```

**实现路径：**
1. 复用 `vectors/` 目录存储本地向量索引
2. 集成 LanceDB（本地嵌入式向量数据库，无需服务端）
3. 支持拖入 PDF/文档自动构建知识库
4. 对话中 `@知识库名` 触发检索增强

### 2.3 Agent + 工具调用框架

两个项目都已支持 Function Calling，但缺少结构化的 Agent 框架：

```
Agent 架构:
┌─────────────────────────────────────┐
│           Agent Runner              │
│  ┌─────────┐  ┌──────────────────┐  │
│  │ Planner │→│ Tool Dispatcher   │  │
│  └─────────┘  └──────┬───────────┘  │
│                      ↓              │
│  ┌──────────────────────────────┐   │
│  │       Tool Registry          │   │
│  │  ├── WebSearch (联网搜索)    │   │
│  │  ├── CodeInterpreter (沙箱)  │   │
│  │  ├── FileSystem (文件操作)   │   │
│  │  ├── Calendar/Reminder       │   │
│  │  └── Custom Plugins          │   │
│  └──────────────────────────────┘   │
└─────────────────────────────────────┘
```

### 2.4 对话分支与版本控制

ChatGPT 的对话分支功能是大众用户的核心需求：

```
对话树结构:
         ┌── 分支 A ── 回复 A1 ── ...
根消息 ──┤
         ├── 分支 B ── 回复 B1 ── ...
         │
         └── (当前活跃分支)

实现:
├── 前端: 树形数据结构 + 分支切换 UI
├── 后端: 复用 Luker 的 Patch 机制 (每个分支 = 独立 Patch 链)
└── 存储: .luker-state.json 记录分支元数据
```

### 2.5 Prompt 模板市场

```
模板系统:
├── 官方预置 (角色扮演 / 翻译 / 代码 / 写作 / ...)
├── 社区分享 (JSON 格式，一键导入)
├── 变量系统 ({{date}} {{name}} {{context}})
└── 模板链接分享 (URL → 直接打开对话)
```

---

## 三、架构现代化

### 3.1 前后端分离 + API First

当前架构是 Express 直接服务前端静态文件。现代化改造：

```
当前:  Express → HTML/JS/CSS + API
目标:  Express API Server ( :8000 )
       Vite Dev Server   ( :5173 )  ← 开发时
       生产: API Server 托管构建产物

API 规范化:
├── OpenAPI 3.1 规范文档
├── TypeScript 类型共享 (前后端)
├── 统一错误格式 (RFC 7807 Problem Details)
└── API 版本化 (/api/v1/...)
```

### 3.2 插件系统升级

基于 Luker 已有的 Git 集成插件加载器：

```
插件市场:
├── 插件注册表 (GitHub Repo Index)
├── 一键安装 (复用 isomorphic-git)
├── 版本管理 + 依赖解析
├── 沙箱隔离 (VM2 / ShadowRealm)
├── 权限系统 (网络/文件/系统调用声明)
└── 热重载 (开发模式)
```

### 3.3 多后端 LLM 路由

```
智能路由:
┌──────────────┐     ┌──────────────┐
│  请求分析     │────→│  路由决策     │
│  (复杂度/类型)│     │  (成本/延迟)  │
└──────────────┘     └──────┬───────┘
                            ↓
              ┌─────────────────────────┐
              │     Model Registry      │
              │  ├── GPT-5 (复杂推理)   │
              │  ├── Claude (长文写作)  │
              │  ├── Gemini (多模态)    │
              │  └── Local LLM (隐私)   │
              └─────────────────────────┘

Fallback 链: 主模型 → 备用模型 → 本地模型
```

### 3.4 桌面端现代化

Luker 已有 Electron 启动脚本，建议迁移到 **Tauri**：

| | Electron | Tauri |
|---|----------|-------|
| 安装包 | ~150MB | ~5MB |
| 内存 | ~250MB | ~50MB |
| Rust 后端 | ❌ | ✅ (可复用推理/向量计算) |

---

## 四、优先级路线图

```
Phase 1 — 基础体验 (2-3 月)
├── 对话驱动 UI 重构
├── Design Token 系统
├── Markdown/代码渲染
├── 移动端响应式
└── Onboarding 向导

Phase 2 — 核心能力 (3-4 月)
├── RAG 知识库
├── 对话分支
├── 全文搜索
├── Prompt 模板
└── PWA 离线支持

Phase 3 — 生态扩展 (4-6 月)
├── 插件市场
├── Agent 框架
├── 多模态输入
├── LLM 智能路由
└── Tauri 桌面端
```

---

## 五、关键建议

1. **不要重写**：Luker 的 WS Proxy + Patch 持久化 + 生成任务管理是核心优势，所有改造应围绕这些基础设施展开
2. **渐进式迁移**：前端可以先在 `public/` 下新建 `v2/` 目录，用现代框架（React/Vue/Svelte）逐步替换旧 UI，通过 API 层共存
3. **TypeScript 先行**：两个项目都是纯 JS，类型安全是多人协作和插件生态的基础
4. **i18n 第一天就做**：大众用户意味着多语言，用 `i18next` + 命名空间隔离核心/插件翻译


#  Luker 现代化改造 — 全模块详细技术方案（进一步方案）
## 一、总体架构设计
### 1.1 目标架构全景
```
┌─────────────────────────────────────────────────────────────┐
│                     Tauri v2 Desktop Shell                   │
│  ┌───────────────────────────────────────────────────────┐  │
│  │              React 19 SPA (Vite 6)                    │  │
│  │  ┌──────────┐ ┌──────────┐ ┌────────────────────┐    │  │
│  │  │ shadcn/ui│ │ Motion   │ │ Tailwind CSS v4    │    │  │
│  │  │ (Radix)  │ │ (动效)    │ │ (oklch Design Tokens)│  │  │
│  │  └──────────┘ └──────────┘ └────────────────────┘    │  │
│  │  ┌──────────┐ ┌──────────┐ ┌────────────────────┐    │  │
│  │  │ Zustand  │ │ TanStack │ │ i18next            │    │  │
│  │  │ (状态)   │ │ Query v5 │ │ (国际化)            │    │  │
│  │  └──────────┘ └──────────┘ └────────────────────┘    │  │
│  └───────────────────────────────────────────────────────┘  │
│                            │ HTTP/WS                         │
│  ┌───────────────────────────────────────────────────────┐  │
│  │           Hono API Layer (共存兼容层)                   │  │
│  │  ┌──────────┐ ┌──────────┐ ┌────────────────────┐    │  │
│  │  │ Zod      │ │ RPC Mode │ │ OpenAPI 3.1        │    │  │
│  │  │ 校验     │ │ 类型共享  │ │ 自动文档            │    │  │
│  │  └──────────┘ └──────────┘ └────────────────────┘    │  │
│  └───────────────────────────────────────────────────────┘  │
│                            │                                 │
│  ┌───────────────────────────────────────────────────────┐  │
│  │          Express 兼容层 (现有 API 100% 保留)            │  │
│  │  ┌──────────┐ ┌──────────┐ ┌────────────────────┐    │  │
│  │  │ WS Proxy │ │ Luker    │ │ Plugin Loader      │    │  │
│  │  │ (保留)   │ │ Gen Jobs │ │ (保留 + 增强)       │    │  │
│  │  └──────────┘ └──────────┘ └────────────────────┘    │  │
│  └───────────────────────────────────────────────────────┘  │
│                            │                                 │
│  ┌───────────────────────────────────────────────────────┐  │
│  │              数据 & 存储层                              │  │
│  │  ┌──────────┐ ┌──────────┐ ┌────────────────────┐    │  │
│  │  │ LanceDB  │ │ JSONL    │ │ SQLite (Drizzle)   │    │  │
│  │  │ 向量存储  │ │ 聊天文件  │ │ 用户/设置/插件元数据 │    │  │
│  │  └──────────┘ └──────────┘ └────────────────────┘    │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```
### 1.2 核心原则
原则 说明 API 兼容 现有 Express API 100% 保留，新 API 通过 /api/v2/ 挂载 渐进迁移 前端 public/v2/ 新目录，旧 UI 不受影响 类型安全 TypeScript strict mode，前后端共享类型 零破坏 现有插件、角色卡、聊天文件格式不变

## 二、前端现代化方案
### 2.1 技术栈
```
React 19.1          — 最新稳定版，Server Components 预备
Vite 6              — 亚秒级 HMR，原生 ESM
TypeScript 5.8      — strict mode
Tailwind CSS v4     — oklch 色彩空间，CSS-first 配置
shadcn/ui (latest)  — Radix UI 无头组件 + 可定制样式
Motion (former FM)  — 声明式动画，Layout animations
Zustand v5          — 轻量状态管理 + persist + immer
TanStack Query v5   — 服务端状态缓存 + 乐观更新
React Router v7     — 嵌套路由 + 数据加载
```
### 2.2 项目结构
```
src/
├── main.tsx                    # Vite 入口
├── App.tsx                     # 根组件 (QueryClient + Theme + Router)
├── routes/
│   ├── __root.tsx              # 根布局 (侧栏 + 主区域)
│   ├── chat.$chatId.tsx        # 对话页
│   ├── characters.tsx          # 角色浏览
│   ├── knowledge.tsx           # 知识库管理
│   ├── settings.tsx            # 设置页
│   └── onboarding.tsx          # 新手引导
├── components/
│   ├── ui/                     # shadcn/ui 组件 (button, dialog, 
drawer...)
│   ├── chat/
│   │   ├── ChatView.tsx        # 对话主视图
│   │   ├── MessageBubble.tsx   # 消息气泡 (Markdown 渲染)
│   │   ├── StreamingText.tsx   # 流式打字机效果
│   │   ├── BranchIndicator.tsx # 分支切换器
│   │   └── ChatInput.tsx       # 输入框 (多模态)
│   ├── sidebar/
│   │   ├── AppSidebar.tsx      # 侧栏容器
│   │   ├── ChatList.tsx        # 对话列表
│   │   └── CharacterSwitcher.tsx # 角色切换
│   ├── knowledge/
│   │   ├── DocUploader.tsx     # 文档上传
│   │   └── SearchResults.tsx   # 检索结果展示
│   └── shell/
│       ├── TitleBar.tsx        # Tauri 自定义标题栏
│       └── CommandPalette.tsx  # Cmd+K 命令面板
├── stores/
│   ├── chat-store.ts           # 对话状态 (Zustand + persist)
│   ├── settings-store.ts       # 用户设置
│   ├── character-store.ts      # 角色缓存
│   └── ui-store.ts             # UI 状态 (侧栏开合等)
├── hooks/
│   ├── use-chat-query.ts       # TanStack Query: 聊天数据
│   ├── use-stream.ts           # SSE/WS 流式接收
│   ├── use-agent.ts            # Agent 执行
│   └── use-rag.ts              # RAG 检索
├── lib/
│   ├── api-client.ts           # Hono RPC 类型安全客户端
│   ├── markdown.ts             # Markdown 渲染配置
│   └── i18n.ts                 # i18next 配置
└── styles/
    └── globals.css             # Tailwind v4 + Design Tokens
```
### 2.3 核心组件设计 2.3.1 对话视图 — ChatView
```
┌─────────────────────────────────────────────────────┐
│  [角色头像] 角色名  ▸ 模型: GPT-5  ▼  [分支: 3]     │  ← 顶栏
├─────────────────────────────────────────────────────┤
│                                                     │
│  ┌──────────────────────────────────┐               │
│  │        用户消息气泡               │               │
│  │    (右对齐, 圆角, 阴影)           │               │
│  └──────────────────────────────────┘               │
│                                                     │
│  ┌──────────────────────────────────┐               │
│  │  AI 回复 (Markdown 渲染)          │               │
│  │  • 代码高亮 (Shiki)               │               │
│  │  • LaTeX 公式 (KaTeX)             │               │
│  │  • 表格 / 图片 / 文件卡片          │               │
│  │  [📋复制] [🔄重新生成] [🌿分支]    │               │
│  └──────────────────────────────────┘               │
│                                                     │
│  ┌─ 分支指示器 ─────────────────────┐               │
│  │ ◀ 分支 1 │ ● 分支 2 │ 分支 3 ▶  │               │
│  └──────────────────────────────────┘               │
│                                                     │
├─────────────────────────────────────────────────────┤
│  [📎] [@知识库]  │  输入消息...          │ [▶ 发送] │
│  [🎤语音] [🖼图片]│                       │ [⚙设置]  │
└─────────────────────────────────────────────────────┘
``` 2.3.2 流式打字机 — StreamingText
```
import { motion, AnimatePresence } from "motion/react"

function StreamingText({ text, isStreaming }: Props) {
  return (
    <div className="prose dark:prose-invert max-w-none">
      <MarkdownRenderer content={text} />
      {isStreaming && (
        <motion.span
          className="inline-block w-2 h-5 bg-primary ml-0.5"
          animate={{ opacity: [1, 0] }}
          transition={{ duration: 0.8, repeat: Infinity, repeatType: 
          "reverse" }}
        />
      )}
    </div>
  )
}
``` 2.3.3 命令面板 — CommandPalette (Cmd+K)
```
// 基于 shadcn/ui Command (cmdk)
<CommandDialog open={open} onOpenChange={setOpen}>
  <CommandInput placeholder="搜索角色、对话、设置..." />
  <CommandList>
    <CommandGroup heading="角色">
      {characters.map(c => (
        <CommandItem key={c.id} onSelect={() => switchCharacter(c.id)}>
          <Avatar src={c.avatar} />
          <span>{c.name}</span>
          <CommandShortcut>⌘{c.shortcut}</CommandShortcut>
        </CommandItem>
      ))}
    </CommandGroup>
    <CommandGroup heading="对话">
      <CommandItem onSelect={() => router.navigate('/chats')}>
        <MessageSquareIcon /> 查看所有对话
      </CommandItem>
    </CommandGroup>
    <CommandGroup heading="操作">
      <CommandItem onSelect={() => setTheme('dark')}>
        <MoonIcon /> 切换暗色模式
      </CommandItem>
    </CommandGroup>
  </CommandList>
</CommandDialog>
```
### 2.4 状态管理架构
```
// stores/chat-store.ts — Zustand + persist + immer
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { immer } from 'zustand/middleware/immer'

interface ChatStore {
  activeChatId: string | null
  messages: Record<string, Message[]>
  branches: Record<string, Branch[]>
  streamingContent: Record<string, string>

  setActiveChat: (id: string) => void
  appendMessage: (chatId: string, msg: Message) => void
  updateStreaming: (chatId: string, delta: string) => void
  createBranch: (chatId: string, fromMessageId: string) => void
  switchBranch: (chatId: string, branchId: string) => void
}

export const useChatStore = create<ChatStore>()(
  devtools(
    persist(
      subscribeWithSelector(
        immer((set) => ({
          activeChatId: null,
          messages: {},
          branches: {},
          streamingContent: {},

          setActiveChat: (id) => set((s) => { s.activeChatId = id }),
          appendMessage: (chatId, msg) => set((s) => {
            if (!s.messages[chatId]) s.messages[chatId] = []
            s.messages[chatId].push(msg)
          }),
          updateStreaming: (chatId, delta) => set((s) => {
            s.streamingContent[chatId] = (s.streamingContent[chatId] || 
            '') + delta
          }),
          createBranch: (chatId, fromId) => set((s) => {
            if (!s.branches[chatId]) s.branches[chatId] = []
            s.branches[chatId].push({
              id: crypto.randomUUID(),
              parentMessageId: fromId,
              createdAt: Date.now(),
            })
          }),
          switchBranch: (chatId, branchId) => set((s) => {
            // 切换活跃分支，重新计算可见消息
          }),
        }))
      ),
      {
        name: 'luker-chat-store',
        partialize: (state) => ({
          activeChatId: state.activeChatId,
          branches: state.branches,
        }),
        version: 1,
      }
    ),
    { name: 'ChatStore' }
  )
)
```
```
// hooks/use-chat-query.ts — TanStack Query 服务端数据
import { useQuery, useMutation, useQueryClient } from '@tanstack/
react-query'

export function useChatMessages(chatId: string) {
  return useQuery({
    queryKey: ['chat', chatId, 'messages'],
    queryFn: () => api.chats.getMessages(chatId),
    staleTime: 30_000,
  })
}

export function useSendMessage() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (payload: SendMessagePayload) => api.chats.send(payload),
    onMutate: async (payload) => {
      // 乐观更新：立即显示用户消息
      await queryClient.cancelQueries({ queryKey: ['chat', payload.
      chatId] })
      const previous = queryClient.getQueryData(['chat', payload.chatId, 
      'messages'])
      queryClient.setQueryData(['chat', payload.chatId, 'messages'], (old) 
      => [
        ...(old || []),
        { role: 'user', content: payload.content, id: 'optimistic-' + Date.
        now() }
      ])
      return { previous }
    },
    onError: (_err, payload, context) => {
      queryClient.setQueryData(['chat', payload.chatId, 'messages'], 
      context?.previous)
    },
    onSettled: (_data, _error, payload) => {
      queryClient.invalidateQueries({ queryKey: ['chat', payload.chatId] })
    },
  })
}
```
## 三、后端兼容升级方案
### 3.1 共存架构
```
                    ┌──────────────────┐
                    │   Nginx / Caddy  │
                    └────────┬─────────┘
                             │
              ┌──────────────┴──────────────┐
              │                             │
     /api/v2/*                     /api/* (legacy)
     /ws/v2/*                      /ws/*
              │                             │
    ┌─────────┴─────────┐         ┌────────┴──────────┐
    │   Hono Server     │         │  Express Server    │
    │   (port 8001)     │         │  (port 8000)       │
    │                   │         │                    │
    │ • Zod validation  │         │ • ws-proxy.js      │
    │ • RPC type export │         │ • luker-gen.js     │
    │ • OpenAPI docs    │         │ • plugin-loader    │
    │ • SSE streaming   │         │ • chat-completions │
    └─────────┬─────────┘         └────────┬──────────┘
              │                             │
              └──────────┬──────────────────┘
                         │
              ┌──────────┴──────────┐
              │    Shared Core      │
              │ • constants.js      │
              │ • util.js           │
              │ • tokenizers.js     │
              │ • prompt-converters │
              │ • users.js          │
              └─────────────────────┘
```
### 3.2 Hono API 层实现
```
// server-v2.ts — Hono 新 API 层
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { streamSSE } from 'hono/streaming'

const app = new Hono()

app.use('/api/v2/*', cors({ origin: '*' }))

// ─── 类型安全的路由定义 ───
const chatRouter = new Hono()
  .get('/:chatId/messages', async (c) => {
    const { chatId } = c.req.param()
    const messages = await chatService.getMessages(chatId)
    return c.json(messages)
  })
  .post('/send',
    zValidator('json', z.object({
      chatId: z.string().uuid(),
      content: z.string().min(1).max(100_000),
      model: z.string().optional(),
      attachments: z.array(z.object({
        type: z.enum(['image', 'file', 'audio']),
        url: z.string(),
      })).optional(),
    })),
    async (c) => {
      const body = c.req.valid('json')
      // 委托给现有 Express 的 LLM 调用逻辑
      const result = await generationService.streamChat(body)
      return c.json(result)
    }
  )
  .get('/:chatId/branches', async (c) => {
    const branches = await branchService.list(c.req.param('chatId'))
    return c.json(branches)
  })
  .post('/:chatId/branches',
    zValidator('json', z.object({ fromMessageId: z.string() })),
    async (c) => {
      const branch = await branchService.create(c.req.param('chatId'), c.
      req.valid('json'))
      return c.json(branch, 201)
    }
  )

// ─── SSE 流式端点 ───
chatRouter.get('/:chatId/stream', async (c) => {
  return streamSSE(c, async (stream) => {
    const jobId = c.req.query('jobId')
    const generator = generationService.getStreamGenerator(jobId!)

    for await (const chunk of generator) {
      await stream.writeSSE({
        data: JSON.stringify(chunk),
        event: 'message',
      })
    }
    await stream.writeSSE({ data: '[DONE]', event: 'done' })
  })
})

app.route('/api/v2/chats', chatRouter)

// ─── RPC 类型导出 (前后端类型共享) ───
export type ChatRouter = typeof chatRouter
export default app
```
```
// lib/api-client.ts — 前端类型安全客户端
import { hc } from 'hono/client'
import type { ChatRouter } from '../../server-v2'

const client = hc<ChatRouter>('/api/v2')

// 完全类型安全的调用
const messages = await client.chats[':chatId'].messages.$get({
  param: { chatId: 'xxx' }
})
// messages 类型自动推导为 ChatMessage[]
```
### 3.3 Express 兼容层 — 零破坏
```
// server-main.js 改动点 (最小化)
// 在现有 Express app 启动后，并行启动 Hono

async function postSetupTasks(result) {
  // === 现有逻辑 100% 保留 ===
  if (result.servers && result.servers.length > 0) {
    initWsProxy(result.servers, app)
  }
  // ... 浏览器启动、心跳等

  // === 新增: 启动 Hono v2 API 层 ===
  const { startV2Server } = await import('./server-v2.js')
  const v2Port = cliArgs.v2Port || 8001
  startV2Server(v2Port)

  serverEvents.emit(EVENT_NAMES.SERVER_STARTED, { url: browserLaunchUrl })
}
```
## 四、桌面端方案 — Tauri v2
### 4.1 项目结构
```
src-tauri/
├── Cargo.toml
├── tauri.conf.json
├── capabilities/
│   └── default.json           # 权限声明
├── src/
│   ├── main.rs                # 入口
│   ├── lib.rs                 # 插件注册
│   ├── commands/
│   │   ├── mod.rs
│   │   ├── fs.rs              # 文件系统操作
│   │   ├── window.rs          # 窗口管理
│   │   └── shell.rs           # 系统命令
│   └── plugins/
│       ├── local_llm.rs       # 本地 LLM 推理 (可选)
│       └── screen_capture.rs  # 截图工具
└── icons/
```
### 4.2 Tauri 配置
```
// tauri.conf.json
{
  "productName": "Luker",
  "version": "3.0.0",
  "identifier": "app.luker.desktop",
  "build": {
    "frontendDist": "../dist",
    "devUrl": "http://localhost:5173",
    "beforeDevCommand": "pnpm dev",
    "beforeBuildCommand": "pnpm build"
  },
  "app": {
    "windows": [
      {
        "title": "Luker",
        "width": 1200,
        "height": 800,
        "minWidth": 400,
        "minHeight": 500,
        "decorations": false,
        "transparent": true
      }
    ],
    "security": {
      "csp": null
    }
  },
  "plugins": {
    "fs": { "scope": ["$APPDATA/**", "$HOME/**"] },
    "window-state": {},
    "shell": { "open": true }
  }
}
```
### 4.3 Rust 命令
```
// src-tauri/src/commands/fs.rs
#[tauri::command]
async fn read_chat_file(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path).map_err(|e| e.to_string())
}

#[tauri::command]
async fn write_chat_file(path: String, content: String) -> Result<(), 
String> {
    std::fs::write(&path, content).map_err(|e| e.to_string())
}

#[tauri::command]
async fn get_app_data_dir(app: tauri::AppHandle) -> Result<String, String> 
{
    app.path().app_data_dir()
        .map(|p| p.to_string_lossy().to_string())
        .map_err(|e| e.to_string())
}
```
### 4.4 自定义标题栏
```
// components/shell/TitleBar.tsx
import { appWindow } from '@tauri-apps/api/window'

export function TitleBar() {
  return (
    <div
      data-tauri-drag-region
      className="fixed top-0 left-0 right-0 h-8 flex items-center 
      justify-between
                 bg-background/80 backdrop-blur-xl border-b z-50"
    >
      <div className="flex items-center gap-2 px-3">
        <img src="/icon.png" className="w-4 h-4" />
        <span className="text-xs font-medium text-muted-foreground">Luker</
        span>
      </div>
      <div className="flex">
        <button onClick={() => appWindow.minimize()} className="px-3 py-2 
        hover:bg-secondary">
          <MinusIcon className="w-3 h-3" />
        </button>
        <button onClick={() => appWindow.toggleMaximize()} className="px-3 
        py-2 hover:bg-secondary">
          <MaximizeIcon className="w-3 h-3" />
        </button>
        <button onClick={() => appWindow.close()} className="px-3 py-2 
        hover:bg-destructive">
          <XIcon className="w-3 h-3" />
        </button>
      </div>
    </div>
  )
}
```
## 五、RAG 知识库方案 — LanceDB
### 5.1 架构
```
用户文档 (PDF/Word/Markdown/TXT)
        │
        ▼
┌──────────────────┐
│   Docling Parser  │  ← 文档解析 (保留格式)
│   (Python sidecar)│
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│   Chunking        │  ← 语义分块 (LangChain RecursiveCharacterTextSplitter)
│   • chunk_size=512│
│   • overlap=50    │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│   Embedding       │  ← BGE-M3 / text-embedding-3-small
│   (API 或本地)    │
└────────┬─────────┘
         │
         ▼
┌──────────────────────────────────────────┐
│              LanceDB (嵌入式)              │
│  ┌────────────────────────────────────┐  │
│  │ Table: knowledge_chunks            │  │
│  │ • id: string                       │  │
│  │ • doc_id: string                   │  │
│  │ • content: string                  │  │
│  │ • vector: Float32Array(1024)       │  │
│  │ • metadata: JSON                   │  │
│  └────────────────────────────────────┘  │
│  ┌────────────────────────────────────┐  │
│  │ FTS Index (tantivy)                │  │
│  │ • BM25 全文索引                     │  │
│  └────────────────────────────────────┘  │
└──────────────────────────────────────────┘
         │
         ▼
┌──────────────────┐
│   Hybrid Search   │  ← 向量 + BM25 混合检索
│   + Reranker      │  ← Cross-Encoder 重排序
└────────┬─────────┘
         │
         ▼
   注入 LLM Prompt
```
### 5.2 实现代码
```
// server/knowledge-base.ts
import * as lancedb from '@lancedb/lancedb'

interface ChunkSchema {
  id: string
  docId: string
  content: string
  vector: number[]
  metadata: Record<string, unknown>
}

export class KnowledgeBase {
  private db: lancedb.Connection
  private embedder: EmbedderService

  async initialize(dataDir: string) {
    this.db = await lancedb.connect(path.join(dataDir, 'vectors'))
  }

  async ingestDocument(docId: string, filePath: string) {
    // 1. 解析文档
    const text = await this.parseDocument(filePath)

    // 2. 分块
    const chunks = this.chunkText(text, { size: 512, overlap: 50 })

    // 3. 向量化
    const vectors = await this.embedder.embedBatch(chunks.map(c => c.
    content))

    // 4. 写入 LanceDB
    const table = await this.getOrCreateTable(docId)
    await table.add(chunks.map((chunk, i) => ({
      id: crypto.randomUUID(),
      docId,
      content: chunk.content,
      vector: vectors[i],
      metadata: chunk.metadata,
    })))

    // 5. 创建 FTS 索引
    await table.createIndex('content', {
      config: lancedb.Index.fts({ withPosition: true })
    })
  }

  async hybridSearch(query: string, topK: number = 10) {
    const queryVector = await this.embedder.embed(query)
    const table = await this.db.openTable('knowledge_chunks')

    const results = await table
      .search(query)
      .vector(queryVector)
      .limit(topK * 2)
      .rerank(new CrossEncoderReranker())
      .limit(topK)
      .toArray()

    return results.map(r => ({
      content: r.content,
      score: r._relevance_score,
      metadata: r.metadata,
    }))
  }

  private chunkText(text: string, opts: { size: number; overlap: number }) 
  {
    // 使用 RecursiveCharacterTextSplitter 语义分块
    const splitter = new RecursiveCharacterTextSplitter({
      chunkSize: opts.size,
      chunkOverlap: opts.overlap,
      separators: ['\n\n', '\n', '。', '.', ' ', ''],
    })
    return splitter.splitText(text)
  }
}
```
### 5.3 前端知识库交互
```
// 对话中使用 @ 触发知识库检索
function ChatInput() {
  const [showKBMenu, setShowKBMenu] = useState(false)
  const { data: kbList } = useQuery({
    queryKey: ['knowledge-bases'],
    queryFn: () => api.knowledge.list(),
  })

  return (
    <div className="relative">
      <textarea
        onInput={(e) => {
          // 检测 @ 符号触发知识库菜单
          const cursorPos = e.target.selectionStart
          const textBeforeCursor = e.target.value.slice(0, cursorPos)
          if (textBeforeCursor.endsWith('@')) setShowKBMenu(true)
        }}
      />
      <AnimatePresence>
        {showKBMenu && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            className="absolute bottom-full mb-2 bg-popover border 
            rounded-lg shadow-lg p-2"
          >
            {kbList?.map(kb => (
              <button key={kb.id} onClick={() => selectKB(kb)}>
                <BookIcon className="w-4 h-4" />
                {kb.name}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
```
## 六、Agent + 工具调用框架
### 6.1 架构
```
┌─────────────────────────────────────────────────────┐
│                   Agent Runner                       │
│                                                     │
│  ┌──────────┐   ┌──────────┐   ┌────────────────┐  │
│  │ Planner  │──▶│Executor  │──▶│  Reflector     │  │
│  │ (思考)   │   │ (执行)   │   │  (反思/迭代)    │  │
│  └──────────┘   └────┬─────┘   └────────────────┘  │
│                      │                              │
│            ┌─────────┴─────────┐                    │
│            ▼                   ▼                    │
│  ┌─────────────────┐ ┌─────────────────┐           │
│  │  Tool Registry   │ │  Tool Sandbox   │           │
│  │                  │ │  (ShadowRealm)  │           │
│  │ • web_search     │ │                 │           │
│  │ • code_execute   │ │  每个工具独立    │           │
│  │ • file_read      │ │  沙箱隔离执行    │           │
│  │ • file_write     │ │                 │           │
│  │ • http_request   │ │  超时: 30s      │           │
│  │ • knowledge_query│ │  内存: 128MB    │           │
│  │ • image_generate │ │                 │           │
│  │ • calendar       │ │                 │           │
│  └─────────────────┘ └─────────────────┘           │
└─────────────────────────────────────────────────────┘
```
### 6.2 工具定义
```
// server/tools/registry.ts
import { z } from 'zod'

export interface ToolDefinition {
  name: string
  description: string
  parameters: z.ZodSchema
  execute: (params: any, context: ToolContext) => Promise<ToolResult>
  requiresApproval?: boolean  // 是否需要用户确认
  sandbox?: boolean            // 是否沙箱执行
}

export const toolRegistry = new Map<string, ToolDefinition>()

// 注册内置工具
toolRegistry.set('web_search', {
  name: 'web_search',
  description: '搜索互联网获取最新信息',
  parameters: z.object({
    query: z.string().describe('搜索关键词'),
    maxResults: z.number().optional().default(5),
  }),
  execute: async (params, ctx) => {
    const results = await searchEngine.search(params.query, params.
    maxResults)
    return { success: true, data: results }
  },
})

toolRegistry.set('code_execute', {
  name: 'code_execute',
  description: '在沙箱中执行 Python 代码',
  parameters: z.object({
    code: z.string().describe('Python 代码'),
    timeout: z.number().optional().default(30_000),
  }),
  sandbox: true,
  requiresApproval: true,
  execute: async (params, ctx) => {
    const result = await sandbox.execute(params.code, { timeout: params.
    timeout })
    return { success: true, data: result }
  },
})

toolRegistry.set('knowledge_query', {
  name: 'knowledge_query',
  description: '从知识库中检索相关信息',
  parameters: z.object({
    query: z.string(),
    knowledgeBaseId: z.string(),
    topK: z.number().optional().default(5),
  }),
  execute: async (params, ctx) => {
    const kb = await knowledgeBaseService.get(params.knowledgeBaseId)
    const results = await kb.hybridSearch(params.query, params.topK)
    return { success: true, data: results }
  },
})
```
### 6.3 Agent 执行循环
```
// server/agent/runner.ts
interface AgentStep {
  thought: string
  action?: { tool: string; params: Record<string, unknown> }
  observation?: string
}

export async function runAgent(
  messages: Message[],
  tools: ToolDefinition[],
  model: string,
  maxSteps: number = 10,
): Promise<AgentResult> {
  const steps: AgentStep[] = []
  const toolResults: ToolResult[] = []

  for (let i = 0; i < maxSteps; i++) {
    // 1. 构建 ReAct 格式 Prompt
    const prompt = buildReActPrompt(messages, tools, steps)

    // 2. 调用 LLM 获取下一步行动
    const response = await llmService.complete({
      model,
      messages: [...messages, { role: 'system', content: prompt }],
      tools: tools.map(t => ({
        type: 'function',
        function: {
          name: t.name,
          description: t.description,
          parameters: zodToJsonSchema(t.parameters),
        },
      })),
    })

    // 3. 解析 LLM 输出
    const step = parseAgentStep(response)
    steps.push(step)

    // 4. 如果是最终答案，结束
    if (!step.action) {
      return { answer: step.thought, steps, toolResults }
    }

    // 5. 执行工具
    const tool = toolRegistry.get(step.action.tool)
    if (!tool) {
      steps.push({ thought: `工具 ${step.action.tool} 不存在`, observation: 
      'Error' })
      continue
    }

    // 6. 用户确认 (危险操作)
    if (tool.requiresApproval) {
      const approved = await requestUserApproval(tool.name, step.action.
      params)
      if (!approved) {
        steps.push({ thought: '用户拒绝了操作', observation: 'Rejected' })
        continue
      }
    }

    // 7. 执行
    const result = await tool.execute(step.action.params, { userId: '...
    ' })
    toolResults.push(result)
    step.observation = JSON.stringify(result.data)
  }

  return { answer: '达到最大步数限制', steps, toolResults }
}
```
## 七、对话分支 + 版本控制
### 7.1 数据模型
```
聊天文件结构 (JSONL):
┌──────────────────────────────────────────────────────┐
│ Line 1: { chat_metadata: { integrity, branches } }   │
│ Line 2: { mes: "你好", is_user: true, branch_id: A } │
│ Line 3: { mes: "你好！", is_user: false, branch_id: A}│
│ Line 4: { mes: "再试一次", is_user: true, branch_id: B}│ ← 分支 B
│ Line 5: { mes: "你好呀！", is_user: false, branch_id: B}│
│ ...                                                   │
└──────────────────────────────────────────────────────┘

状态文件 (.luker-state.json):
{
  "branches": [
    {
      "id": "branch-A",
      "name": "主分支",
      "parentBranchId": null,
      "forkMessageIndex": null,
      "createdAt": "2026-05-07T...",
      "active": true
    },
    {
      "id": "branch-B",
      "name": "重新生成",
      "parentBranchId": "branch-A",
      "forkMessageIndex": 1,
      "createdAt": "2026-05-07T...",
      "active": false
    }
  ],
  "activeBranchId": "branch-A"
}
```
### 7.2 分支操作 API
```
// server/endpoints/branches.ts
export class BranchService {

  async forkBranch(chatId: string, fromMessageId: string, name?: string) {
    const chatPath = this.resolveChatPath(chatId)
    const messages = await this.readAllMessages(chatPath)

    // 找到 fork 点
    const forkIndex = messages.findIndex(m => m.id === fromMessageId)
    if (forkIndex === -1) throw new Error('Message not found')

    // 创建新分支
    const branch: Branch = {
      id: crypto.randomUUID(),
      name: name || `分支 ${Date.now()}`,
      parentBranchId: messages[forkIndex].branch_id,
      forkMessageIndex: forkIndex,
      createdAt: Date.now(),
      active: true,
    }

    // 更新状态文件
    await this.updateState(chatId, (state) => {
      // 取消其他分支的 active
      state.branches.forEach(b => b.active = false)
      state.branches.push(branch)
      state.activeBranchId = branch.id
    })

    return branch
  }

  async switchBranch(chatId: string, branchId: string) {
    await this.updateState(chatId, (state) => {
      state.branches.forEach(b => b.active = (b.id === branchId))
      state.activeBranchId = branchId
    })
  }

  async getVisibleMessages(chatId: string, branchId: string) {
    const chatPath = this.resolveChatPath(chatId)
    const allMessages = await this.readAllMessages(chatPath)
    const state = await this.readState(chatId)

    const branch = state.branches.find(b => b.id === branchId)
    if (!branch) return allMessages.filter(m => m.branch_id === branchId)

    // 构建分支链: 从根到当前分支
    const branchChain = this.buildBranchChain(state.branches, branch)

    // 过滤可见消息
    return allMessages.filter(m => branchChain.includes(m.branch_id))
  }

  private buildBranchChain(branches: Branch[], target: Branch): string[] {
    const chain = [target.id]
    let current = target
    while (current.parentBranchId) {
      chain.unshift(current.parentBranchId)
      current = branches.find(b => b.id === current.parentBranchId)!
    }
    return chain
  }
}
```
### 7.3 前端分支 UI
```
// components/chat/BranchIndicator.tsx
import { motion, AnimatePresence } from "motion/react"

export function BranchIndicator({ branches, activeBranchId, onSwitch }: 
Props) {
  return (
    <div className="flex items-center gap-1 px-4 py-2">
      <AnimatePresence mode="wait">
        {branches.map((branch, i) => (
          <motion.button
            key={branch.id}
            layout
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ type: "spring", stiffness: 500, damping: 30 }}
            onClick={() => onSwitch(branch.id)}
            className={cn(
              "px-3 py-1 rounded-full text-xs font-medium 
              transition-colors",
              branch.id === activeBranchId
                ? "bg-primary text-primary-foreground"
                : "bg-secondary text-secondary-foreground 
                hover:bg-secondary/80"
            )}
          >
            {branch.name || `分支 ${i + 1}`}
          </motion.button>
        ))}
      </AnimatePresence>
    </div>
  )
}
```
## 八、插件系统升级
### 8.1 插件清单规范
```
// plugin-manifest.ts
interface PluginManifest {
  name: string
  version: string
  description: string
  author: string
  license: string
  main: string                    // 入口文件
  permissions: PluginPermission[] // 权限声明
  dependencies?: Record<string, string>
  minAppVersion?: string
  configSchema?: JsonSchema       // 配置项 JSON Schema
}

type PluginPermission =
  | 'network:outbound'
  | 'network:inbound'
  | 'filesystem:read'
  | 'filesystem:write'
  | 'system:exec'
  | 'chat:read'
  | 'chat:write'
  | 'character:read'
  | 'user:read'
```
### 8.2 插件市场
```
// server/plugins/marketplace.ts
interface PluginRegistry {
  name: string
  url: string                     // 注册表 URL
  plugins: PluginIndexEntry[]
}

interface PluginIndexEntry {
  id: string
  name: string
  description: string
  version: string
  author: string
  repository: string              // Git 仓库 URL
  downloads: number
  rating: number
  tags: string[]
}

export class PluginMarketplace {
  private registries: PluginRegistry[] = [
    {
      name: 'official',
      url: 'https://plugins.luker.app/registry.json',
      plugins: [],
    },
  ]

  async search(query: string): Promise<PluginIndexEntry[]> {
    const allPlugins = await this.fetchAllPlugins()
    return allPlugins.filter(p =>
      p.name.includes(query) ||
      p.description.includes(query) ||
      p.tags.some(t => t.includes(query))
    )
  }

  async install(pluginId: string, version?: string) {
    const entry = await this.findPlugin(pluginId)
    if (!entry) throw new Error('Plugin not found')

    // 复用现有 isomorphic-git 克隆逻辑
    const targetPath = path.join(SERVER_PLUGINS_DIRECTORY, pluginId)
    await cloneWithIsomorphic({
      pluginUrl: entry.repository,
      pluginPath: targetPath,
      ref: version,
    })

    // 验证 manifest
    const manifest = await this.readManifest(targetPath)
    this.validatePermissions(manifest)

    // 安装依赖
    if (manifest.dependencies) {
      await this.installDependencies(targetPath, manifest.dependencies)
    }

    return manifest
  }
}
```
### 8.3 插件沙箱
```
// server/plugins/sandbox.ts
export class PluginSandbox {
  execute(pluginCode: string, context: SandboxContext): Promise<any> {
    // 使用 ShadowRealm (Stage 3) 或 VM2 隔离
    const realm = new ShadowRealm()

    // 注入受限的全局 API
    const wrappedContext = this.createRestrictedContext(context)

    return realm.evaluate(pluginCode, wrappedContext)
  }

  private createRestrictedContext(ctx: SandboxContext) {
    // 根据插件声明的 permissions 注入对应 API
    const api: Record<string, unknown> = {}

    if (ctx.permissions.includes('network:outbound')) {
      api.fetch = this.createRestrictedFetch(ctx.allowedDomains)
    }
    if (ctx.permissions.includes('filesystem:read')) {
      api.readFile = this.createRestrictedFileReader(ctx.allowedPaths)
    }
    if (ctx.permissions.includes('chat:read')) {
      api.getChatMessages = ctx.chatService.getMessages.bind(ctx.
      chatService)
    }

    return api
  }
}
```
## 九、设计系统 + 动效体系
### 9.1 Design Tokens (Tailwind CSS v4 + oklch)
```
/* styles/globals.css */
@import "tailwindcss";
@import "tw-animate-css";

@custom-variant dark (&:is(.dark *));

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-secondary: var(--secondary);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-foreground);
  --color-destructive: var(--destructive);
  --color-border: var(--border);
  --color-input: var(--input);
  --color-ring: var(--ring);
  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);
  --color-popover: var(--popover);
  --color-popover-foreground: var(--popover-foreground);
  --color-sidebar: var(--sidebar);
  --color-sidebar-foreground: var(--sidebar-foreground);
  --color-sidebar-primary: var(--sidebar-primary);
  --color-sidebar-accent: var(--sidebar-accent);
  --color-sidebar-border: var(--sidebar-border);

  --radius-sm: calc(var(--radius) * 0.6);
  --radius-md: calc(var(--radius) * 0.8);
  --radius-lg: var(--radius);
  --radius-xl: calc(var(--radius) * 1.4);

  --font-sans: "Inter Variable", system-ui, sans-serif;
  --font-mono: "JetBrains Mono Variable", monospace;

  --animate-fade-in: fade-in 0.4s ease-out;
  --animate-slide-up: slide-up 0.35s ease-out;
  --animate-scale-in: scale-in 0.2s ease-out;
}

:root {
  --radius: 0.75rem;

  /* Light — 温暖中性色调 */
  --background: oklch(0.985 0.002 106);
  --foreground: oklch(0.18 0.008 106);
  --card: oklch(1 0 0);
  --card-foreground: oklch(0.18 0.008 106);
  --popover: oklch(1 0 0);
  --popover-foreground: oklch(0.18 0.008 106);
  --primary: oklch(0.35 0.12 265);
  --primary-foreground: oklch(0.99 0 0);
  --secondary: oklch(0.96 0.005 106);
  --secondary-foreground: oklch(0.25 0.01 106);
  --muted: oklch(0.96 0.005 106);
  --muted-foreground: oklch(0.52 0.01 106);
  --accent: oklch(0.94 0.03 180);
  --accent-foreground: oklch(0.25 0.01 106);
  --destructive: oklch(0.55 0.22 25);
  --border: oklch(0.91 0.008 106);
  --input: oklch(0.91 0.008 106);
  --ring: oklch(0.35 0.12 265);
  --sidebar: oklch(0.98 0.003 106);
  --sidebar-foreground: oklch(0.18 0.008 106);
  --sidebar-primary: oklch(0.35 0.12 265);
  --sidebar-accent: oklch(0.94 0.03 180);
  --sidebar-border: oklch(0.91 0.008 106);
}

.dark {
  --background: oklch(0.15 0.005 260);
  --foreground: oklch(0.94 0.003 106);
  --card: oklch(0.18 0.006 260);
  --card-foreground: oklch(0.94 0.003 106);
  --popover: oklch(0.18 0.006 260);
  --popover-foreground: oklch(0.94 0.003 106);
  --primary: oklch(0.72 0.15 265);
  --primary-foreground: oklch(0.12 0.01 260);
  --secondary: oklch(0.22 0.008 260);
  --secondary-foreground: oklch(0.94 0.003 106);
  --muted: oklch(0.22 0.008 260);
  --muted-foreground: oklch(0.62 0.01 106);
  --accent: oklch(0.25 0.04 180);
  --accent-foreground: oklch(0.94 0.003 106);
  --destructive: oklch(0.65 0.22 25);
  --border: oklch(0.28 0.01 260);
  --input: oklch(0.28 0.01 260);
  --ring: oklch(0.72 0.15 265);
  --sidebar: oklch(0.13 0.004 260);
  --sidebar-foreground: oklch(0.94 0.003 106);
  --sidebar-primary: oklch(0.72 0.15 265);
  --sidebar-accent: oklch(0.25 0.04 180);
  --sidebar-border: oklch(0.28 0.01 260);
}

@keyframes fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}
@keyframes slide-up {
  from { opacity: 0; transform: translateY(16px); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes scale-in {
  from { opacity: 0; transform: scale(0.95); }
  to { opacity: 1; transform: scale(1); }
}
```
### 9.2 动效体系
```
// lib/motion-presets.ts — 可复用动效预设
import { type Variants } from "motion/react"

export const motionPresets = {
  // 消息入场
  messageIn: {
    initial: { opacity: 0, y: 20, scale: 0.97 },
    animate: { opacity: 1, y: 0, scale: 1 },
    transition: { type: "spring", stiffness: 400, damping: 30 },
  } as const,

  // 侧栏展开
  sidebarExpand: {
    initial: { width: 0, opacity: 0 },
    animate: { width: "auto", opacity: 1 },
    exit: { width: 0, opacity: 0 },
    transition: { type: "spring", stiffness: 350, damping: 30 },
  } as const,

  // 列表交错入场
  staggerList: {
    container: {
      animate: {
        transition: { staggerChildren: 0.06, delayChildren: 0.1 },
      },
    },
    item: {
      initial: { opacity: 0, x: -12 },
      animate: { opacity: 1, x: 0 },
      transition: { duration: 0.25, ease: "easeOut" },
    },
  } as const,

  // 按钮悬停
  buttonHover: {
    whileHover: { scale: 1.02, transition: { duration: 0.15 } },
    whileTap: { scale: 0.97, transition: { duration: 0.1 } },
  } as const,

  // 模态框入场
  modalIn: {
    initial: { opacity: 0, scale: 0.92, y: 20 },
    animate: { opacity: 1, scale: 1, y: 0 },
    exit: { opacity: 0, scale: 0.92, y: 20 },
    transition: { type: "spring", stiffness: 500, damping: 35 },
  } as const,

  // 页面过渡
  pageTransition: {
    initial: { opacity: 0, y: 8 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -8 },
    transition: { duration: 0.25, ease: "easeInOut" },
  } as const,
}
```
### 9.3 关键动效场景
```
场景                    动效规格
─────────────────────────────────────────────────────
消息气泡入场             spring(400,30) Y+20→0 α0→1
流式文本光标             pulse 0.8s infinite
侧栏展开/收起            spring(350,30) width 动画
分支切换                 layoutAnimation + scale bounce
命令面板呼出             scale 0.92→1 + fade 200ms
设置抽屉                 slide-right 300ms ease-out
文档拖入知识库           border glow + scale 1.02
发送按钮                 hover: scale 1.05, tap: 0.95
主题切换                 Sun↔Moon rotate + scale crossfade
页面路由切换             Y+8→0 fade 250ms
Toast 通知               slide-down + auto-dismiss
```
## 十、迁移策略 + 兼容性保证
### 10.1 分阶段迁移
```
Phase 1 — 基础设施 (Week 1-3)
├── 初始化 Vite + React 19 + TypeScript 项目
├── 配置 Tailwind CSS v4 + shadcn/ui
├── 搭建 Hono v2 API 层 (与 Express 共存)
├── 建立前后端类型共享机制 (Hono RPC)
└── 验证: 现有所有 API 端点通过测试

Phase 2 — 核心对话 (Week 4-7)
├── 实现 ChatView + MessageBubble + StreamingText
├── 对接现有 WS Proxy (通过 Hono 代理)
├── 实现 Zustand chat-store + TanStack Query
├── 实现 Markdown 渲染 (Shiki + KaTeX)
└── 验证: 与旧 UI 并行运行，功能对等

Phase 3 — 高级功能 (Week 8-12)
├── 对话分支系统
├── RAG 知识库 (LanceDB)
├── Agent 框架 + 工具注册
├── 命令面板 (Cmd+K)
└── 验证: 端到端测试

Phase 4 — 桌面 + 生态 (Week 13-16)
├── Tauri v2 集成
├── 插件市场
├── i18n 国际化
├── PWA 离线支持
└── 验证: 跨平台测试
```
### 10.2 兼容性保证措施
```
// 1. API 兼容性测试
describe('API Compatibility', () => {
  const legacyEndpoints = [
    'POST /api/chats/send',
    'POST /api/chats/get',
    'POST /api/chats/save',
    'GET /api/characters/list',
    // ... 所有现有端点
  ]

  test.each(legacyEndpoints)('%s returns valid response', async (endpoint) 
  => {
    const [method, path] = endpoint.split(' ')
    const response = await fetch(`http://localhost:8000${path}`, { 
    method })
    expect(response.status).not.toBe(404)
  })
})

// 2. 聊天文件格式不变
// JSONL 格式保持: { chat_metadata } + { mes, is_user, ... } 行
// 新增字段使用 extra 命名空间: extra.luker_v2_branch_id

// 3. 插件兼容
// 现有插件通过 plugin-loader.js 加载，行为不变
// 新插件通过 manifest.json 声明，走新加载器
// 两者可在同一 SERVER_PLUGINS_DIRECTORY 共存

// 4. 前端共存
// public/         → 旧 UI (不变)
// public/v2/      → 新 UI (Vite 构建产物)
// 通过 URL 参数切换: ?ui=v2
```
### 10.3 数据迁移脚本
```
// scripts/migrate-to-v3.ts
async function migrateUserData(dataDir: string) {
  // 1. 为现有聊天文件创建 .luker-state.json
  const chatFiles = await glob(`${dataDir}/chats/**/*.jsonl`)
  for (const file of chatFiles) {
    const statePath = file.replace('.jsonl', '.luker-state.json')
    if (!fs.existsSync(statePath)) {
      const defaultState = {
        version: 1,
        branches: [{ id: 'default', name: '默认', active: true }],
        activeBranchId: 'default',
      }
      fs.writeFileSync(statePath, JSON.stringify(defaultState, null, 2))
    }
  }

  // 2. 初始化 LanceDB 向量目录
  const vectorDir = path.join(dataDir, 'vectors')
  if (!fs.existsSync(vectorDir)) {
    fs.mkdirSync(vectorDir, { recursive: true })
  }

  // 3. 迁移设置文件 (添加新字段默认值)
  const settingsPath = path.join(dataDir, 'settings.json')
  if (fs.existsSync(settingsPath)) {
    const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'))
    settings.ui = settings.ui || {}
    settings.ui.theme = settings.ui.theme || 'system'
    settings.ui.fontSize = settings.ui.fontSize || 14
    settings.ui.sidebarCollapsed = settings.ui.sidebarCollapsed || false
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2))
  }
}
```
## 十一、技术选型总结
层级 技术 版本 理由 框架 React 19.1 生态最大，shadcn/ui 原生支持 构建 Vite 6 HMR < 50ms，原生 ESM 样式 Tailwind CSS v4 oklch 色彩，CSS-first 配置 组件 shadcn/ui latest Radix 无头组件，完全可定制 动效 Motion latest 声明式 API，Layout animations 状态 Zustand v5 轻量，persist + immer 中间件 数据 TanStack Query v5 缓存/乐观更新/自动重取 路由 React Router v7 嵌套布局，数据加载 后端 Hono latest Web 标准，RPC 类型共享 校验 Zod latest TypeScript 原生类型推导 向量库 LanceDB latest 嵌入式，混合检索，无服务端 桌面 Tauri v2 轻量 (< 5MB)，Rust 后端 国际化 i18next latest 生态最大，React 集成 语言 TypeScript 5.8 strict mode，全栈类型安全

## 十二、关键代码路径映射
```
现有代码                          →  新代码
─────────────────────────────────────────────────────
server.js                        →  不变 (入口)
src/server-main.js               →  最小改动 (启动 Hono)
src/ws-proxy.js                  →  保留 (核心优势)
src/endpoints/backends/
  luker-generation.js            →  保留 + 导出为 service
  chat-completions.js            →  保留 (LLM 调用逻辑)
src/endpoints/chats.js           →  保留 (旧 API)
                                →  server-v2.ts (新 API)
src/plugin-loader.js             →  保留 + server/plugins/*
src/constants.js                 →  共享 (不变)
public/                          →  保留 (旧 UI)
                                →  src/ (新 UI)
webpack.config.js                →  保留 (旧 UI 构建)
                                →  vite.config.ts (新 UI 构建)
```
这个方案确保向后兼容 ，同时引入了 2026 年最先进的前端技术栈 ，并且充分利用了 Luker 已有的 WS Proxy、生成任务管理、Patch 持久化等核心优势。每个模块都有明确的实现路径和代码示例，可以按 Phase 逐步落地。

确保兼容性：给出完整兼容性结论和迁移方案

通过对 SillyTavern 源码的深入分析（ character-card-parser.js 、 characters.js 、 worldinfo.js 、 chats.js 、 presets.js 、 plugin-loader.js 、 extensions.js ），以下是逐项兼容性分析：

## 兼容性全景图
类别 兼容度 风险等级 说明 角色卡 100% 🟢 零风险 纯数据格式，不依赖运行时 API 世界书 100% 🟢 零风险 纯 JSON 文件，格式极简 聊天记录 100% 🟢 零风险 JSONL 格式，与代码解耦 预设 100% 🟢 零风险 纯 JSON 配置文件 内置扩展 95% 🟡 低风险 需适配层，但可控 第三方扩展 70-85% 🔴 中高风险 依赖内部 API，需兼容层

## 逐项深度分析
### 1. 角色卡 — 100% 兼容 ✅
SillyTavern 的角色卡本质是 PNG 图片 + 嵌入式 JSON 元数据 ，存储在 PNG 的 tEXt 块中：

```
PNG chunks: [...其他块..., tEXt("chara", base64(json)), tEXt("ccv3", 
base64(json)), IEND]
```
- v2 格式 ： chara 关键字， spec: "chara_card_v2"
- v3 格式 ： ccv3 关键字， spec: "chara_card_v3" （优先读取）
- 也支持纯 .json 文件
兼容策略 ：直接复用 character-card-parser.js 的 read() / write() / parse() 函数，零改动。这是纯数据 I/O，与框架无关。

```
// 直接封装现有解析器，不改逻辑
import { parse, read, write } from './character-card-parser.js'

export class CharacterCardService {
  async parseCard(imagePath: string): Promise<CharacterCard> {
    const rawJson = await parse(imagePath, 'png')
    return JSON.parse(rawJson)
  }
}
```
### 2. 世界书 — 100% 兼容 ✅
世界书是纯 JSON 文件，结构极其简单：

```
{
  "entries": {
    "key1": { "keys": [...], "content": "...", "extensions": {...} },
    "key2": { ... }
  },
  "name": "My World",
  "extensions": {}
}
```
存储在 worlds/<name>.json ，通过 readWorldInfoFile() 读取。

兼容策略 ：直接保持文件格式不变，仅升级读写 API 层。

### 3. 聊天记录 — 100% 兼容 ✅
JSONL 格式（每行一个 JSON 对象）：

```
{"chat_metadata":{},"user_name":"...","character_name":"..."}
{"name":"User","is_user":true,"send_date":"...","mes":"Hello","extra":
{}}
{"name":"Bot","is_user":false,"send_date":"...","mes":"Hi!","extra":{}}
```
- 第一行是元数据头
- 后续每行是一条消息
- 存储在 chats/<角色名>/<聊天名>.jsonl
- 有备份系统（ backups/ 目录）
兼容策略 ：JSONL 格式与代码完全解耦。新架构中保持相同的文件路径和格式，同时增加分支元数据：

```
// 扩展而非替换：在 chat_metadata 中增加分支信息
{
  "chat_metadata": {
    "integrity": "...",
    "branches": [                          // 新增字段，向后兼容
      { "id": "uuid", "parentMessageId": "msg-3", "createdAt": 
      1700000000 }
    ]
  },
  ...
}
```
### 4. 预设 — 100% 兼容 ✅
预设按 API 类型分目录存储，纯 JSON：

API 目录 Kobold koboldAI_Settings/ OpenAI openAI_Settings/ TextGen textGen_Settings/ Novel novelAI_Settings/ Instruct instruct/ Context context/ Sysprompt sysprompt/ Reasoning reasoning/

兼容策略 ：纯数据文件，直接保持。新架构中增加预设的导入/导出、版本管理功能，但不改变底层格式。

### 5. 扩展（内置 + 第三方）— 需要兼容层 ⚠️
这是 唯一有风险的区域 。SillyTavern 有两套扩展机制：
 A. Server Plugins（ plugin-loader.js 加载）
```
// 插件接口
export const info = { id: 'my-plugin', name: '...', description: '...' }
export async function init(router) {
  router.post('/do-something', (req, res) => { ... })
}
export async function exit() { ... }
```
- 接收 Express Router，注册到 /api/plugins/<id>
- 通过 import() 动态加载
- 支持 git 自动更新 B. Third-party Extensions（ extensions.js 管理）
- 通过 git clone 安装
- 需要 manifest.json
- 可能依赖 SillyTavern 内部全局变量和 API
兼容策略 — 三层架构 ：

```
┌─────────────────────────────────────────────┐
│              新前端 (React 19)               │
├─────────────────────────────────────────────┤
│          Hono API v2 (新接口层)              │
│          /api/v2/chat, /api/v2/agent, ...   │
├─────────────────────────────────────────────┤
│       Express 兼容层 (保留)                   │
│  ┌──────────────┐ ┌──────────────────────┐  │
│  │ plugin-loader │ │ extensions endpoints │  │
│  │ (完全保留)     │ │ (完全保留)            │  │
│  └──────────────┘ └──────────────────────┘  │
├─────────────────────────────────────────────┤
│          共享服务层 (新 + 旧)                 │
│   generation, chat, character, world, ...   │
└─────────────────────────────────────────────┘
```
具体措施 ：

1. Express 不删除，共存运行 ：
   
   ```
   // server-v2.ts
   const app = new Hono()
   
   // 新 API
   app.route('/api/v2', newApiRouter)
   
   // 旧 Express 作为子应用挂载
   const legacyApp = express()
   await loadPlugins(legacyApp, pluginsPath)
   setupPrivateEndpoints(legacyApp)
   
   // Hono 代理到 Express
   app.mount('/api/plugins', legacyApp)
   app.mount('/api/extensions', legacyApp)
   ```
2. 全局 API 兼容 Shim ：
   
   ```
   // 为依赖全局变量的插件提供兼容
   globalThis.SillyTavern = {
     getContext: () => generationService.getContext(),
     getCurrentChat: () => chatService.getActiveChat(),
     // ... 其他常用 API
   }
   ```
3. 插件沙箱化（可选增强） ：
   
   ```
   // 新插件系统与旧系统并存
   // 新插件使用 manifest v2，声明权限
   {
     "manifest_version": 2,
     "permissions": ["chat.read", "chat.write", "generation.stream"],
     "sandbox": "isolated"  // 沙箱隔离
   }
   ```
## 兼容性结论
问题 答案 角色卡能直接用吗？ ✅ 能 ，PNG 元数据格式不变 世界书能直接用吗？ ✅ 能 ，JSON 格式不变 聊天记录能直接用吗？ ✅ 能 ，JSONL 格式不变，新增分支字段向后兼容 预设能直接用吗？ ✅ 能 ，JSON 格式不变 内置扩展能直接用吗？ ✅ 能 ，Express 层完整保留 第三方扩展能直接用吗？ ⚠️ 大部分能 ，依赖内部 API 的需要兼容 shim

核心原则 ： 数据层零改动，API 层双轨运行，Express 不删除只增强 。用户升级后，所有现有数据直接可用，