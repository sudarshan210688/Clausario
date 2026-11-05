# Installation

> **Educational use only.** Proof of concept, not production-ready, not legal advice and no compliance certification. Use synthetic data only. Provided "as is". See the full notice in [README.md](README.md).

After setup, the user manual at [`docs/USER_MANUAL.md`](docs/USER_MANUAL.md) explains every menu, role and screen, with screenshots. The same manual as a PDF, for download or print: [`docs/USER_MANUAL.pdf`](docs/USER_MANUAL.pdf).

## Prerequisites

- **Node.js 22 or newer** and npm (`node -v`)
- **Git**
- **Qdrant Cloud** cluster URL and API key (the free tier is enough)
- **OpenAI API key**
- Optional: TypeSafe (Jev), Anthropic and Groq API keys

## Quick start

### 1. Install

```bash
git clone <your-repo-url> Clausario
cd Clausario/backend
npm install
cd ../frontend
npm install
cd ..
```

### 2. Create the `.env` files

Windows (PowerShell):

```powershell
Copy-Item backend/.env.example backend/.env
Copy-Item frontend/.env.example frontend/.env
```

macOS / Linux:

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
```

### 3. Generate the JWT secret

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Paste the output as `JWT_SECRET` in `backend/.env`. It signs the login session cookie and must be at least 32 characters. Changing it later signs everyone out.

### 4. Fill in `backend/.env`

Required:

| Variable | Example |
|---|---|
| `OPENAI_API_KEY` | your OpenAI key |
| `OPENAI_MODELS` | `gpt-4o-mini-2024-07-18` |
| `QDRANT_URL` | `https://<cluster-id>.<region>.cloud.qdrant.io` |
| `QDRANT_API_KEY` | your Qdrant API key |
| `JWT_SECRET` | the value from step 3 |
| `ADMIN_USERNAME`, `ADMIN_PASSWORD` | the first Admin account (password 8+ characters) |

