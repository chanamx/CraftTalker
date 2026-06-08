# CraftTalker (语琢)

**English** | [中文](README_ZH.md)

Last updated: 2026-06-09

CraftTalker is a modern React/Vite + Hono roleplay chat app for SillyTavern-compatible assets. It is being developed as an independent product, not as a thin Luker or SillyTavern skin, while still preserving compatibility with real character cards, chats, world books, and presets where the current code supports them.

> Status: active work in progress. The native engine and compatibility adapters are usable, but full SillyTavern prompt/runtime behavior parity is not complete yet.

## Current Highlights

- Modern chat UI with React 19, Vite 8, Tailwind CSS v4, framer-motion, lucide icons, React Router, TanStack Query, Zustand, and i18next.
- Character sidebar, character detail panel, first-run onboarding, route-level dialogs, responsive layout, light/dark theme, toast messages, and ErrorBoundary coverage with expanded browser-side diagnostics when Developer Mode is enabled.
- SSE streaming chat with per-chat frontend stream state, duplicate stream guards, Stop, Regenerate, Continue, Swipe, message edit/delete, chat creation/deletion, and chat display rename.
- Markdown rendering with GFM, sanitized HTML, safe external links, Shiki code highlighting, and KaTeX math rendering.
- Hono backend routes for characters, chats, world books, presets, engine selection, and health checks.
- Engine abstraction with `NativeEngine` as the active generation path and `STEngine`/worker code present as a SillyTavern-behavior skeleton.

## Compatibility Reality

CraftTalker aims for strong SillyTavern data compatibility, but the current code should not be described as "100% compatible". The project currently separates three layers:

- Data compatibility: preserve source file structure and unknown fields where adapters already cover them.
- Behavior compatibility: match ST behavior where implemented; exact prompt-building parity remains future work.
- CraftTalker UX: modern React workflows around imported and native data.

Implemented or partially implemented today:

| Area | Current state |
| --- | --- |
| Character cards | PNG `chara` and V3 `ccv3` reads; V3 PNG writes include both `chara` and `ccv3`; JSON import/export goes through a ST-like serializer. Common V2/V3 unknown top-level/data fields, assets, group greetings, nicknames, extension payloads, and `extensions.regex_scripts` are preserved by current adapters. |
| Character import | PNG imports keep the original card as `character.png`; `avatar.png` is only for custom display avatars; avatar lookup falls back to `character.png`. Embedded `character_book` data is extracted into a bound world book. |
| Chats | JSONL chats are read/written with metadata and unknown message fields retained by object merge paths. Swipe data is supported. Full coverage for every ST JSONL edge field is still under audit. |
| World books | Character-bound books via `character.extensions.world`, enabled global books, bind/unbind, enabled/disabled state, keyword matching, secondary keys, regex keys, case sensitivity, whole-word matching, probability, ordering, and ST-like positions `0-6`. Deeper recursive/group/vector behavior still needs more audit. |
| Presets | Generation presets stay in ST-style `.settings` directories (`koboldAI_Settings`, `openAI_Settings`, `textGen_Settings`, `novelAI_Settings`). Template preset directories (`instruct`, `context`, `sysprompt`, `reasoning`) are recognized as JSON. Raw template preset preservation through every UI/API path should still be rechecked before claiming full parity. |
| Macros | Prompt-time macro resolution exists and is treated as a view over prompt inputs, not a mutation of source character/world data. |

## Security And Reliability

Recent hardening in the current codebase includes:

- Path containment with `server/src/lib/path-utils.ts` and `path.relative`.
- Character import restricted to `.png` and `.json`, with direct path imports limited to `LUKER_IMPORT_DIR` or the temp import directory.
- Upload temp files created with `safePath` and `randomUUID`.
- Markdown/XSS hardening through DOMPurify allow-lists, sanitized Shiki output, stripped unsafe protocols/styles/handlers, and safe `target="_blank"` links.
- Client settings stored through encrypted Web Crypto storage as a transitional measure, with plaintext migration on first read.
- CORS and CSRF origin handling sharing `server/src/config/origins.ts`; CSRF applies outside test/development mode.

Important remaining security work:

