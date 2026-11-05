# Clausario Feature Map

> **Educational use only.** Proof of concept, not production-ready, not legal advice and no compliance certification. See the full notice in [README.md](../README.md).

Which files make up each feature, and what else to check when you change one. Paths are from the repository root. Files are listed, not line numbers, so this map stays valid as code moves inside a file.

**How to use it:** find the feature you are changing, edit the listed files, then work through **Also update** and the [Change checklist](#change-checklist).

## Contents

| # | Feature | Menu |
|---|---|---|
| 1 | [Sign-in and sessions](#1-sign-in-and-sessions) | (all) |
| 2 | [Users](#2-users) | Users |
| 3 | [Menu access (RBAC)](#3-menu-access-rbac) | Menu access |
| 4 | [App shell and navigation](#4-app-shell-and-navigation) | (all) |
| 5 | [Classification and article selection](#5-classification-and-article-selection) | New analysis |
| 6 | [Scenario generation](#6-scenario-generation) | New analysis |
| 7 | [Review agent and human review](#7-review-agent-and-human-review) | Review queue |
| 8 | [Runs and Overview](#8-runs-and-overview) | Overview, Runs |
| 9 | [Evaluation](#9-evaluation) | Runs |
| 10 | [Knowledge base and sync](#10-knowledge-base-and-sync) | Knowledge base |
| 11 | [Engines & models page](#11-engines--models-page) | Engines & models |
| 12 | [Token cost](#12-token-cost) | Runs |
| 13 | [Exports](#13-exports) | Runs |
| 14 | [Branding, notice and copyright](#14-branding-notice-and-copyright) | (all) |

---

## 1. Sign-in and sessions

Login, logout and "who am I", using an httpOnly JWT cookie (`clausario_session`). Every request reloads the user and their menus.

- **Backend:** `backend/src/auth/routes.ts`, `backend/src/auth/middleware.ts` (`requireAuth`, `requireAdmin`, `requireMenu`), `backend/src/auth/passwords.ts`, `backend/src/qdrant/usersRepo.ts`, `backend/src/composition.ts`, `backend/scripts/seedAdmin.ts`
- **Frontend:** `frontend/src/app/auth.tsx`, `frontend/src/app/guards.tsx`, `frontend/src/pages/LoginPage.tsx`, `frontend/src/services/api.ts`
- **Config:** `JWT_SECRET`, `SESSION_HOURS`, `CLIENT_ORIGIN`, `ADMIN_USERNAME`, `ADMIN_PASSWORD`
- **Storage:** Qdrant `users` collection (`QDRANT_USERS_COLLECTION`)
- **API:** `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`
- **Also update:** Postman "Auth"; user manual §2, screenshots 01, 02, 06
- **Watch out:** wrong username and wrong password must return the same 401. Never return `passwordHash`. Keep the `users` payload format unchanged (`username`, `passwordHash`, `role`, `active`, `createdAt`).

## 2. Users

Admins list, add, edit, deactivate and reactivate accounts. Users are never deleted.

- **Backend:** `backend/src/auth/usersRoutes.ts`, `backend/src/qdrant/usersRepo.ts`, `backend/src/qdrant/menuRepo.ts`
- **Frontend:** `frontend/src/pages/UsersPage.tsx`
- **Config:** `MENU_DEFAULT_TESTER`
- **Storage:** Qdrant `users` and `menucontroller`
- **API:** `GET /api/users`, `POST /api/users`, `PATCH /api/users/:id`
- **Also update:** Postman "Users (Admin)"; user manual §11, screenshots 32–34
- **Watch out:** an Admin cannot deactivate or demote themselves, and at least one active Admin must remain.

## 3. Menu access (RBAC)

Which menus each user sees, enforced on the server. Admins always have every menu.

- **Backend:** `backend/src/menus/catalogue.ts` (menu keys, groups, paths, admin-only flags), `backend/src/menus/setup.ts`, `backend/src/qdrant/menuRepo.ts`, `backend/src/auth/accessRoutes.ts`, `backend/src/auth/middleware.ts`, `backend/src/app.ts` (menu guard per route), `backend/scripts/setupMenus.ts`
- **Frontend:** `frontend/src/pages/AccessPage.tsx`, `frontend/src/app/guards.tsx` (`RequireMenu`, No access page), `frontend/src/App.tsx` (route → menu keys), `frontend/src/app/Shell.tsx` (sidebar)
- **Config:** `MENU_DEFAULT_TESTER`, `QDRANT_MENU_COLLECTION`
- **Storage:** Qdrant `menucontroller` (menu points and access points)
- **API:** `GET /api/menus`, `GET /api/access`, `PUT /api/access/:userId`
- **Also update:** Postman "Menu access (Admin)" and "RBAC — Tester"; user manual §1, §12, §13, screenshots 28, 35; README Roles section
- **Watch out:** a new menu needs a catalogue entry, a server guard in `app.ts` or the route file, a route in `App.tsx`, an icon in `frontend/src/app/icons.tsx`, and a re-run of `npm run setup:menus`. Hiding a menu in the UI is not access control.

## 4. App shell and navigation

Top bar (logo, caption, engine chip, status dot, account menu), grouped sidebar, collapse to icon rail, phone drawer, footer.

- **Frontend:** `frontend/src/app/Shell.tsx`, `frontend/src/app/icons.tsx`, `frontend/src/App.tsx`, `frontend/src/app.css`, `frontend/src/index.css`, `frontend/src/components/ui.tsx` (PageHeader, Tabs, Drawer, Kpi, Pager)
- **Backend:** `GET /api/health` in `backend/src/app.ts` (status dot)
- **Also update:** user manual §3, screenshots 06–09, 36
- **Watch out:** check 390 px (phone) and 1440 px widths; the page must never scroll sideways.

## 5. Classification and article selection

A decision engine (OpenAI Decisions API or Jev) routes the story to GDPR, EU AI Act, both or none, then selects chapters and articles. Never an LLM.

- **Backend:** `backend/src/decisions/route.ts`, `backend/src/decisions/select.ts`, `backend/src/decisions/client.ts` (`decide()`), `backend/src/decisions/engines/registry.ts`, `backend/src/decisions/engines/runnable.ts` (retries, fallbacks), `backend/src/decisions/engines/jevTransport.ts`, `backend/src/config/chapterMap.ts`, `backend/src/routes/analyze.routes.ts`, `backend/src/graph/graph.ts` (classify and selectArticles nodes)
- **Frontend:** `frontend/src/pages/AnalyzePage.tsx` (story, engine picker), `frontend/src/pages/RunDetailPage.tsx` (Classification and Articles tabs), `frontend/src/components/Meter.tsx`
- **Config:** `DECISION_ENGINE`, `ROUTE_ENGINE`, `SELECT_ENGINE`, `ENGINE_UI_SWITCH`, `DECISIONS_MODEL`, `OPENAI_API_KEY`, `TYPESAFE_API_KEY`, `JEV_MODEL`, `JEV_MAX_QUESTIONS_PER_CALL`, `DECISION_MAX_RETRIES`, `DECISION_TIMEOUT_MS`, `DECISION_FALLBACKS`, `ROUTE_THRESHOLD`, `ROUTE_MIN_CONFIDENCE`, `CHAPTER_THRESHOLD`, `ARTICLE_THRESHOLD`, `SELECT_TOP_N`
- **API:** `POST /api/analyze/route`, `POST /api/analyze/select` (and inside `POST /api/runs`)
- **Also update:** Postman "Analyze" and "Engines (Decisions / Jev)"; user manual §5, §7, screenshots 10, 11, 15, 16; README Limitations (thresholds)
- **Watch out:** engine differences belong in the transports; `decide()` and `DecideResult` are the one contract. Keep SDK-level retries at 0 (LangChain owns retries). Question names use lower-case letters, digits and `_` only.

## 6. Scenario generation

An LLM writes test scenarios from the selected articles' text (the context pack), with retries and fallback models.

- **Backend:** `backend/src/llm/generateScenarios.ts`, `backend/src/llm/providerFactory.ts`, `backend/src/llm/prompts.ts`, `backend/src/pack/packer.ts`, `backend/src/schemas/scenario.schema.ts`, `backend/src/routes/scenarios.routes.ts`, `backend/src/routes/llm.routes.ts`, `backend/src/graph/graph.ts` (generate node)
- **Frontend:** `frontend/src/pages/AnalyzePage.tsx` (provider, model, count), `frontend/src/components/ScenarioCards.tsx`, `frontend/src/components/PackManifestView.tsx`, `frontend/src/pages/RunDetailPage.tsx` (Scenarios and Context pack tabs)
- **Config:** `OPENAI_MODELS`, `ANTHROPIC_API_KEY`, `ANTHROPIC_MODELS`, `GROQ_API_KEY`, `GROQ_MODELS`, `INCEPTION_API_KEY`, `INCEPTION_BASE_URL`, `INCEPTION_MODELS`, `LLM_TEMPERATURE`, `LLM_MAX_RETRIES`, `LLM_TIMEOUT_MS`, `GENERATION_FALLBACKS`, `PACK_TOKEN_BUDGET`, `SCENARIO_MAX_COUNT`
- **API:** `GET /api/llm/providers`, `POST /api/scenarios/generate`
- **Also update:** Postman "Scenarios"; user manual §5, §7, screenshots 18, 20
- **Watch out (Anthropic):** never set `temperature`, `topP` or `topK`; use `withStructuredOutput(schema, { method: "jsonSchema" })`; keep `min`, `max` and length rules out of the schema the API sees and validate with Zod afterwards. Prompts follow ICEPOT and wrap the story in tags as data.

## 7. Review agent and human review

The Review agent scores each run; below the threshold the run pauses for a reviewer (approve, override, add context, reject).

- **Backend:** `backend/src/graph/graph.ts` (review, humanReview, routers), `backend/src/graph/state.ts`, `backend/src/graph/reviewScore.ts` (score maths), `backend/src/qdrant/QdrantSaver.ts` (checkpoints), `backend/src/runs/routes.ts` (queue, action), `backend/src/runs/service.ts`
- **Frontend:** `frontend/src/components/ReviewPanel.tsx`, `frontend/src/pages/ReviewQueuePage.tsx`, `frontend/src/pages/RunDetailPage.tsx` (Review tab), `frontend/src/components/ui.tsx` (ScoreGauge), `frontend/src/app/Shell.tsx` (queue badge)
- **Config:** `REVIEW_THRESHOLD`, `HITL_MAX_ROUNDS`, `REVIEW_ENGINE`
- **Storage:** Qdrant `checkpoints` (threads `clausario-<runId>`)
- **API:** `GET /api/review/queue`, `POST /api/runs/:id/review`
- **Also update:** Postman "Review (HITL)"; user manual §7 (Review tab), §8, screenshots 17, 22, 24–27; `docs/SCORING.md` §2 and its PDF if questions, weights or thresholds change
- **Watch out:** the engine rates and the code calculates; the score comes only from `reviewScore.ts`. `humanReview` must have no side effects before `interrupt()`. A second action on the same run returns 409. Only routers decide the next node.

## 8. Runs and Overview

Background runs with polling, ownership, retry after failure, and the dashboard KPIs.

- **Backend:** `backend/src/runs/service.ts` (start, stream, recovery), `backend/src/runs/routes.ts`, `backend/src/qdrant/runsRepo.ts`, `backend/src/qdrant/QdrantSaver.ts`, `backend/src/composition.ts`
- **Frontend:** `frontend/src/pages/OverviewPage.tsx`, `frontend/src/pages/RunsPage.tsx`, `frontend/src/pages/RunDetailPage.tsx`, `frontend/src/components/ui.tsx` (StatusPill, StepTracker, Pager)
- **Config:** `QDRANT_CHECKPOINTS_COLLECTION`, `CLAUSARIO_FAKE_ENGINES` (demo mode)
- **Storage:** Qdrant `checkpoints` (run summaries `kind: "clausario_run"`)
- **API:** `POST /api/runs`, `GET /api/runs`, `GET /api/runs/:id`, `POST /api/runs/:id/retry`, `GET /api/dashboard`
- **Also update:** Postman "Runs (LangGraph)" and "Dashboard"; user manual §4, §6, §7, screenshots 03–05, 12–14, 23
- **Watch out:** a user asking for someone else's run gets 404, not 403. Never write `kind: "run"` points; the `checkpoints` collection may be shared with other apps. Runs left `running` at startup become `failed`.

## 9. Evaluation

A decision engine scores each scenario (traceability, testability, clarity, priority fit, duplicates) and gives pass, warn or fail, plus article coverage.

- **Backend:** `backend/src/decisions/evaluate.ts`, `backend/src/routes/scenarios.routes.ts`, `backend/src/graph/graph.ts` (evaluate node)
- **Frontend:** `frontend/src/pages/RunDetailPage.tsx` (Evaluation tab), `frontend/src/pages/AnalyzePage.tsx` (evaluate toggle), `frontend/src/components/ScenarioCards.tsx` (verdict badges)
- **Config:** `EVAL_ENABLED`, `EVAL_ENGINE`, `EVAL_SCORE_PASS`, `EVAL_SCORE_FAIL`, `EVAL_DUP_THRESHOLD`, `ARTICLE_THRESHOLD`
- **API:** `POST /api/scenarios/evaluate` (409 when evaluation is off)
- **Also update:** Postman "Scenarios"; user manual §7, screenshot 19; `docs/SCORING.md` §3 and its PDF if questions, rules or thresholds change
- **Watch out:** with `EVAL_ENABLED=false` the toggle disappears and the evaluate step is skipped everywhere.

## 10. Knowledge base and sync

Scrapes the regulation text into the local OKF bundle, reloads it live, and serves it to every run.

- **Backend:** `backend/src/scrapers/gdpr.scraper.ts`, `backend/src/scrapers/euAiAct.scraper.ts`, `backend/src/scrapers/extract.ts`, `backend/src/scrapers/scrapeRun.ts`, `backend/src/scrapers/describe.ts`, `backend/src/scrapers/descriptionTemplate.ts`, `backend/src/okf/*` (writer, loader, watcher, indexBuilder, logWriter, graph, hash, ids), `backend/src/schemas/okf.schema.ts`, `backend/src/jobs/jobStore.ts`, `backend/src/routes/okf.routes.ts`, `backend/src/config/chapterMap.ts`
- **Frontend:** `frontend/src/pages/KnowledgePage.tsx`
- **Config:** `KNOWLEDGE_DIR`, `GDPR_BASE_URL`, `EU_AI_ACT_BASE_URL`, `SCRAPE_DELAY_MS`, `DESCRIPTION_MODEL`, `OPENAI_API_KEY`
- **Storage:** `backend/knowledge/` (git-ignored; created by the first Sync now)
- **API:** `POST /api/okf/scrape/:reg`, `GET /api/okf/jobs/:id`, `GET /api/okf/log`, `GET /api/okf/:reg/index`, `GET /api/okf/:reg/articles/:num`
- **Also update:** Postman "OKF Read" and "OKF Scrape"; user manual §9, screenshots 29, 30; README "Regulation sources and credits" if a source changes
- **Watch out:** a change in the source sites' HTML breaks `extract.ts`; check with **Preview changes** first. An invalid bundle file keeps the previous snapshot and names the file in the server log.

## 11. Engines & models page

A read-only view of the engine, model, retry, fallback and threshold settings.

- **Backend:** `backend/src/routes/config.routes.ts`, `backend/src/config/env.ts`
- **Frontend:** `frontend/src/pages/SettingsPage.tsx`, `frontend/src/app/auth.tsx` (loads config), `frontend/src/app/Shell.tsx` (engine chip)
- **API:** `GET /api/config`
- **Also update:** Postman "Config"; user manual §10, screenshot 31; `backend/.env.example` and Installation.md Configuration reference for any new variable
- **Watch out:** never return API keys, only whether a key is set.

## 12. Token cost

Tokens and cost per step (route, select, review, generate, evaluate) and per sync.

- **Backend:** `backend/src/usage.ts`, `backend/src/schemas/api.schema.ts` (pricing parse), `backend/src/scrapers/describe.ts` (description cost)
- **Frontend:** `frontend/src/components/Usage.tsx`, `frontend/src/pages/RunDetailPage.tsx` (Cost tab), `frontend/src/pages/KnowledgePage.tsx` (sync cost chip)
- **Config:** `MODEL_PRICING`
- **Also update:** user manual §7 (Cost), screenshot 21; README Token cost section
- **Watch out:** a model missing from `MODEL_PRICING` shows no cost; token counts are approximate for Anthropic and Inception.

## 13. Exports

JSON and CSV downloads of a run's scenarios, built in the browser.

- **Frontend:** `frontend/src/services/download.ts`, `frontend/src/pages/RunDetailPage.tsx`, `frontend/src/components/Usage.tsx`
- **Also update:** user manual §7 (Export)
- **Watch out:** the JSON starts with a `notice` field. In the CSV, text starting with `=`, `+`, `-`, `@`, tab or CR gets a leading `'` so spreadsheets never run it as a formula; keep this when adding columns.

## 14. Branding, notice and copyright

Logo, caption, the educational-use notice, copyright and source credits shown in the app.

- **Frontend:** `frontend/src/components/Brand.tsx` (`BRAND` and `LEGAL`: all wording in one place), `frontend/src/components/AboutPanel.tsx`, `frontend/src/app/Shell.tsx` (footer, account menu), `frontend/src/pages/LoginPage.tsx`, `frontend/src/pages/KnowledgePage.tsx` (credit line), `frontend/src/services/download.ts` (JSON notice), `frontend/index.html` (meta tags), `frontend/public/favicon.svg`
- **Also update:** README notice and "Regulation sources and credits"; Installation.md and user manual notice lines; user manual §2, §3, screenshots 01, 06, 36; the PDF
- **Watch out:** change wording in `LEGAL` only, not in each page. Never claim the app makes anything compliant.

---

## Shared across features

| Item | Files | Rule |
|---|---|---|
| API types | `backend/src/schemas/api.schema.ts`, `backend/src/schemas/scenario.schema.ts` ↔ `frontend/src/types/api.ts` | Change both sides together |
| API client | `frontend/src/services/api.ts` | One function per endpoint |
| Settings | `backend/src/config/env.ts`, `backend/.env.example`, Installation.md (Configuration reference), `backend/src/server.ts` (`PORT`) | Every variable in all three; never hardcode model IDs or thresholds. |
| Errors | `backend/src/errors.ts`, `frontend/src/components/ErrorBanner.tsx` | Same `{ error }` shape everywhere |
| Qdrant | `backend/src/qdrant/client.ts`, `backend/scripts/qdrantPing.ts`, `backend/scripts/qdrantInspect.ts`, `backend/scripts/env.ts` (`QDRANT_URL`, `QDRANT_API_KEY`) | Create collections if missing; the code never deletes a collection. Never recreate `users` or `checkpoints` |
| Postman | `postman/Clausario.postman_collection.json`, `postman/Clausario.postman_environment.json` | Add a request for every new endpoint |

## Change checklist

1. `npm run typecheck` in `backend/` and `frontend/`, and `npm run build` in `frontend/`.
2. Postman: run the folder for the feature you changed.
3. `backend/.env.example` and Installation.md for any new or renamed variable.
4. README if behaviour, limits or setup changed.
5. User manual text and screenshots for any visible change, then rebuild `docs/USER_MANUAL.pdf` (and update the "page 26" pointer in README and Installation.md if the Knowledge base section moves).
6. This map, if you added, moved or renamed a file.
