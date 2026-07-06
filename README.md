# CraftTalker (语琢)

**English** | [中文](README_ZH.md)

Last updated: 2026-07-07

CraftTalker / Yuzhuo is a modern React/Vite + Hono roleplay chat app for SillyTavern-compatible assets. It is an independent product, not a thin Luker UI and not a broad SillyTavern/Luker proxy. The current direction is to keep the native CraftTalker UX fast and typed while preserving ST data, adding carefully bounded ST compatibility bridges, and leaving room for a future Harness runtime.

> Status: active work in progress. The native app, provider system, data adapters, and targeted ST extension compatibility host are usable. Full SillyTavern prompt/runtime behavior parity and the long-term Harness runtime are not complete.

## Current Highlights

- Modern chat UI with React 19, Vite 8, Tailwind CSS v4, framer-motion, lucide icons, React Router, TanStack Query, Zustand, i18next, lazy dialog routes, and ErrorBoundary coverage.
- SSE chat generation through `NativeEngine`, with per-chat frontend streaming state, server-side per-chat generation locks, Stop, Regenerate, Continue, Swipe, edit/delete, chat rename, and recoverable generation run records.
- Provider catalog for OpenAI-compatible APIs, Claude/Anthropic, Gemini, Azure OpenAI, native Ollama, LM Studio, vLLM, llama.cpp, common gateways, and custom protocol-specific entries. New API keys flow through `/api/llm-sessions` so frontend settings persist session ids instead of raw newly entered keys.
- Markdown rendering with GFM, DOMPurify allow-lists, safe external links, lazy Shiki highlighting, and KaTeX math.
- ST-compatible public script shims, extension resource serving, a lazy frontend ST extension host, a compatibility drawer, DOM anchors/mirrors, plugin diagnostics, and an optional `npm run audit:st-shims` named-export audit.
- Hono backend routes for native app APIs plus constrained ST-compatible surfaces: characters, chats, worlds, presets, engine, runs, LLM sessions/models, extensions, chat-completions backends, worldinfo, tokenizers, files, avatars, image-backend pings, root scripts, `/version`, `/thumbnail`, `/user/files`, `/User Avatars`, and `/cors`.

## Compatibility Reality

CraftTalker aims for strong SillyTavern compatibility, but it should not be described as "100% ST-compatible". The implementation separates these layers:

- ST data compatibility: preserve file shapes, unknown fields, extension payloads, and original asset semantics wherever current adapters cover them.
- ST behavior compatibility: implement or bridge important behaviors behind explicit compatibility modules, routes, and diagnostics.
- CraftTalker native UX: React/Hono workflows and typed services that do not depend on ST globals or ST DOM ids.
- Harness future: a separate RP runtime with state, memory, tools, event journals, validation, artifacts, and explicit commit boundaries.

Implemented or partially implemented today:

| Area | Current state |
| --- | --- |
| Character cards and assets | PNG `chara` and V3 `ccv3` reads; V3 PNG writes include both `chara` and `ccv3`; JSON import/export uses a ST-like serializer. Common V2/V3 unknown fields, `assets`, group greetings, nicknames, extension payloads, and `extensions.regex_scripts` are preserved. Imported PNG cards keep `character.png`; custom display avatars use `avatar.png`; avatar/card reads have ST-style `/characters/<name>.png` and `/thumbnail` compatibility. |
| Character APIs | Native CRUD/export routes remain, plus constrained ST-style multipart `/api/characters/import`, FormData `/api/characters/create` and `/api/characters/edit`, read-only `POST /api/characters/export`, and typed `data.extensions` writeback for common plugin state. Broad arbitrary character mutation remains out of scope. |
| Chat JSONL | Metadata and unknown message fields are preserved on edit/swipe/message-variable paths. New messages use ISO send dates. Swipe, Continue, Regenerate, rename, raw JSONL read for specific ST lookups, constrained JSONL import, and typed message `variables` / `variables_initialized` persistence are implemented. Group chat is intentionally blocked until a real group model exists. |
| Generation and runs | Per-chat locks guard send/stream/regenerate/continue. Generation runs are persisted under `data/runs/` with status, partial content, error, timestamps, and committed line index. Runs intentionally do not store API keys, prompts, messages, session ids, or full request configs. Recoverable partial runs can be committed or discarded through `/api/runs`. |
| World info | Shared generation and public prompt checks use `world-info-runtime.service.ts`. Character/global/chat/persona sources, tokenizer budgets, macros, scan injects, forced/vector activation metadata, sticky/cooldown timing, and ST-shaped `/api/worldinfo/check` are supported. ST world-info positions now include `0-7`, with `7=outlet`. Vectorized entries are still skipped until a real vector runtime exists. |
| World books | Character primary binding via `extensions.world`, additional bindings through constrained `extensions.worlds`, enabled global books, bind/unbind, ST-shaped settings, empty world creation, existing-world save bridges, in-memory entry helpers, and global selection bridges exist. Whole-book delete, arbitrary settings writes, and unsafe world-info mutation stay blocked. |
| Presets | Generation presets stay in ST-style `.settings` directories. Template preset directories (`instruct`, `context`, `sysprompt`, `reasoning`) are raw JSON and preserve unknown fields, including preset-level `regex_scripts`. |
| Provider compatibility | Native generation and ST host chat-completions bridges reuse the provider catalog and body builders. OpenAI-compatible, OpenAI Responses, Claude Messages, Gemini generateContent, Azure deployment chat, and Ollama native chat are represented as explicit formats. Vertex and other unimplemented surfaces fail explicitly instead of silently routing to the wrong provider. |
| ST extensions | Local/system/global extension discovery, manifest/resource serving, compatibility reports, settings persistence, read-only version snapshots, public shims, popup/dialog compatibility, slash-command fallbacks, tags/persona/group-name facades, chat-completions service bridge, extension settings drawer, and target-plugin smoke coverage exist for the local JS-Slash-Runner, LittleWhiteBox, and ST-Prompt-Template audit set. This is partial runtime compatibility, not full arbitrary extension parity. |
| Files, avatars, media, proxies | Extension-owned `/user/files` and `/api/files/*` storage is constrained to safe names/types. Persona avatars use constrained `/api/avatars/*` and `/User Avatars/*` bridges. Message media rendering is DOM-only compatibility. Generic `/cors` and SD/Comfy pings are fail-closed by default and require explicit allowlist environment variables for narrow trusted probes. |
| Harness | The Harness direction is documented, but it is not implemented as a completed runtime. Current code should still be understood as the native app plus compatibility bridges. |

