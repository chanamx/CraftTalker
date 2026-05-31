# CraftTalker (语琢)

A modern chat frontend for the SillyTavern/Luker ecosystem, built with React 19 + Hono.

## Features

- 🎨 Modern UI — React 19 + Tailwind CSS v4 + framer-motion
- 💬 Real-time Chat — SSE streaming, Markdown rendering, virtual scrolling
- 🤖 Multi-LLM — OpenAI / Kobold / TextGen / NovelAI
- 📖 World Book — Character-bound and global world info management
- 🎭 Character Cards — PNG V2/V3 import, full editor, clone, export
- ⚙️ Presets — Sampling parameter presets for different API types
- 🌙 Dark/Light Theme — oklch Design Tokens
- 📱 Responsive — Desktop three-column + mobile drawer layout
- 🚀 Onboarding — 3-step first-run wizard

## Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Frontend | React + Vite + TypeScript | 19.2 / 8.0 / 6.0 |
| Styling | Tailwind CSS v4 (oklch) | 4.2 |
| Animation | framer-motion | 12 |
| State | Zustand + persist | — |
| Server State | TanStack Query | v5 |
| Backend | Hono + Zod | 4.6 |
| Testing | Vitest + React Testing Library | 4.1 |

## Getting Started

### Prerequisites

- Node.js >= 18
- npm >= 9

### Install & Run

```bash
# Install frontend dependencies
npm install

# Install backend dependencies
cd server && npm install && cd ..

# Start development servers (frontend :5173, backend :3000)
npm run dev
```

Or use the one-click launcher:

```bash
start.bat
```

### Build for Production

```bash
npm run build
```

## Project Structure

```
CraftTalker/
├── src/                        # Frontend (React + Vite)
│   ├── components/             # UI components
│   │   ├── character/          # Character editor, panel, import
│   │   ├── chat/               # Chat area, input, messages
│   │   ├── layout/             # App layout
│   │   ├── onboarding/         # First-run wizard
│   │   ├── settings/           # Settings & presets
│   │   ├── sidebar/            # Character sidebar
│   │   ├── ui/                 # Shared UI primitives
│   │   └── world/              # World book editor
│   ├── hooks/                  # Custom React hooks
│   ├── lib/                    # Utilities, API client, i18n
│   ├── locales/                # Translation files
│   ├── routes/                 # Route components
│   ├── stores/                 # Zustand stores
│   └── types.ts                # Shared TypeScript types
├── server/                     # Backend (Hono)
│   ├── src/
│   │   ├── engine/             # LLM engine (NativeEngine / STEngine)
│   │   ├── lib/                # JSONL, PNG parser, prompt builder
│   │   ├── middleware/         # Error handler
│   │   ├── routes/             # API routes
│   │   └── services/           # Business logic
│   └── data/                   # User data (gitignored)
└── public/                     # Static assets
```

## Data Compatibility

CraftTalker is 100% data-compatible with SillyTavern/Luker:

| Data Type | Format | Compatibility |
|-----------|--------|--------------|
| Character Cards | PNG V2/V3 metadata | ✅ 100% |
| Chat Logs | JSONL | ✅ 100% |
| World Books | JSON | ✅ 100% |
| Presets | JSON (.settings) | ✅ 100% |

## License

This project is licensed under the GNU Affero General Public License v3.0 — see the [LICENSE](LICENSE) file for details.
