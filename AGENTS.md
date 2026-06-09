# CraftTalker / 语琢 Agent Notes

Last updated: 2026-06-10

## Project Position

CraftTalker is an independent modernization of the SillyTavern ecosystem, not a Luker sub-UI. Keep the current React/Vite/Hono codebase and advance it conservatively.

Core goals:

- Preserve SillyTavern data compatibility for character cards, world books, presets, chats, regex data, extension data, and plugin-facing assets.
- Keep compatibility mode as a medium/long-term runtime mode, not only as a one-time importer.
- Grow CraftTalker native capabilities gradually: cleaner prompt engine, Agent/Harness features, RAG, tool execution, and better visual workflows.

Do not conflate these layers:

- ST data compatibility: preserve unknown fields and original file semantics.
- ST behavior compatibility: prefer running or adapting ST key JS logic where exact behavior matters.
- CraftTalker native UX: modern React UI and clean state management around compatibility data.
- Harness/Agent future: separate heavy agent runtime, state, skills, tools, and observability.

## Harness / RP Execution Boundary

CraftTalker's best Harness target is a controlled narrative role runtime, not
just "chat plus tools". The runtime should manage instruction/persona anchoring,
typed RP state, memory, world knowledge, rule checks, tool permissions, run
events, artifacts, and explicit commit into chat.

Keep these paths separate:

- Compatibility path: preserve ST file semantics, unknown fields, JSONL chats,
  character cards, world books, presets, regex scripts, extension payloads, and
  exact behavior adapters where needed.
- Native RP path: keep the existing `NativeEngine` route fast, modern, stable,
  and provider-compatible while improving prompt assembly, macro/world-info
  behavior, runs, recovery, and UI.
- Harness path: introduce `GenerationIntent`, `ContextFrame`, run journal,
  constrained workspace/artifacts, state/memory patches, validation, and a
  `Committer` boundary. The model must not directly mutate chat JSONL, ST source
  assets, API keys, or arbitrary filesystem paths.

Preferred first kernel:

- `GenerationIntent` classifies normal reply, continue, regenerate, swipe
  candidate, state advance, background memory update, world query, and tool
  backed scene action before prompt assembly.
- `ContextFrame` carries the structured character view, user persona, chat
  window, activated world-info snapshot, preset/profile policy, RP state, memory
  summaries, and allowed tools.
- Run records should evolve toward append-only events plus artifacts such as
  `output/main.md`, `state_patch.json`, `memory_patch.md`,
  `continuity_notes.md`, and `scene_state.json`.
- Only validated narrative artifacts should be committed through existing chat
  service semantics, generation locks, recovery behavior, and ST field
  preservation rules.

Avoid these traps:

- Do not replace ST-compatible files with SQLite before adapter/export/recovery
  semantics are proven. SQLite can later support Harness indexes, state,
  memories, and event queries.
- Do not hide Harness logic inside the ST compatibility layer.
- Do not execute scripts supplied by cards, worlds, presets, extensions, or MCP
  config.
- Do not store tool results as ordinary chat floors unless the user chooses to
  publish them as narrative content.

## Current Stack

- Frontend: React 19, Vite 8, TypeScript 6, Tailwind CSS v4, framer-motion, Zustand, TanStack Query, i18next.
- Backend: Hono, TypeScript, Zod, Node runtime.
- App directory: `D:\sillytavern\CraftTalker`.
- Workspace root: `D:\sillytavern`.

## Completed Foundation

- Phase 0 debt cleanup:
  - Moved `LLMConfig` to shared types and removed the settings/UI circular dependency.
  - Persisted key chat state.
  - Split `AppShell` into smaller hooks.
  - Converted server file/service I/O to async where needed.
  - Kept frontend and backend TypeScript builds passing.
  - Frontend API calls are split behind a stable `src/lib/api.ts` facade, with
    transport code in `src/lib/api-client.ts`, shared DTO/config types in
    `src/lib/api-types.ts` and `src/lib/llm-config-types.ts`, and per-domain
    modules in `src/lib/api-domains/`. Existing `@/lib/api` imports remain the
    compatibility boundary.