## Security And Reliability

Current hardening includes:

- Path containment through `server/src/lib/path-utils.ts` and `path.relative`.
- Character import limited to `.png` and `.json`; direct path imports are constrained to `LUKER_IMPORT_DIR` or the temp import directory.
- Upload temp files use `safePath` and `randomUUID`; user files, persona avatars, extension resources, character assets, and compatibility proxy paths validate names and base containment.
- Markdown/XSS hardening through DOMPurify allow-lists, sanitized highlighted HTML, stripped dangerous protocols/styles/handlers, and safe external links.
- First-stage server-side LLM key sessions through `/api/llm-sessions`; legacy client encrypted settings remain as migration/local-storage support.
- CORS and CSRF share `server/src/config/origins.ts`; CSRF applies outside `test` and `development`.
- Extension management, generic CORS proxying, SD/Comfy proxying, group chat, and unsafe script execution fail closed unless a narrow trusted bridge exists.
- Vite/Rolldown build input and vendor splitting are configured so the latest known build has no large-chunk warning; the ST extension host stays in a lazy async chunk.

Important remaining work:

- In-memory LLM key sessions need a production vault/session/proxy design.
- Production CSRF/session behavior needs deployment-oriented tests.
- Long-stream cleanup, multi-process generation locking, and durable queue/worker behavior still need review.
- ST compatibility needs continued real-asset and real-plugin audits, especially around deeper world-info recursion/vector behavior, chat edge payloads, attachments, media, quick replies, reasoning/logprobs, presets, and extension data.

## Tech Stack

| Layer | Current implementation |
| --- | --- |
| Frontend | React 19.2, Vite 8.0, TypeScript 6.0, React Router 7.15, TanStack Query 5.100, TanStack Virtual 3.13, Zustand 5.0 |
| Styling/UI | Tailwind CSS v4, framer-motion, lucide-react, custom CSS variables |
| Rendering | marked, DOMPurify, lazy Shiki, KaTeX |
| ST compatibility frontend deps | jQuery 4, lodash 4, showdown 2, toastr 2, highlight.js 11, local public ST shims |
| Backend | Hono 4, `@hono/node-server`, Zod 3, TypeScript 5.6, tiktoken |
| Testing | Vitest 4, React Testing Library, jsdom |
| Storage | File-backed data under `server/data` by default, overridable with `LUKER_DATA_DIR` |

Legacy note: `luker-ui`, `luker-server`, `LUKER_DATA_DIR`, and similar names are internal compatibility-era identifiers. User-visible naming is CraftTalker / Yuzhuo; broad key/path/package renames are intentionally delayed until a safe migration exists.

## Getting Started

### Requirements

- Node.js 20.19+ or 22.12+ for the current Vite 8 toolchain.
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

