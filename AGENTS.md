# Repository Guidelines

## Project Structure & Module Organization
- Primary source files belong in `src/` organized by runtime: `src/background/` for the service worker, `src/content/` for Google SERP DOM logic, and `src/shared/` for message contracts and utilities.
- Manifest and static assets stay under `public/` (for example `public/manifest.json`, icons). Keep `docs/spec.md` as the architectural source of truth and reflect major changes there.
- Tests live in `tests/` mirroring the source tree (`tests/content/`, `tests/background/`) with fixtures such as saved SERP HTML under `tests/fixtures/`.

## Build, Test, and Development Commands
- `npm install` — install dependencies with Node 20+.
- `npm run dev` — run the bundler (Vite or equivalent) in watch mode and load the unpacked extension from `dist/`.
- `npm run build` — emit a production-ready `dist/` bundle for Chrome packaging.
- `npm run lint` — execute ESLint + Prettier to enforce the shared code style.
- `npm run test` — execute Vitest suites once; add `:watch` for tight feedback loops.

## Coding Style & Naming Conventions
- TypeScript strict mode, 2-space indentation, no semicolons unless ASI would break; enforce via ESLint + Prettier configs in the repo root.
- Modules use `kebab-case.ts`, classes/components use `PascalCase.tsx`, and tests always end with `.spec.ts`.
- Keep DOM selectors in a dedicated helper (e.g., `src/content/googleDom.ts`) and document Google layout assumptions inline.
- Prefer pure helpers and typed message envelopes; avoid reaching for `chrome.*` APIs outside the background worker or content script boundaries.

## Testing Guidelines
- Use Vitest with jsdom for content logic and MSW (or fetch mocks) when simulating the Hatena API.
- Target ≥80% statement coverage; ensure Google DOM parsing, Hatena API client, and UI injectors each have fixture-backed tests.
- Name suites after the feature (`describe('HatenaCountClient', ...)`) and include regression context when fixing bugs.
- Run `npm run test && npm run lint` before opening PRs; attach failing trace IDs or console logs to bug reports.

## Commit & Pull Request Guidelines
- Follow Conventional Commits (`feat(content): add DOM parser`). Keep subjects ≤72 chars and explain behavior changes or rationales in the body.
- Each PR should include: concise summary, linked issue ID, screenshots/GIFs for UI tweaks, and latest test/lint output.
- Request review only after CI is green and you have smoke-tested on a sample Google SERP.
- Stage related files together (`git add docs/spec.md src/content/*`) and keep PRs under ~300 lines when feasible.