- Phase 1 base:
  - Added engine interface, `NativeEngine`, engine manager, ST worker skeleton, and engine route.
  - Generation now routes through the engine system.
  - Fixed message edit line-index mismatches, edit duplicates, and refetch flicker.
  - Added onboarding.
- Chat/runtime:
  - Implemented per-chat streaming state so switching characters/chats does not abort unrelated generations.
  - Added duplicate generation guards.
  - Added server-side per-chat generation locks for send/generate/regenerate/continue; duplicate generation for the same chat now returns 409 while different chats can still generate concurrently.
  - Regenerate removes the previous assistant reply inside the same server-side lock, preventing a second regenerate request from deleting chat state mid-stream.
  - Backend streaming stores chunks and joins once when saving, avoiding repeated string append churn for long replies.
  - Generation writes persistent run records under `data/runs/` with run id, chat identity, operation, status, partial content, error, timestamps, and committed line index.
  - Run records intentionally do not store API keys, prompts, messages, or full request configs; automatic cross-restart continuation is delayed until server-side API key/session storage exists.
  - `/api/runs` exposes persisted generation runs; stale `running` records with no current process lock are marked `interrupted` so restart leftovers become recoverable.
  - `/api/runs/:runId/commit` and `/api/runs/:runId/discard` let users restore or ignore recoverable partial replies without writing run metadata into ST chat JSONL.
  - Commit/discard actions are guarded per run id to prevent duplicate recovery writes under retries or double clicks.
  - Chat UI shows a compact unsaved-reply banner for recoverable failed/canceled/interrupted runs with partial content.
  - Added Swipe, Continue, and chat rename behavior.
  - Continue appends to the last assistant message instead of creating a new one.
- Generation settings:
  - Split context length from max reply length.
  - Temperature and Top-P support custom precision inputs.
  - Continue now passes generation overrides, matching send/regenerate behavior.
  - Settings migration maps legacy `maxTokens` to `maxReplyLength`.
- API provider/runtime connection:
  - Restored broad ST/TauriTavern-style provider configuration as active runtime
    behavior instead of unused catalog data.
  - Provider catalog now covers OpenAI, OpenRouter, Claude/Anthropic, Gemini,
    Groq, Fireworks, Together, Perplexity, DeepSeek, Moonshot/Kimi,
    SiliconFlow, xAI, Mistral, Cohere, AI21, AI/ML API, Electron Hub, Chutes,
    NanoGPT, CometAPI, Z.AI/GLM, Pollinations, Ollama, LM Studio, vLLM,
    llama.cpp, and custom OpenAI/Claude/Gemini-compatible endpoints.
  - Provider routing is centralized through shared backend helpers, so
    `NativeEngine`, connection tests, and `/api/llm/models` use the same source,
    API format, base URL, header, and model-list URL decisions.
  - Frontend provider metadata is centralized in
    `src/lib/llm-provider-options.ts`; Settings and onboarding both use this
    table instead of maintaining separate local provider lists.
  - `NativeEngine` routes OpenAI-compatible chat/completions, OpenAI Responses
    text generation, Claude Messages, and Gemini generateContent/
    streamGenerateContent with provider-specific URL, header, and body mapping.
  - OpenAI-compatible providers use `Authorization: Bearer <key>`; Claude uses
    `x-api-key` plus `anthropic-version`; Gemini uses `x-goog-api-key`;
    OpenRouter includes attribution headers by default.
  - Azure OpenAI is active runtime behavior: deployment-scoped chat completions
    URLs with `api-version`, `api-key` auth, no default OpenAI `model` body
    field, and deployment listing for model discovery.
  - Ollama has both OpenAI-compatible `/v1` and native `/api` paths. Native
    Ollama posts to `/api/chat`, parses NDJSON streaming, lists `/api/tags`,
    and omits auth when no key is configured.
  - `lmstudio` is accepted by backend schemas as a first-class source, matching
    the frontend default local provider.
  - `/api/llm/models` is mounted and uses the shared provider catalog plus
    server-side key-session resolution.
  - Provider-specific model discovery includes Azure deployments, Ollama native
    `/api/tags`, NanoGPT `/models?detailed=true`, and Pollinations'
    `https://gen.pollinations.ai/models`.
  - Settings and onboarding expose provider/source selection with sensible
    default endpoints. Fixed official/gateway API address inputs are hidden in
    normal mode and replaced with a read-only connection summary. Local and
    custom providers stay editable by default.
  - Developer mode can reveal and edit fixed endpoints, API type, API format,
    reverse proxy, custom headers, and Azure advanced fields.
  - Provider switching visibly syncs `source`, legacy `type`, API format,
    default endpoint, and default model. User-entered model names are preserved
    unless the old value was blank or the previous provider default.
  - Settings and onboarding expose Azure OpenAI and Ollama Native. Azure
    resource, deployment, and API-version fields stay behind developer mode.
  - New provider settings preserve the existing API-key session model: newly
    entered keys are stored in `/api/llm-sessions`, while frontend settings keep
    only `apiKeySessionId`.
  - `custom_openai_responses` is now a real text-generation path. It posts to
    `/responses`, sends Responses-style `input`, `max_output_tokens`,
    `store: false`, supports SSE `response.output_text.delta`, and parses
    `output_text` plus Responses token usage. It is still a minimal text path:
    stateful `previous_response_id`, tools, reasoning controls, and multimodal
    inputs are not implemented yet.