Optional: `TYPESAFE_API_KEY` (Jev engine), `ANTHROPIC_API_KEY` / `ANTHROPIC_MODELS`, `GROQ_API_KEY` / `GROQ_MODELS`. Every other variable has a working default ([Configuration reference](#configuration-reference)).

### 5. Run the one-time setup scripts

```bash
cd backend
npm run qdrant:ping                 # checks the Qdrant URL and key (expect 200)
npm run seed:admin                  # creates ADMIN_USERNAME as Admin (skipped if it already exists)
npm run setup:menus -- --dry-run    # preview the menu setup
npm run setup:menus                 # creates the menucontroller collection and grants menus
cd ..
```

These scripts never delete or recreate the `users` and `checkpoints` collections, and are safe to re-run.

### 6. Start

Terminal 1:

```bash
cd backend
npm run dev                         # API on http://localhost:5000
```

Terminal 2:

```bash
cd frontend
npm run dev                         # UI on http://localhost:5173
```

Open http://localhost:5173 and sign in with `ADMIN_USERNAME` / `ADMIN_PASSWORD`.

**Load the regulations (first run only).** The repository does not include `backend/knowledge/`. Open **Knowledge base** and click **Sync now** on the GDPR tab and the EU AI Act tab (5–7 minutes each). The first sync creates the folder with `index.md`, `log.md`, `gdpr/` and `eu-ai-act/`. Until then, analyses find no articles and end as *Not applicable*. Step by step with screenshots: user manual at `docs/USER_MANUAL.md`, section [9. Knowledge base](docs/USER_MANUAL.md#9-knowledge-base), or page 26 of the PDF [`docs/USER_MANUAL.pdf`](docs/USER_MANUAL.pdf).

## npm commands

Backend (`backend/`):

| Command | Purpose |
|---|---|
| `npm install` | Install dependencies |
| `npm run dev` | Start the API with reload on change |
| `npm run build` | Compile to `dist/` |
| `npm start` | Run the compiled build |
| `npm run qdrant:ping` | Check the Qdrant connection (read-only, never prints the key) |
| `npm run qdrant:inspect` | Show the `users`, `checkpoints` and `menucontroller` collections (read-only) |
| `npm run seed:admin` | Create `ADMIN_USERNAME` as Admin if it doesn't exist |
| `npm run setup:menus` | One-time menu setup from `.env` (`-- --dry-run` previews) |

Frontend (`frontend/`):

| Command | Purpose |
|---|---|
| `npm install` | Install dependencies |
| `npm run dev` | Start the UI with hot reload |
| `npm run build` | Build static files to `dist/` |
| `npm run preview` | Serve the built `dist/` locally |

## Configuration reference

All variables are validated with Zod at startup. If a value is invalid, the server prints the problem and exits with code 1.

| Variable | Default | Description |
|---|---|---|
| `PORT` | `5000` | HTTP port (integer 1–65535) |
| `KNOWLEDGE_DIR` | `./knowledge` | OKF knowledge bundle directory. Relative paths resolve against `backend/` |
| `GDPR_BASE_URL` | `https://gdpr-info.eu` | GDPR source site (must be a URL) |
| `EU_AI_ACT_BASE_URL` | `https://artificialintelligenceact.eu` | EU AI Act source site (must be a URL). Also used to build the `external_annexes` URLs for Annex XI–XIV |
| `SCRAPE_DELAY_MS` | `1000` | Delay between sequential scrape requests (ms, integer ≥ 0) |
| `OPENAI_API_KEY` | — | OpenAI key. Required for `/api/analyze/*` (Decisions), when `DESCRIPTION_MODEL` is set, and for the `openai` generation provider. Without it, analyze requests return `502` |
| `DESCRIPTION_MODEL` | empty | OpenAI chat model that writes the one-line descriptions. Empty → deterministic template descriptions (no LLM, no key) |
| `DECISIONS_MODEL` | `gpt-6-luna` | OpenAI Decisions model for route / select. `gpt-6-luna` is the only supported model |
| `ROUTE_THRESHOLD` | `0.5` | ROUTE: a regulation applies when its predicate probability is ≥ this (0–1) |
| `ROUTE_MIN_CONFIDENCE` | `0.6` | ROUTE: `needsReview` when the choice confidence is below this (0–1) |
| `CHAPTER_THRESHOLD` | `0.3` | SELECT stage 1: keep chapters with probability ≥ this (0–1) |
| `ARTICLE_THRESHOLD` | `0.5` | SELECT stage 2: keep articles with probability ≥ this (0–1) |
| `SELECT_TOP_N` | `8` | SELECT stage 2: max articles kept per regulation (integer ≥ 1) |
| `OPENAI_MODELS` | empty | OpenAI chat models for scenario generation, comma-separated; the first is the default. Uses `OPENAI_API_KEY` |
| `ANTHROPIC_API_KEY` | — | Anthropic key for the `anthropic` generation provider |
| `ANTHROPIC_MODELS` | empty | Anthropic models, comma-separated; the first is the default |
| `INCEPTION_API_KEY` | — | Inception Labs key for the `inception` generation provider |
| `INCEPTION_BASE_URL` | `https://api.inceptionlabs.ai/v1` | Inception's OpenAI-compatible endpoint (must be a URL) |
| `INCEPTION_MODELS` | empty | Inception models, comma-separated; the first is the default |
| `PACK_TOKEN_BUDGET` | `24000` | Max tokens of packed context sent to generation (integer ≥ 1, js-tiktoken count) |
| `LLM_TEMPERATURE` | `0.2` | Sampling temperature for generation and LLM descriptions (0–2) |
| `SCENARIO_MAX_COUNT` | `50` | Max scenarios per generate request, and per evaluate request (integer ≥ 1) |
| `EVAL_SCORE_PASS` | `1.3` | EVALUATE: a scenario with any score below this (0–2 scale) is at best `warn` |
| `EVAL_SCORE_FAIL` | `0.7` | EVALUATE: a scenario with any score below this (0–2 scale) is `fail` |
| `EVAL_DUP_THRESHOLD` | `0.7` | EVALUATE: a scenario whose `duplicate_of_another` probability is ≥ this is at best `warn` (0–1) |
| `MODEL_PRICING` | `gpt-6-luna=0.10/0, gpt-4o-mini-2024-07-18=0.15/0.60, gpt-4o-mini=0.15/0.60` | Token cost: USD per 1M tokens as `model=input/output`, comma-separated, keyed by the `DECISIONS_MODEL` / `*_MODELS` ids. A model without an entry shows tokens but no cost. Empty or unset → the defaults shown |

### Accounts, Qdrant, engines, review and generation

| Variable | Default | Description |
|---|---|---|
| `JWT_SECRET` | — | **Required to start the server.** Session signing secret, at least 32 characters |
| `SESSION_HOURS` | `8` | Session cookie lifetime (hours) |
| `ADMIN_USERNAME`, `ADMIN_PASSWORD` | — | First Admin for `npm run seed:admin`; created only if the username doesn't exist yet |
| `CLIENT_ORIGIN` | `http://localhost:5173` | Origin allowed by CORS (with credentials) when the UI calls the API directly |
| `QDRANT_URL`, `QDRANT_API_KEY` | — | **Required to start the server** |
| `QDRANT_USERS_COLLECTION` | `users` | User accounts. Never dropped or recreated |
| `QDRANT_CHECKPOINTS_COLLECTION` | `checkpoints` | LangGraph checkpoints + `clausario_run` summaries. Never dropped or recreated |
| `QDRANT_MENU_COLLECTION` | `menucontroller` | Menu catalogue and per-user menu access |
| `MENU_DEFAULT_TESTER` | `overview,analyze,runs` | Menus a User (Tester) gets when no access record exists |
| `DECISION_ENGINE` | `decisions` | Default decision engine for every stage: `decisions` (OpenAI Decisions API) or `jev` (TypeSafe Jev) |
| `ROUTE_ENGINE`, `SELECT_ENGINE`, `REVIEW_ENGINE`, `EVAL_ENGINE` | empty | Per-stage engine; empty = `DECISION_ENGINE` |
| `ENGINE_UI_SWITCH` | `true` | Users may pick the classification engine per run |
| `DECISION_MAX_RETRIES` | `2` | Retries per engine after the first attempt (400/401/403/422 are not retried) |
| `DECISION_TIMEOUT_MS` | `60000` | Timeout per engine attempt |
| `DECISION_FALLBACKS` | `jev:jev-1.14.0` (example) | `engine:model` list tried in order when the stage engine fails. Entries without a key are skipped |
| `TYPESAFE_API_KEY` | — | Jev key (console.typesafe.ai) |
| `JEV_MODEL` | `jev-1.14.0` | Jev model; pin a version (`jev-latest` is an alias) |
| `JEV_MAX_QUESTIONS_PER_CALL` | `100` | Questions per Jev request |
| `EVAL_ENABLED` | `true` | `false` turns evaluation off (endpoint returns `409`, UI hides it) |
| `REVIEW_THRESHOLD` | `70` | Review score (0–100) below which a run waits for human review |
| `HITL_MAX_ROUNDS` | `3` | Add-context rounds per run; approve, override and reject stay available after the limit |
| `GROQ_API_KEY`, `GROQ_MODELS` | — | Groq generation provider (generation only); models comma-separated, first = default |
| `LLM_MAX_RETRIES` | `2` | Retries per generation model after the first attempt |
| `LLM_TIMEOUT_MS` | `120000` | Timeout per generation attempt |
| `GENERATION_FALLBACKS` | empty | `provider:model` list tried in order when the chosen model fails (same or another provider; must be keyed and listed in `*_MODELS`) |
| `CLAUSARIO_FAKE_ENGINES` | `false` | Tests and offline demos only: fake engines and models. Refused when `NODE_ENV=production` |

Add Jev and Groq prices to `MODEL_PRICING` to see their cost (Jev bills input only, e.g. `jev-1.14.0=0.042/0`). `LLM_TEMPERATURE` is never sent to Anthropic models.

**Token cost:** route, select, generate and evaluate responses carry `usage { model, calls, inputTokens, outputTokens, totalTokens, costUsd }`, and the UI shows it per step and as a run total. To price Anthropic or Inception models, add them, e.g. `MODEL_PRICING=gpt-6-luna=0.10/0,gpt-4o-mini-2024-07-18=0.15/0.60,<anthropic-model-id>=<in>/<out>`. Setting `MODEL_PRICING` replaces the defaults entirely, so list every model you use.

**Decisions thresholds:** the defaults above are uncalibrated. Tune them on about 20 labelled stories. On the two example stories, `CHAPTER_THRESHOLD=0.3` kept 9 of 10 GDPR chapters, so stage 2 asks about most articles. Raise it if SELECT is slow or picks articles from chapters that do not fit.

**Evaluation thresholds:** also uncalibrated. Keep `EVAL_SCORE_FAIL` below `EVAL_SCORE_PASS`. Coverage uses `ARTICLE_THRESHOLD`: an article counts as covered when its coverage probability is ≥ that value.

**Description switch:**
- Leave `DESCRIPTION_MODEL` empty to scrape with no API key. Each doc gets a template description: chapter title, article title, then the first ~40 words of the text. `description_by` is `template`.
- Set `DESCRIPTION_MODEL` (and `OPENAI_API_KEY`) to have an LLM write a one-sentence summary instead. If a model is set without a key, the scrape job fails at once, before fetching anything.
- To switch an existing bundle from template to LLM descriptions, set the model and send `{"redescribe":true}`. Every unchanged doc gets a new description; its text and `content_hash` stay the same. Add `"dryRun":true` to list them first without writing.

**Generation providers:**
- A provider appears in `GET /api/llm/providers`, and can be used for generation, only when its key **and** at least one model are set in `backend/.env`. With `OPENAI_API_KEY` but no `OPENAI_MODELS`, the list is empty. Put these values in `.env`, not in `.env.example`, and restart the server after any change; `.env` is read only at startup.
- Model ids are whatever the provider accepts (for example the OpenAI or Anthropic model names from their docs). The generate request's `model` must be one of the listed ids, or the request gets `400`.
- Some reasoning models reject a `temperature` parameter. If generation returns `502` mentioning temperature, pick a different model.

**Pack budget:** `PACK_TOKEN_BUDGET` caps the context sent with each generate request. js-tiktoken counts with the OpenAI `o200k_base` encoding, so counts are approximate for Anthropic and Inception; leave headroom below the model's context window. When the pack does not fit, the response's `packManifest.dropped` lists what was cut, and why.

### Frontend variables (`frontend/.env`)

| Variable | Default | Description |
|---|---|---|
| `VITE_API_PROXY_TARGET` | `http://localhost:5000` | Backend the Vite dev server proxies `/api` to. Match the backend `PORT` |
| `VITE_API_BASE_URL` | empty | Leave empty to use the proxy (same-origin session cookie). Set it only to call the backend directly; then `CLIENT_ORIGIN` in `backend/.env` must be the UI's origin |

Restart `npm run dev` after changing a `.env` file; values are read only at startup.