The Vite dev server proxies `/api`, ST script/resource roots, `/version`, `/user/files`, `/User Avatars`, `/characters`, `/thumbnail`, and `/cors` to the backend. Set `CRAFTTALKER_API_TARGET` if the backend is not on `http://localhost:3000`.

On Windows, `start.bat` checks the required Node version, installs or repairs frontend/backend dependencies, prepares data directories, starts the backend, and launches the Vite dev server.

### Build

```bash
# Frontend
npm run build

# Backend
cd server
npm run build
```

`npm run preview` previews the built frontend. After `npm run build` in `server`, start the backend with `npm start` from `server`.

## Environment Variables

| Variable | Purpose |
| --- | --- |
| `PORT` | Backend port; defaults to `3000`. |
| `LUKER_DATA_DIR` | Overrides backend data storage directory; default is `server/data`. |
| `LUKER_IMPORT_DIR` | Allows direct character imports from a controlled directory; default is temp `luker-import`. |
| `ALLOWED_ORIGINS` | Comma-separated additional origins for CORS/CSRF checks. |
| `CRAFTTALKER_API_TARGET` | Vite dev proxy target; defaults to `http://localhost:3000`. |
| `CRAFTTALKER_ST_CORS_PROXY_ENABLED` | Set to `true` to enable the constrained ST `/cors` proxy. Disabled by default. |
| `CRAFTTALKER_ST_CORS_PROXY_ALLOWLIST` | Trusted host allowlist for the constrained `/cors` proxy. |
| `CRAFTTALKER_ST_IMAGE_BACKEND_PING_ENABLED` | Set to `true` to enable trusted SD/Comfy ping-only probes. Disabled by default. |
| `CRAFTTALKER_ST_IMAGE_BACKEND_ALLOWLIST` | Exact trusted origins for SD/Comfy ping-only probes. |
| `NODE_ENV` | `test` and `development` skip CSRF middleware for local tooling. |

## Project Structure

```text
CraftTalker/
├── src/                        # Frontend (React + Vite)
│   ├── components/             # Character, chat, layout, settings, world book, UI
│   ├── hooks/                  # Query and app workflow hooks, including runs
│   ├── lib/                    # API facade, domain clients, i18n, storage, ST host bridge
│   ├── locales/                # Translation files
│   ├── routes/                 # Lazy dialog/route components
│   ├── stores/                 # Zustand stores
│   └── types.ts                # Shared frontend types
├── server/                     # Backend (Hono + Node)
│   ├── src/
│   │   ├── config/             # Provider and origin config
│   │   ├── engine/             # NativeEngine, body/stream builders, STEngine skeleton
│   │   ├── lib/                # JSONL, PNG/cards, macros, paths, tokenizer, ST compat helpers
│   │   ├── middleware/         # Error and CSRF middleware
│   │   ├── routes/             # Native and ST-compatible API routes
│   │   └── services/           # Character/chat/preset/world/run/provider/extension services
│   └── data/                   # Default user data, runs, extensions, files, avatars
├── public/                     # Static assets and ST-compatible root/public scripts
├── scripts/                    # Local audits, including ST public-shim import audit
├── docs/                       # Agent notes, active priorities, verification, architecture docs
├── vite.config.ts              # Vite, Tailwind, proxy, build splitting, Vitest config
└── start.bat                   # Windows development launcher
```

## Verification

Most recent known local baseline from 2026-07-07:

- Root `npm run test`: 17 files / 176 frontend/root tests passed. Root Vitest now excludes `server/**`.
- Server `npm run test`: 24 files / 281 tests passed.
- Root and server typechecks passed.
- Root and server builds passed; no Vite large chunk warning.
- `npm run audit:st-shims` passed with 610 scanned files, 501 named imports, and 10 namespace/default imports.
- `git diff --check` reported no whitespace errors, aside from normal Windows LF-to-CRLF warnings in the dirty worktree.

Useful checks after code changes:

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

Run heavy frontend tests, frontend build, server tests, and server build sequentially when checking stability.

## Roadmap Focus

- Harden in-memory LLM key sessions into a production vault/session/proxy design.
- Continue ST compatibility audits against real assets and real plugin behavior while keeping the host boundary explicit and typed.
- Improve long-stream cleanup and evolve `data/runs/` toward a durable generation queue/worker model.
- Keep footprint hygiene visible: third-party extension corpora, logs, screenshots, caches, dependency folders, and generated artifacts are not core product source.
- Keep PC as React/Vite Web or PWA and Hono/Node as the main backend until concrete constraints justify another host. Tauri/Rust remains an optional fallback, not the default direction.
- Grow Harness deliberately, starting with intent/context/run-journal/commit boundaries rather than a hidden second runtime.

## License

This project is licensed under the GNU Affero General Public License v3.0. See [LICENSE](LICENSE).