- ST macro/world book:
  - Added prompt-time macro resolution without mutating source data.
  - Added world book matching and injection for character-bound and enabled global world books.
  - Added 7 insertion positions and developer-mode advanced fields.
  - World-info scanning keeps the synchronous compatibility contract while
    supporting delayed entries plus ST-like sticky/cooldown timed metadata
    persisted in chat metadata.
  - Vectorized world-info entries are skipped with scan metadata until a real
    embedding/vector runtime exists, instead of being treated as normal keyword
    entries.
- Character/world import:
  - PNG imports keep `character.png` as the original card and avoid duplicate `avatar.png` unless user sets a custom avatar.
  - Character-card embedded `character_book` is extracted into a bound world book.
  - World books support bound/general grouping, bind/unbind, and enabled/disabled toggles.
  - Character JSON is read through a compatibility view and saved through a ST-like serializer; V2/V3 unknown top-level/data fields, assets, group greetings, nicknames, extension payloads, and `extensions.regex_scripts` are preserved.
  - Existing flat CraftTalker character JSON remains readable; compatible V2/V3 saves may migrate toward nested ST `data` shape.
  - V3 PNG writing emits both `chara` and `ccv3` tEXt chunks, and reading still prefers `ccv3`.
  - Embedded world books are normalized through shared adapters, preserving ST `disable`, `keys`, `secondary_keys`, `vectorized`, camelCase/unknown fields, and exposing CraftTalker `enabled` view fields.
- Chat JSONL accepts both legacy numeric `send_date` and ST-style ISO string `send_date`; new messages, edits, swipes, and frontend optimistic assistant messages now use ISO strings.
- Chat editing and Swipe operations preserve unknown ST fields such as `extra.media`, `extra.files`, `force_avatar`, `original_avatar`, and custom swipe metadata fields.
- Presets:
  - Generation preset directories remain `.settings`: `koboldAI_Settings`, `openAI_Settings`, `textGen_Settings`, and `novelAI_Settings`.
  - ST template preset directories are now supported as raw JSON:
    `instruct`, `context`, `sysprompt`, and `reasoning`.
  - Template preset JSON preserves unknown fields, including preset-level `regex_scripts`.
  - The preset manager UI can browse all eight preset types; generation presets use numeric controls, while ST template presets use raw JSON editing to avoid dropping fields.

## Recent Security/Reliability Fixes

- Path safety:
  - `server/src/lib/path-utils.ts` now validates base containment with `path.relative`, not string-prefix checks.
  - Character import only accepts `.png` and `.json`.
  - Import paths are limited to `LUKER_IMPORT_DIR` or the temp `luker-import` directory.
  - Upload temp paths use `safePath` and `randomUUID`.
  - JSON uploads use `importCharacterJson`; PNG uploads use `importCharacterFromPng`.
  - Preset names now pass through `safePath`.
  - Regression tests cover path traversal and JSON card upload.
