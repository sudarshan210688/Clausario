# Clausario

> **Educational use only.** Clausario is a proof of concept for learning and training. It is not production-ready, not legal advice and does not certify compliance with the GDPR, the EU AI Act or any other law.
>
> - **Decision support only.** Results are suggestions; a qualified person must review every classification, article selection and scenario before relying on it.
> - **No real personal data.** Use synthetic or anonymised user stories. Stories are sent to third-party AI providers (OpenAI, Anthropic, Groq, Inception, TypeSafe/Jev) under their own terms.
> - **Provided "as is",** without warranty of any kind. The author is not liable for any use of this project or its output.
> - © 2026 Sudarshan Ramanujam. All rights reserved.

**Compliance, tested before it's questioned.** **Every clause, a test scenario.**

The name joins *clause* and *scenario*, which is what the tool produces: test scenarios generated from legal clauses.

**Getting started:** clone, `npm install` in `backend/` and `frontend/`, fill `backend/.env` (including a generated `JWT_SECRET`), run `npm run seed:admin` and `npm run setup:menus`, then `npm run dev` in both folders, and sync the regulations once (below). Step by step: [Installation.md → Quick start](Installation.md#quick-start). Using the app (every menu, role and screen, with screenshots): [`docs/USER_MANUAL.md`](docs/USER_MANUAL.md) or the PDF [`docs/USER_MANUAL.pdf`](docs/USER_MANUAL.pdf).

> **First run: load the regulations.** The repository does not include the regulation text. Sign in as Admin (or a user with the Knowledge base menu), open **Knowledge base** and click **Sync now** on the GDPR tab and the EU AI Act tab (5–7 minutes each). Until then, analyses find no articles and end as *Not applicable*. Step by step with screenshots: user manual at `docs/USER_MANUAL.md`, section [9. Knowledge base](docs/USER_MANUAL.md#9-knowledge-base), or page 26 of the PDF [`docs/USER_MANUAL.pdf`](docs/USER_MANUAL.pdf).

Clausario maps user stories and requirements to GDPR and/or EU AI Act articles, then generates and evaluates compliance **test scenarios** (not test cases).

Regulation text is stored as a local Google OKF 0.2 knowledge bundle (`backend/knowledge/`), built on your machine by the Knowledge sync. Articles are selected with the OpenAI Decisions API, with no RAG and no vectors.

## Status

| Phase | Feature | State |
|---|---|---|
| P0 | Scaffold: Express + TS backend, Zod env, error handling, health endpoint | Done |
| P1 | OKF writer + GDPR scraper (background jobs, dryRun, duplicate check, indexes, logs) | Done |
| P2 | EU AI Act scraper (consolidated text, inserted articles, Annex I–X, recitals) | Done |
| P3 | OKF loader + in-memory graph (1-hop expand), index / article / log read endpoints | Done |
| P4 | Decisions ROUTE + SELECT (+ EXPAND) endpoints | Done |
| P5 | Provider factory, PACK, scenario generation endpoints | Done |
| P6 | Decisions evaluation endpoint (scores, verdicts, coverage) | Done |
| P7 | Frontend: Knowledge page (scrape jobs, log) + Analyze page (route → select → generate → evaluate → download) | Done |
| P8 | E2E of both examples (Postman CLI + UI) and final docs | Done |
| P9 | Foundation: env, shared Qdrant collections, `setup:menus`, description token cost | Built |
| P10 | Login, Admin/User accounts in the Qdrant `users` collection, menu access on every route | Built |
| P11 | Decision engines: OpenAI Decisions API or Jev, via LangChain, with retries and fallbacks; evaluation on/off | Built |
| P12 | Generation: Groq added, Anthropic fixed, retry + fallback chain | Built |
| P13 | LangGraph pipeline with Review agent, human-in-the-loop review, Qdrant checkpoints | Built |
| P14 | Runs API, review queue, dashboard | Built |
| P15 | Menu-based, responsive UI | Built |
| P16 | Postman, README, Installation | Built |

## Features

- **Accounts and roles:** one login page. Accounts live in the Qdrant `users` collection. Roles are **Admin** and **User** (stored as `Tester`). Admins create, edit and deactivate users; there is no delete.
- **Menu access:** every menu (Overview, New analysis, Runs, Review queue, Knowledge base, Engines & models, Users, Menu access) is granted per user by an Admin and enforced on the server. Grants live in a new Qdrant collection, `menucontroller`, created once with `npm run setup:menus`.
- **Decision engines:** classification (GDPR / EU AI Act / Both / None), article selection, the Review agent and evaluation run on the **OpenAI Decisions API** or **Jev** (TypeSafe AI), chosen per stage in `.env` (`ROUTE_ENGINE`, `SELECT_ENGINE`, `REVIEW_ENGINE`, `EVAL_ENGINE`). Users can switch the classification engine per run when `ENGINE_UI_SWITCH=true`. Both engines are LangChain runnables with `withRetry` (`DECISION_MAX_RETRIES`) and `withFallbacks` (`DECISION_FALLBACKS`). Decision steps never use an LLM.
- **Evaluation on/off:** `EVAL_ENABLED=false` turns evaluation off everywhere; otherwise each run has an *Evaluate after generation* switch.
- **LangGraph Review agent:** classify → select articles → review score (0–100, computed in code from four engine answers). Below `REVIEW_THRESHOLD`, the run pauses for a reviewer (any user with the Review queue menu), who can **approve**, **override** the regulations and articles, **add context and re-score** (up to `HITL_MAX_ROUNDS` times), or **reject**.
- **Checkpoints in Qdrant:** the graph is checkpointed in the Qdrant `checkpoints` collection (threads `clausario-<runId>`, run summaries `kind: clausario_run`), so paused runs survive a restart and failed runs retry from their last step. Other data in the collection is never touched.
- **Generation providers:** OpenAI, Anthropic, **Groq** and Inception. Anthropic gets no sampling settings and a constraint-free JSON schema (validated with Zod after). `GENERATION_FALLBACKS` lists `provider:model` fallbacks (same or other provider), with `LLM_MAX_RETRIES` retries each; the response names the model that served it.
- **Description cost:** OKF description generation (`DESCRIPTION_MODEL`) reports calls, tokens and cost on the scrape job and in the run log.
- **UI:** a top bar with the caption, a grouped sidebar that collapses to an icon rail (and becomes a drawer on phones), and tabbed run pages.

## Scope

| Item | GDPR ([gdpr-info.eu](https://gdpr-info.eu)) | EU AI Act ([artificialintelligenceact.eu](https://artificialintelligenceact.eu/ai-act-explorer/)) |
|---|---|---|
| Chapters | I–X | I–X |
| Articles | 1–93 | 1–96, plus 4a, 60a, 75a–75d inserted by the Digital Omnibus |
| Text version | as published | consolidated as amended by Digital Omnibus Reg. (EU) 2026/1744 (in force 2026-07-27); deleted paragraphs dropped |
| Not included | Chapter XI (Art. 94–99) | Chapters XI–XIII (Art. 97–113) |
| Annexes | none (GDPR has no annexes) | I–X scraped; XI–XIII and Omnibus XIV as external links only |
| Recitals | the "Suitable Recitals" linked from in-scope articles | the "Related recitals" linked from in-scope articles |

The bundle holds 559 docs: GDPR 10 chapters, 93 articles and 171 recitals; EU AI Act 10 chapters, 102 articles, 10 annexes and 163 recitals.

## How it works

- **GDPR scraper** (gdpr-info.eu): Chapters I–X (Art. 1–93) plus the "Suitable Recitals" linked from those articles. Requests are sequential with `SCRAPE_DELAY_MS` between them.
- **EU AI Act scraper** (artificialintelligenceact.eu): Chapters I–X, which is Art. 1–96 plus the six articles inserted by the Digital Omnibus (Art. 4a, 60a, 75a–75d). It also scrapes Annex I–X and the "Related recitals" linked from articles or their paragraphs.
  - **Text version:** the consolidated text as amended by Digital Omnibus Regulation (EU) 2026/1744, in force since 27 July 2026. The site's amended (`om-new`) version is stored, and paragraphs the amendment deleted are dropped.
  - **Annexes:** Annex I–X are written once each, with `articles: [...]` back-links. Annex XI–XIII and the Omnibus Annex XIV are not scraped; they appear as URLs in the article's `external_annexes`.
  - **Inserted articles:** their ids keep the letter: `article: "4a"`, file `art-004a.md`, global id `eu-ai-act:art-004a`.
- **Background jobs:** `POST` returns `202 { jobId }` at once; poll the job for progress. One active job per regulation; a second request gets `409`.
- **dryRun:** reports what would be added, updated or skipped. It writes nothing and makes no LLM calls.
- **Duplicate check:** `content_hash` = sha256 of the normalized text plus edges. Same hash → skip (file untouched). Changed hash → overwrite and regenerate the description. New file → add.
- **Descriptions (switch):** one line per chapter, article, recital and annex. If `DESCRIPTION_MODEL` is empty (the default), a deterministic template is used, with no LLM and no key: `<chapter title> — <article title>: <first ~40 words>`. If `DESCRIPTION_MODEL` is set, the OpenAI chat model writes the line. `description_by` on articles records the source (`template` or `openai/<model>`). Only added or updated docs are described, unless the request sends `redescribe: true`.
- **redescribe:** rewrites the descriptions of unchanged docs from the current source, for example to upgrade template descriptions to LLM ones after setting `DESCRIPTION_MODEL`. Content and `content_hash` stay the same.
- **Relationships** (deterministic, at scrape time): article → recitals (link hrefs), article → in-scope articles (`/Articles?\s+(\d+[a-z]?)\b/`, lettered refs only when the article exists), article → annexes (`/Annex(?:es)?\s+([IVX]+)/`: I–X → `annexes`, higher → `external_annexes`), chapter → articles (static chapter map), and back-links from recitals and annexes to articles.
- **Paragraph anchors:** GDPR `17(1)(a)`. EU AI Act `6(1)`, `6(1a)`, `53(1)(b)(i)`; annexes `III(4)(a)`, with sections as `VIII(A)(1)`. Unnumbered subparagraphs stay with the anchor they belong to.
- **Indexes and logs:** `index.md` files are rebuilt from disk after every committed run. `log.md` files are grouped by date, newest first.
- **Knowledge loader:** at startup the server reads every chapter, article, recital and annex file of both bundles and validates its frontmatter with Zod. An invalid file stops startup with an error naming the file; a bundle that has not been scraped yet loads as empty. After a scrape that writes files (added, updated or redescribed, including a failed run that wrote some), the snapshot is reloaded, so the read endpoints show the new content without a restart.
- **Graph (in memory, no `graph.json`):** article → chapter, recitals, omnibus recitals, annexes and cross-refs, built from the frontmatter keys. At load, the server logs a warning for any link to a missing file, and for any back-link (`articles: [...]` on chapters, recitals and annexes) that does not match the article's own links. `expand(articleIds)` returns the 1-hop recitals (omnibus ones flagged `draft`), annexes, and cross-referenced articles not already selected. The result is deduplicated and sorted, so the same ids give the same output in any order. SELECT calls it on the selected articles.
- **Decisions client:** calls the OpenAI Decisions API (`DECISIONS_MODEL`, default `gpt-6-luna`) through the `openai` SDK. A call takes at most 400 questions; longer lists are split and the answers merged by question name. A refused question counts as `p = 0` (choice: `value: null`, confidence 0) and is listed in `refusals`. An HTTP error, a missing `OPENAI_API_KEY`, or a response that fails Zod validation returns `502`.
- **ROUTE** (one Decisions call): a choice question (`gdpr` | `eu_ai_act` | `both` | `none`) plus two predicates, `involves_personal_data` and `involves_ai_system`.
  - **Routing rule:** the predicates decide. GDPR applies if `p(personal data) ≥ ROUTE_THRESHOLD`; the EU AI Act applies if `p(AI system) ≥ ROUTE_THRESHOLD`. Both or neither can apply.
  - **needsReview:** `true` if the choice disagrees with the predicate result, or its confidence is below `ROUTE_MIN_CONFIDENCE`. The choice never changes `regulations`.
  - **No regulation:** `200` with `regulations: []` and the probabilities. The UI can override `regulations` before SELECT. The API returns the choice `eu_ai_act` as `eu-ai-act`.
- **SELECT** (two Decisions calls), from each doc's title and description:
  - **Stage 1, chapters:** one predicate per chapter of each requested regulation. Chapters with `p ≥ CHAPTER_THRESHOLD` are kept.
  - **Stage 2, articles:** one predicate per article in the kept chapters. Articles with `p ≥ ARTICLE_THRESHOLD` are kept, sorted by `p` descending (ties by id), at most `SELECT_TOP_N` per regulation. The order of `selected` is the rank.
  - **Expansion:** the 1-hop expansion of the selected articles is returned with them.
  - **Question names:** `ch_<reg>_<nn>` and `art_<reg>_<nnn>`, where `<reg>` is `gdpr` or `eu_ai_act`, for example `art_eu_ai_act_004a`.
- **Thresholds:** the defaults are uncalibrated. Tune them on about 20 labelled stories.
- **Providers:** scenario generation runs through a LangChain provider factory. `openai` uses `ChatOpenAI`, `anthropic` uses `ChatAnthropic`, and `inception` uses `ChatOpenAI` with `INCEPTION_BASE_URL`. Model ids come from `OPENAI_MODELS`, `ANTHROPIC_MODELS` and `INCEPTION_MODELS` (comma-separated; the first is the default) and are never hardcoded. `GET /api/llm/providers` lists only providers that have both a key and at least one model. LLM descriptions (`DESCRIPTION_MODEL`) also go through the factory, using the `openai` provider.
- **PACK** (no LLM): builds the context for generation from the ranked `articleIds`.
  - **Contents:** each article's full text, each paragraph labelled with its citable clause (`[Art. 17(1)(a) GDPR]`); the linked recitals and annexes in full (annex paragraphs labelled `[Annex III(4)(a) EU AI Act]`); and the cross-referenced articles as title + description only. Recitals and cross-refs are context and cannot be cited.
  - **Budget:** `PACK_TOKEN_BUDGET`, counted with js-tiktoken (`o200k_base`, a per-block sum, so approximate for Anthropic and Inception).
  - **Drop order when over budget:** (1) cross-ref descriptions → (2) omnibus recitals → (3) recitals beyond the first 2 of each article (frontmatter order) → (4) annex text trimmed to the points the articles cite (`point 2 of Annex III` → `III(2)` and its sub-points; if no point is cited, the annex is reduced to title + description) → (5) articles from the end of `articleIds`, with anything only they linked. Each step works from the end of its list and stops once the pack fits.
  - **Manifest and determinism:** `packManifest` lists what was included (with tokens) and what was dropped (with the reason). The same `articleIds` always give the same pack. If even the top article with its first 2 recitals exceeds the budget, the request gets `400`.
- **Scenario generation:** the prompt follows ICEPOT: Instruction, Context (story + pack), Example (one worked GDPR Art. 17(1)(a) scenario), Persona (senior QA compliance analyst), Output format (`{ scenarios: [...] }` JSON) and Tone. The output is test **scenarios** only, with no test data and no automation code.
  - **Structured output:** `withStructuredOutput(ScenarioListSchema)` validates the result with Zod. For Inception, if JSON-schema output fails, the model is asked for plain JSON, which is parsed and checked with Zod. An invalid result is retried once; a second failure returns `502` with the first 500 characters of the raw output.
  - **Count and coverage:** the response has exactly `count` scenarios. If `count ≥` the number of packed articles, every article is cited by at least one scenario. If the model returns too few, or leaves an article uncovered, one retry asks for the rest. The scenarios are merged (one per uncovered article first, then in order) and renumbered `TS-001…`. Still short after the retry → `502`.
  - **Clause check:** every `mappedClauses` entry must exactly match a packed clause label (whitespace aside). Mismatches are kept in the scenario and listed in `invalidClauses`; they never count towards coverage.
  - **Priority guidance:** High = prohibited practices, high-risk obligations, data subject rights, lawful basis, breach handling. Medium = transparency, documentation, record-keeping. Low = governance, administrative.
- **EVALUATE** (Decisions, no generation LLM): scores scenarios you send, such as the output of generate, possibly edited.
  - **Input:** the story, the pack rebuilt from `articleIds` (same pack as generate), and the scenarios as JSON. Every question is about this one input; more than 400 questions are split across calls.
  - **Per scenario** (names `s_<id>_…`, e.g. `s_ts_001_traceability`): three scores, Low / Medium / High: `traceability` (does it test the obligation in its `mappedClauses`?), `testability` (concrete steps, observable expected result?) and `clarity` (unambiguous, one behaviour?). Plus a `priority_fit` choice (`too_low` | `correct` | `too_high`) and a `duplicate_of_another` predicate.
  - **Score scale:** 0–2, the probability-weighted level (Low 0, Medium 1, High 2), rounded to 2 decimals.
  - **Verdict rules:** **fail** if any score `< EVAL_SCORE_FAIL`. Otherwise **warn** if any score `< EVAL_SCORE_PASS`, `priorityFit` is not `correct`, `duplicateP ≥ EVAL_DUP_THRESHOLD`, or any of the scenario's questions was refused. Otherwise **pass**. Both scenarios of a duplicate pair are flagged.
  - **Refusals:** a refused score is `null`, a refused `priority_fit` is `null`, a refused duplicate or coverage question is `p = 0`. The question names are listed in `refusals`, and a scenario with a refusal never passes.
  - **Coverage:** one `covered_by_any_scenario` predicate per article (`cov_<reg>_<nnn>`, e.g. `cov_eu_ai_act_006`). Covered if `p ≥ ARTICLE_THRESHOLD`. Every requested article appears once, in `covered` or `uncovered`; `pct` is rounded to a whole number.

## Web UI

A React app (`frontend/`) with React Router. Sign in with your Clausario account. Everything you see depends on the menus an Admin granted you; the server enforces the same rules.

- **Shell:** top bar with the logo, the caption *Compliance, tested before it's questioned.*, the default engine, a backend status dot and your account menu (sign out). The left sidebar groups menus into Workspace, Governance, Knowledge and Administration, shows a badge with the number of runs waiting for review, and collapses to an icon rail (remembered in this browser). Below 1024 px it becomes a drawer opened from ☰. Light and dark themes follow the OS.
- **Overview:** KPI tiles (running, awaiting review, completed, failed, cost) and the 10 most recent runs.
- **New analysis:** the story editor with example chips (Account deletion, AI CV screening, Support chatbot) next to a **Run settings** card: classification engine (when switching is on), generation provider and model, 5 / 10 / 20 / Custom scenarios, and *Evaluate after generation*. <kbd>Ctrl</kbd>+<kbd>Enter</kbd> starts the run.
- **Runs:** a filterable, paginated table (status, regulations, review score, verdicts, cost; owner for Admins).
- **Run detail:** status, a step tracker (Classify → Articles → Review → Generate → Evaluate), the review score against the threshold, **Retry** for failed runs and **↓ JSON / ↓ CSV** export. Results are in tabs: Summary, Classification, Articles (chapters and linked context collapsed), Review (score breakdown, review log, and the review panel for reviewers), Scenarios, Evaluation, Context pack (collapsed) and Cost. The page refreshes every 2 s while the run is running.
- **Review queue:** paused runs, oldest first. The review panel offers Approve, Override & generate (tick regulations and articles, add an article by id), Add context & re-score ("Round x of N"), and Reject, with an optional note.
- **Knowledge base:** one tab per regulation (bundle counts, Preview changes, Sync now, redescribe option, job progress, result lists and the description tokens · cost chip) and an Activity log tab.
- **Engines & models:** a read-only view of the engine, model, threshold and fallback settings.
- **Users / Menu access (Admin):** a users table with a side drawer to add or edit (role, active, password, menus), and a users × menus matrix saved per row.
- **Export:** **JSON** saves `{ story, articleIds, scenarios, evaluation, usage }`. **CSV** saves one row per scenario, with array fields joined by ` | `, every cell quoted, a UTF-8 BOM for Excel, and the evaluation columns when evaluated.

## Token cost

Route, select, generate and evaluate each return a `usage` object:

```json
{ "model": "gpt-6-luna", "calls": 1, "inputTokens": 508, "outputTokens": 0, "totalTokens": 508, "costUsd": 0.000051 }
```

- **Tokens:** Decisions steps (route, select, evaluate) take them from the API's `usage` and sum them over all chunked calls. Select also sums its two stages. Generate takes them from LangChain `usage_metadata` and sums them over every call, retries included. A provider that reports no usage counts 0.
- **Cost:** `(inputTokens × input price + outputTokens × output price) / 1,000,000` in USD, with prices from `MODEL_PRICING` (USD per 1M tokens, keyed by the model id). A model without a price has `costUsd: null`; the UI shows `—` and marks the run total with `*`.
- **Defaults** (used when `MODEL_PRICING` is unset): `gpt-6-luna` $0.10 input / $0 output (the Decisions API bills input tokens only), `gpt-4o-mini(-2024-07-18)` $0.15 / $0.60. These are estimates. Check your provider's price list and set your own.
- **Errors:** API errors appear in a banner next to the step that failed: the status label (Invalid request 400, Conflict 409, Upstream LLM / Decisions error 502, Network error when the backend is unreachable), the message, each Zod issue as `field: message`, and the raw upstream output in a collapsible block.

## Knowledge bundle (OKF 0.2)

This folder is not part of the repository. The first **Sync now** creates it, including the top-level `index.md` (heading *Clausario Knowledge*) and `log.md`, and each later sync updates it. The regulation text comes from the sources listed under [Regulation sources and credits](#regulation-sources-and-credits).

```
backend/knowledge/
  index.md               # okf_version: "0.2"; links the regulation bundles
  log.md                 # one summary line per scrape run
  gdpr/
    index.md             # chapter headings → article links + description; recitals
    log.md               # per-file events (added / updated) + skipped count
    chapters/ch-03.md    # type: Chapter   (articles: [...])
    articles/art-017.md  # type: Article   (# Text with ## 17(1) anchors, # Related links)
    recitals/rec-065.md  # type: Recital   (articles: [...] back-links)
  eu-ai-act/
    index.md             # same as gdpr, plus ## Annexes
    log.md
    chapters/ch-03.md
    articles/art-006.md  # annexes: [I, III]; inserted articles: art-004a.md
    recitals/rec-053.md
    annexes/annex-iii.md # type: Annex     (## III(4)(a) anchors, articles: [...] back-links)
```

Global ids look like `gdpr:art-017` or `eu-ai-act:annex-iii`. Links are bundle-relative, for example `/gdpr/articles/art-017.md`. Frontmatter is validated with Zod when written and again when loaded.

**Live reload:** the backend holds the bundles in memory and watches `KNOWLEDGE_DIR` (and its parent, to see the folder itself renamed, deleted or restored). A change on disk reloads the snapshot after 0.5 s without a restart. If a file is invalid, the previous snapshot stays and the server log names the file. The Knowledge base page refreshes its counts when you click **Refresh** or return to the browser tab.

## Stack

| Layer | Technologies |
|---|---|
| **Runtime** | Node.js (≥22), TypeScript, `tsx` (runs the backend and setup scripts in development) |
| **Backend** | Express 5, Zod (settings, API and scenario schemas), `dotenv`, `cors`, `cookie-parser` |
| **Auth** | `jsonwebtoken` (httpOnly session cookie), `bcryptjs` (password hashing), `express-rate-limit` (login attempts) |
| **AI pipeline** | LangChain (`@langchain/core`, `@langchain/openai`, `@langchain/anthropic`, `@langchain/groq`, `@langchain/community`) for retries and fallbacks; LangGraph (`@langchain/langgraph`) for the review pipeline; `@langchain/langgraph-checkpoint` as the base of the Qdrant checkpointer |
| **Decision engines** | OpenAI SDK (Decisions API), `@typesafe-ai/sdk` (Jev) |
| **Generation models** | OpenAI, Anthropic, Groq and Inception (through LangChain) |
| **Data** | Qdrant (`@qdrant/js-client-rest`, payload-only points, no vectors), `uuid` (stable point IDs) |
| **Knowledge** | Google OKF 0.2 bundle on disk, `cheerio` (scraping the regulation pages), `yaml` (frontmatter), `js-tiktoken` (token budget and cost) |
| **Frontend** | React 19, React Router, Vite with `@vitejs/plugin-react`, plain CSS with design tokens (Petrol theme, light and dark), Poppins font |
| **API testing** | Postman collection and environment (`postman/`) |

### How it was tested

During development, each phase was checked with smoke tests. That test code and its packages are no longer in this repository.

- **Vitest** and **Supertest:** unit tests and API smoke tests
- **Playwright:** browser smoke tests (menus, review flow, phone and desktop layouts)
- **Newman** (Postman CLI): runs of the Postman collection
- **Fake engines and an in-memory Qdrant stand-in:** repeatable runs with no API keys and no cost

**Try it without AI keys:** set `CLAUSARIO_FAKE_ENGINES=true` in `backend/.env`. Decision engines and generation models are replaced by fakes that return canned answers, so you can click through every screen at no cost. You still need Qdrant and the regulations synced (Knowledge base → **Sync now**, which needs no API key). The results are not real, and the setting is refused when `NODE_ENV=production`.

The user manual screenshots, the PDFs and the demo video were produced with Playwright, Python-Markdown, Pillow, Kokoro TTS and FFmpeg; these tools are not part of the project.

## API

| Method | Route | Response |
|---|---|---|
| GET | `/api/health` | `200 { "status": "ok" }` |
| POST | `/api/okf/scrape/:reg` | Body `{ "dryRun"?: boolean, "redescribe"?: boolean }`, `reg` = `gdpr` \| `eu-ai-act`. `202 { "jobId" }`; `409` if a job for `reg` is running (jobs for different regulations can run at the same time) |
| GET | `/api/okf/jobs/:id` | `200 { id, reg, dryRun, status: queued\|running\|done\|failed, progress: { done, total }, result?: { added[], updated[], skipped[], redescribed[] }, error? }`; `404` if unknown |
| GET | `/api/okf/:reg/index` | `200 { chapters: [{ id, title, description, articles: [{ id, title, description }] }], recitals: [{ id, title, description }], annexes: [...] }`. Chapters and articles are in number order, annexes in numeral order (I…X); GDPR has no annexes |
| GET | `/api/okf/:reg/articles/:num` | `num` = `17` or an inserted article such as `4a`. `200 { frontmatter, body, edges: { chapter, recitals[], omnibusRecitals[], annexes[], crossRefs[] } }`. Edges are global ids, in frontmatter order. `404` if the article is not in the bundle |
| GET | `/api/okf/log` | Query `reg?` (`gdpr` \| `eu-ai-act`; omit it for the root run-summary log) and `limit?` (1–500, default 50). `200 { entries: [{ date, line }] }`, newest first, `line` without the `- ` marker |
| POST | `/api/analyze/route` | Body `{ "story": string }` (non-empty). `200 { regulations: ("gdpr"\|"eu-ai-act")[], probabilities: { personalData, aiSystem }, choice: { value: "gdpr"\|"eu-ai-act"\|"both"\|"none"\|null, confidence }, needsReview, usage }` |
| POST | `/api/analyze/select` | Body `{ "story": string, "regulations": ("gdpr"\|"eu-ai-act")[] }` (at least 1). `200 { chapters: [{ id, p, kept }], selected: [{ id, regulation, chapter, title, p }], expansion: { recitals: [{ id, title, draft }], annexes: [{ id, title }], crossRefs: [{ id, title }] }, refusals: [id], usage }`. `chapters` lists every chapter asked, in bundle order; `selected` is ranked by `p` |
| GET | `/api/llm/providers` | `200 { providers: [{ id: "openai"\|"anthropic"\|"groq"\|"inception", models: string[], default }] }`, only for providers with a key and models set |
| POST | `/api/scenarios/generate` | Body `{ story (≥ 10 chars), articleIds: string[] (≥ 1, ranked as from select), provider, model, count }`. `count` is 5, 10, 20 or any integer 1–`SCENARIO_MAX_COUNT`. `200 { scenarios: Scenario[], packManifest: { included: [{ id, tokens }], dropped: [{ id, reason }], totalTokens, budget }, invalidClauses: [{ scenarioId, clause }], usage }`. `400` for an unconfigured provider, an unlisted model, an unknown article id or a budget too small for the top article; `502` if the model fails |
| POST | `/api/scenarios/evaluate` | Body `{ story (≥ 10 chars), articleIds: string[] (≥ 1), scenarios: Scenario[] (1–SCENARIO_MAX_COUNT, unique ids) }`. `200 { scenarios: [{ id, scores: { traceability, testability, clarity }, priorityFit: "too_low"\|"correct"\|"too_high"\|null, duplicateP, verdict: "pass"\|"warn"\|"fail" }], coverage: { covered[], uncovered[], pct }, summary: { pass, warn, fail }, refusals: [questionName], usage }`. Scores are 0–2 or `null` if refused. `400` for an invalid scenario, duplicate ids or an unknown article id; `502` if Decisions fails |

`usage` = `{ model, calls, inputTokens, outputTokens, totalTokens, costUsd: number | null, engine?, fallbackUsed? }` (see [Token cost](#token-cost)). `model` is the model that actually answered; `fallbackUsed` is `true` when a fallback from `.env` served the step. Generate also returns `servedModel` (`provider:model`) and `attempts`. Route and select accept an optional `"engine": "decisions" | "jev"`.

### Accounts, runs and review

Every route except `GET /api/health` and `POST /api/auth/login` needs the `clausario_session` cookie and the menu shown. Admins pass every menu check. A run you can't see returns `404`.

| Method | Route | Menu | Purpose |
|---|---|---|---|
| POST | `/api/auth/login` | public | `{ username, password }` → `200 { user }` + httpOnly cookie; `401` (same message for any failure), `429` after 10 failures / 15 min |
| POST | `/api/auth/logout` | any | `204` |
| GET | `/api/auth/me` | any | `{ user, menus: MenuItem[] }` |
| GET | `/api/config` | any | Engines (keyed, per stage, switch, fallbacks), evaluation on/off, review threshold and rounds, providers. No secrets |
| GET | `/api/dashboard` | overview | Counts by status, awaiting review, cost, 10 recent runs (own; Admin: all) |
| POST | `/api/runs` | analyze | `{ story (20–10,000), engine?, provider, model, count, evaluate? }` → `202 { runId, run }` |
| GET | `/api/runs?status&page&pageSize` | runs | Own runs (Admin: all), newest first, paginated |
| GET | `/api/runs/:id` | runs or review | `{ run, state, next, canReview }` |
| POST | `/api/runs/:id/retry` | runs | Continue a failed run from its last checkpoint; `409` unless failed |
| GET | `/api/review/queue` | review | Runs in `awaiting_review`, oldest first |
| POST | `/api/runs/:id/review` | review | `{ action: approve \| override (regulations, articleIds) \| context (context) \| reject, note? }` → `202`; `409` if not paused, already acted on, or the add-context limit is reached |
| GET / POST | `/api/users` | users (Admin) | List; create `{ username, password, role: Admin\|Tester, menus? }` |
| PATCH | `/api/users/:id` | users (Admin) | `{ password?, role?, active?, menus? }`; you can't demote or deactivate yourself. No delete |
| GET | `/api/menus` | access (Admin) | Menu catalogue |
| GET / PUT | `/api/access` · `/api/access/:userId` | access (Admin) | Read all users' menus; set one user's `{ menus }` |

Run `status`: `running` (with `step` classify / select / review / generate / evaluate), `awaiting_review`, `completed`, `needs_rework`, `not_applicable`, `failed`.

The UI calls the API same-origin through the Vite proxy. CORS allows only `CLIENT_ORIGIN`, with credentials.

Scenario (Zod, `ScenarioListSchema = { scenarios: Scenario[] }`):

```json
{
  "id": "TS-001",
  "title": "Erasure request is honoured once the data is no longer needed for its purpose",
  "regulation": "GDPR",
  "mappedClauses": ["Art. 17(1)(a) GDPR"],
  "priority": "High",
  "prerequisites": ["A registered data subject account exists with profile and order history data"],
  "steps": ["Submit an erasure request from the privacy settings page", "Query the data stores for the data subject identifier"],
  "expectedResult": "All personal data no longer necessary for its purpose is erased without undue delay"
}
```

`id` matches `TS-###`; `regulation` is `GDPR` or `EU AI Act`; `mappedClauses` has at least 1 entry; `priority` is `High`, `Medium` or `Low`; there is at least 1 prerequisite and 2–10 steps.

Job `result` lists global ids (for example `gdpr:art-017`). If a page cannot be fetched or parsed, the job ends `failed` and `error` names the URL. If the job wrote files but reloading the knowledge snapshot fails, the job also ends `failed` and `error` says so.

Errors use one shape: `{ "error": string, "issues"?: [...], "raw"?: any }`.
- `400`: request validation failed (Zod `issues` included). Examples: an unknown `reg`, an article number like `abc`, `limit` outside 1–500, an empty `story` or `regulations`, `count` 0 or above `SCENARIO_MAX_COUNT`, an invalid or duplicate-id scenario sent to evaluate, or a malformed JSON body. Also, with no `issues`: an unconfigured provider, an unlisted model, an unknown article id, or a pack budget too small
- `404`: unknown route, job id or article
- `409`: a scrape job for that regulation is already running
- `502`: the Decisions or LLM call failed: HTTP error, missing `OPENAI_API_KEY`, an invalid response (the response body, or for generation its first 500 characters, is in `raw`), or too few scenarios after the retry
- `500`: unexpected server error

## Examples

Both examples were run end to end on 2026-11-03, through the Postman `E2E Example 1` / `E2E Example 2` folders and through the UI, with the default thresholds, `gpt-6-luna` (Decisions) and `gpt-4o-mini-2024-07-18` (generation). Probabilities and generated text vary a little between runs. The tests therefore check the structure and the key ids, not exact values.

**Example 1 (GDPR only):** "As a registered user I can request deletion of my account and all my personal data."

| Step | Result |
|---|---|
| Route | `["gdpr"]`. Personal data 1.00, AI system 0.00, choice `gdpr` (0.99), no review needed |
| Select | 9 of 10 chapters kept → `gdpr:art-017` (1.00), `gdpr:art-012` (0.95), `gdpr:art-002` (0.64). Expansion: 17 recitals, including `gdpr:rec-065` and `gdpr:rec-066`, plus 9 cross-refs |
| Generate (count 5) | 5 scenarios, TS-001…TS-005, citing Art. 17(1), 17(1)(b), 12(1), 12(3) and 2(1). Pack 5,397 / 24,000 tokens, nothing dropped, 0 invalid clauses |
| Evaluate | pass 0 / warn 4 / fail 1; coverage 67% (`gdpr:art-002` uncovered: its only scenario scored low on traceability) |

**Example 2 (both regulations):** "The hiring portal uses an ML model to screen CVs and rank candidates automatically."

| Step | Result |
|---|---|
| Route | `["gdpr", "eu-ai-act"]`. Personal data 1.00, AI system 0.98, choice `both` (0.93), no review needed |
| Select | 17 of 20 chapters kept → 16 articles (8 per regulation, the `SELECT_TOP_N` cap), including `gdpr:art-022` (0.99), `eu-ai-act:art-026` (0.95) and `eu-ai-act:art-006` (0.88). Expansion: Annex I, III and IX; 76 recitals, including `gdpr:rec-071` |
| Generate (count 10) | 10 scenarios across both regulations. Pack 23,912 / 24,000 tokens: 32 cross-ref descriptions and 45 recitals beyond the first 2 per article were dropped, no articles. 1 invalid clause (`Art. 16 GDPR`, not in the pack) |
| Evaluate | pass 0 / warn 7–9 / fail 1–3; coverage 38–44%. With count 10 < 16 articles, generation does not need to cover every article |

## Limitations

- **Thresholds are uncalibrated.** `CHAPTER_THRESHOLD=0.3` keeps most chapters. Example 1 does not select GDPR Art. 5, and picks Art. 2. Example 2 hits the `SELECT_TOP_N` cap in both regulations. Review the selected articles, and add or untick articles in the UI.
- **Evaluation is strict.** With `EVAL_SCORE_PASS=1.3`, generated scenarios scored about 0.8–1.1 on testability, so most get `warn`.
- **Descriptions are mixed.** 92 GDPR articles still have template descriptions; the EU AI Act bundle has LLM ones. Template descriptions show only the start of a provision, which weakens SELECT. Upgrade them with `{"redescribe": true}` and `DESCRIPTION_MODEL` set.
- **Cross-ref and annex regexes are simple.** "Article 4 of Regulation …" counts as a cross-ref to Art. 4, and "Articles 45 or 46" or "Annexes VI and VII" capture only the first number.
- **Generation can cite clauses outside the pack.** Such citations are listed in `invalidClauses`, not removed.
- **Jobs and results are in memory.** Scrape jobs are lost on a backend restart, and analysis results on a page reload. Download them as JSON or CSV.
- **Token counts are approximate** for Anthropic and Inception (OpenAI `o200k_base` encoding). The Anthropic and Inception providers have not been run live.
- **Thresholds are uncalibrated for Jev.** `ROUTE_*`, `CHAPTER_THRESHOLD`, `ARTICLE_THRESHOLD`, `EVAL_*` and `REVIEW_THRESHOLD` were set for the Decisions API; Jev's probabilities may sit differently. Pin `JEV_MODEL` to a version.
- **Single backend instance.** Runs left `running` when the server stops are marked `failed` at the next start (retry continues them). Two servers on the same collections would recover each other's runs.
- **Groq structured output** uses function calling; try each Groq model you configure on one short run before relying on it.

## Regulation sources and credits

The regulation text is not included in this repository. **Sync now** fetches it on your machine from these sources, and it stays subject to their terms:

| Regulation | Fetched from | Official text |
|---|---|---|
| GDPR, Regulation (EU) 2016/679 | [gdpr-info.eu](https://gdpr-info.eu), operated by intersoft consulting services AG | [EUR-Lex](https://eur-lex.europa.eu/eli/reg/2016/679/oj) |
| EU AI Act, Regulation (EU) 2024/1689 | [artificialintelligenceact.eu](https://artificialintelligenceact.eu) (AI Act Explorer), maintained by the Future of Life Institute | [EUR-Lex](https://eur-lex.europa.eu/eli/reg/2024/1689/oj) |

- EU legislative text © European Union, [eur-lex.europa.eu](https://eur-lex.europa.eu). Reuse is authorised under Commission Decision 2011/833/EU. Only EU legislation published in the Official Journal of the European Union is authentic.
- The page layout, recital links and annex links on the two source sites belong to their operators. Clausario credits them here and is not affiliated with them.
- Article descriptions in the bundle are written by Clausario (template or `DESCRIPTION_MODEL`), not by the source sites.

## Docs

- [docs/USER_MANUAL.md](docs/USER_MANUAL.md): user manual with screenshots for Admins, users and reviewers (menus, RBAC, runs, human review)
- [docs/USER_MANUAL.pdf](docs/USER_MANUAL.pdf): the same user manual as a PDF, for download or print
- [docs/SCORING.md](docs/SCORING.md) ([PDF](docs/SCORING.pdf)): how the Review agent score and the scenario evaluation are calculated, with worked examples
- [docs/FEATURE_MAP.md](docs/FEATURE_MAP.md): which backend and frontend files make up each feature, and what else to update when you change one
- [Installation.md](Installation.md): setup, configuration, JWT secret, setup scripts and npm commands
- [postman/](postman/): `Clausario.postman_collection.json` and `Clausario.postman_environment.json`