- Client-side encrypted API key storage is not the final production model. Production should move keys server-side and expose session/proxy access to the UI.
- Production CSRF/session behavior needs a complete deployment story and tests.
- Long streaming responses still accumulate full generated content server-side before saving.

## Tech Stack

| Layer | Current implementation |
| --- | --- |
| Frontend | React 19, Vite 8, TypeScript 6, React Router 7, TanStack Query 5, Zustand 5 |
| Styling/UI | Tailwind CSS v4, framer-motion, lucide-react, custom CSS variables |
| Rendering | marked, DOMPurify, Shiki, KaTeX |
| Backend | Hono, `@hono/node-server`, Zod, TypeScript 5.6 |
| Testing | Vitest, React Testing Library, jsdom |
| Storage | Local frontend state plus backend files under `server/data` by default |

Dependency note: the current source uses packages such as `react-router`, `i18next`, `react-i18next`, `zustand`, `shiki`, and `katex`. They are present in the current lockfile/install tree, but dependency manifest/lockfile consistency should be rechecked before dependency cleanup or a fresh distribution claim.

## Getting Started

### Requirements

- Node.js 20.19+ or 22.12+ is recommended for the current Vite/Vitest 8 toolchain.
- npm from the matching Node.js installation.

### Install

```bash
npm install
cd server
npm install
cd ..
```

### Run In Development

Use two terminals:

```bash
# Terminal 1: backend on http://localhost:3000
cd server
npm run dev
```

```bash
# Terminal 2: frontend on http://localhost:5173
npm run dev
```

The Vite dev server proxies `/api` to `http://localhost:3000`.

On Windows, `start.bat` can install missing dependencies, prepare data directories, start the backend, and launch the Vite dev server. The script still contains some legacy Luker naming in window titles/output.

### Build

```bash
# Frontend
npm run build

# Backend
cd server
npm run build
```

`npm run preview` previews the built frontend. The backend build can be started with `npm start` from `server` after `npm run build`.

## Environment Variables

| Variable | Purpose |
| --- | --- |
| `PORT` | Backend port; defaults to `3000`. |
| `LUKER_DATA_DIR` | Overrides backend data storage directory; default is `server/data`. |
| `LUKER_IMPORT_DIR` | Allows direct character imports from a controlled directory; default is a temp `luker-import` directory. |
| `ALLOWED_ORIGINS` | Comma-separated additional allowed origins for CORS/CSRF checks. |
| `NODE_ENV` | `test` and `development` skip CSRF middleware for local tooling. |

## Project Structure

```text
CraftTalker/
├── src/                        # Frontend (React + Vite)
│   ├── components/             # Character, chat, layout, settings, world book, UI
│   ├── hooks/                  # Query and app workflow hooks
│   ├── lib/                    # API client, i18n, secure storage, toast, utilities
│   ├── locales/                # Translation files
│   ├── routes/                 # Dialog/route components
│   ├── stores/                 # Zustand stores
│   └── types.ts                # Shared frontend types
├── server/                     # Backend (Hono + Node)
│   ├── src/
│   │   ├── config/             # Provider/origin config
│   │   ├── engine/             # NativeEngine and STEngine skeleton
│   │   ├── lib/                # JSONL, PNG/card parsing, macros, paths, world matching
│   │   ├── middleware/         # Error and CSRF middleware
│   │   ├── routes/             # /api routes
│   │   └── services/           # Character/chat/preset/world services
│   └── data/                   # Default user data directory
├── public/                     # Static assets
├── vite.config.ts              # Vite, Tailwind, proxy, build config
└── start.bat                   # Windows development launcher
```

## Verification

Useful checks after code changes:

```bash
npm run test
npm run build
cd server
npm run test
npm run build
cd ..
git diff --check
```

## Roadmap Focus

- Move API keys and provider calls to a server-side session/proxy model.
- Continue ST compatibility audits for preset payloads, chat JSONL edge fields, world book recursion/groups/vector fields, and exact prompt behavior.
- Improve long-stream memory behavior and consider server-side generation locks per chat.
- Keep CraftTalker/语琢 as the user-facing product direction while delaying broad internal `luker-*` renames until a safe migration plan exists.

## License

This project is licensed under the GNU Affero General Public License v3.0. See [LICENSE](LICENSE).