- Markdown/XSS:
  - Markdown rendering uses explicit DOMPurify allow-lists.
  - Dangerous tags, inline event handlers, unsafe protocols, and unsafe user styles are stripped.
  - Shiki-generated highlighted HTML is sanitized before insertion.
  - External links are constrained to `http`, `https`, or `mailto`, then receive `target="_blank"` and `rel="noopener noreferrer"`.
  - Marked custom renderers now parse inline child tokens correctly, so links/strong/em/table-cell inline syntax render again.
  - Regression tests cover unsafe HTML removal and safe link behavior.
- Settings/API key storage:
  - Settings persist through encrypted client storage via Web Crypto as a transitional measure.
  - Existing plaintext `luker-settings-store` values are auto-migrated and re-saved encrypted on first read.
  - `clearCryptoKey` removes the actual settings storage key.
  - First-stage server-side key sessions are implemented through `/api/llm-sessions`; new keys entered in settings/onboarding are stored in server memory and the frontend persists only `apiKeySessionId`.
  - Generation and engine connection tests resolve `apiKeySessionId` on the server before calling the engine; run records still do not persist API keys or session ids.
  - Expanded provider/source settings keep the server-side key-session path
    intact and do not reintroduce plaintext key persistence.
  - Production target remains a durable server-side vault/session/proxy model; current in-memory sessions are lost on server restart.
- CSRF/CORS:
  - CSRF middleware code is cleaned and uses shared origin validation.
  - CORS and CSRF now share `server/src/config/origins.ts`.
  - `ALLOWED_ORIGINS` entries are trimmed and used consistently by both layers.
- Build:
  - Vite/Rolldown Windows build is fixed by explicit `build.rolldownOptions.input`.
  - Shiki highlighting lazy-loads `shiki/core`, the JavaScript regex engine,
    themes, and supported language grammars.
  - Vite/Rolldown code splitting uses
    `build.rolldownOptions.output.codeSplitting.groups`; the latest frontend
    build has no large chunk warning.

## Current Verification Baseline

Most recent known good verification from 2026-06-09:

- Frontend `npm run test`: 31 test files, 228 tests passed.
- Frontend `npm run build`: passed with no large chunk warning.
- Backend `npm run test`: 18 test files, 174 tests passed.
- Backend `npm run build`: passed.
- `git diff --check`: no whitespace errors; Windows line-ending warnings may
  appear on the current dirty working tree.

Run verification again after new changes; counts may increase as tests are added.

## Active Priorities

1. Continue high-priority security work:
   - Harden first-stage in-memory API key sessions into a real server-side vault/session/proxy design.
   - Strengthen production CSRF/session strategy beyond development skips.
   - Add tests for unsafe origin rejection if production mode route tests are introduced.
2. Continue ST compatibility audit:
   - Continue expanding character-card import/export coverage for rarer V3/runtime fields found in real assets.
   - Continue auditing connection-manager preset payloads against real ST assets.
   - Continue world book behavior audit beyond field preservation: recursive scanning, grouping, vectorized strategy, and import/export mapping.
   - Continue testing rare chat JSONL payloads from real ST histories: attachments, quick replies, timed world info, reasoning/logprobs, media, files, bookmarks, and extension data.
3. Performance/quality:
   - Continue monitoring frontend bundle size as features grow; the previous Shiki large-chunk warning has been resolved with lazy loading.
   - Streaming uses chunk arrays and persistent run records, but long stream cleanup and a true durable queue/worker model still deserve review.
   - World book matching can be cached/precompiled later.
   - Continue provider edge-case hardening for Azure OpenAI deployment URLs,
     Vertex/service-account flows, native Ollama `/api` endpoints, model-list
     differences, and vendor-specific streaming quirks.

## Working Rules

- Do not repeat already completed bug fixes or make destructive rewrites.
- Do not revert user or previous-session changes unless explicitly asked.
- Prefer small, verifiable changes that preserve ST compatibility data.
- Use `rg` first for search.
- Use `apply_patch` for manual edits.
- Use Context7 for current library/API docs when implementing or configuring modern dependencies.
- Use frontend-design automatically for frontend UI/UX work.
- Keep user-visible naming as CraftTalker / 语琢 while delaying broad internal key/path renames until a planned migration.
- Do not remove or bypass the provider catalog/API configuration surface unless
  the replacement preserves broad official/local/proxy/custom API connectivity
  and server-side key-session behavior.
