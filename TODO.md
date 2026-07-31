# FP&A Agent Dashboard — Kanban Board

> **Rules:** Work serially through Steps 1-7. No parallel subagents until
> Step 7 (after data model + variance engine are tested). Ask for approval
> before: destructive commands, >50-line edits, schema changes, or new
> dependency installs. All financial math = SQL/Python only. LLM = NL-to-SQL
> + summarization only. Every number traceable via calculation_log.

---

## STEP 0 — Project Scaffolding & Security [PENDING]

- [ ] 0.1 Create project directory structure (backend/, frontend/, docker/, tests/)
- [ ] 0.2 Create .env.example with placeholder keys (GLM_API_KEY, OLLAMA_BASE_URL, OLLAMA_MODEL)
- [ ] 0.3 Create .gitignore (add .env, __pycache__, node_modules, .duckdb, *.parquet)
- [ ] 0.4 Create empty .env file (user fills in real keys)
- [ ] 0.5 git init + first commit (.gitignore + .env.example only — .env excluded)
- [ ] 0.6 Create docker-compose.yml skeleton (FastAPI, Ollama, frontend — no code yet)

**Approval gate:** Review structure before proceeding to Step 1.

---

## STEP 1 — DuckDB Data Model & Schema [PENDING]

- [ ] 1.1 Design schema for `budget_actuals` table (entity, account, period, scenario, amount)
- [ ] 1.2 Design schema for `calculation_log` audit table (id, sql_query, params_json, timestamp, result_ref)
- [ ] 1.3 Design schema for `accounts` metadata table (account_id, name, type[revenue/expense], category)
- [ ] 1.4 Design schema for `entities` and `periods` dimension tables
- [ ] 1.5 Write SQL DDL migration script (db/init_schema.sql)
- [ ] 1.6 Write Python db.py module — DuckDB connection + schema initialization
- [ ] 1.7 Write seed script with sample budget-vs-actuals data (db/seed.py)
- [ ] 1.8 Test: schema creates cleanly, seed data loads, row counts correct

**Approval gate:** Schema review before any code. TDD: write schema tests first.

---

## STEP 2 — Variance Engine (SQL + Python) [PENDING]

- [ ] 2.1 Write SQL variance query: actual - budget, variance_pct, favorable/unfavorable flag
- [ ] 2.2 Apply FP&A rules: revenue positive = favorable (emerald), expense positive = unfavorable (rose)
- [ ] 2.3 Write Python variance_engine.py — executes SQL, returns structured results
- [ ] 2.4 Implement calculation_log injection: every query logged with params + timestamp + result hash
- [ ] 2.5 Write anomaly detection: flag variances exceeding threshold (configurable %)
- [ ] 2.6 TDD: test variance calculation accuracy (known inputs -> expected outputs)
- [ ] 2.7 TDD: test calculation_log is populated for every query
- [ ] 2.8 TDD: test favorable/unfavorable classification for revenue vs expense
- [ ] 2.9 TDD: test anomaly threshold detection

**Approval gate:** All variance engine tests must pass before Step 3.

---

## STEP 3 — Audit & Traceability Layer [PENDING]

- [ ] 3.1 Implement query wrapper: every SQL execution auto-logs to calculation_log
- [ ] 3.2 Implement result_ref generation (deterministic hash of query+params+result)
- [ ] 3.3 Implement API endpoint: GET /audit/{result_ref} — returns full provenance
- [ ] 3.4 Implement API endpoint: GET /audit/log — paginated queryable audit trail
- [ ] 3.5 TDD: test that no query can execute without being logged
- [ ] 3.6 TDD: test result_ref lookup returns correct query + params + timestamp
- [ ] 3.7 TDD: test audit log pagination and filtering

**Approval gate:** Audit layer fully tested. Core data + variance + audit = foundation complete.

---

## STEP 4 — FastAPI Backend & REST Endpoints [PENDING]

- [ ] 4.1 Create FastAPI app skeleton (main.py, routers/, config.py)
- [ ] 4.2 Config: load .env (GLM_API_KEY, OLLAMA_BASE_URL, OLLAMA_MODEL, DUCKDB_PATH)
- [ ] 4.3 Endpoint: GET /api/variance — returns variance results (audit-logged)
- [ ] 4.4 Endpoint: GET /api/variance/{entity} — filtered by entity
- [ ] 4.5 Endpoint: GET /api/anomalies — flagged anomalies only
- [ ] 4.6 Endpoint: GET /api/summary — aggregated KPIs (revenue, expenses, net variance)
- [ ] 4.7 Endpoint: POST /api/data/upload — ingest CSV/JSON budget-actuals data
- [ ] 4.8 TDD: test each endpoint returns correct data + audit log entries
- [ ] 4.9 TDD: test data upload correctly populates budget_actuals

---

## STEP 5 — Ollama LLM Integration (NL-to-SQL + Memo Generation) [PENDING]

- [ ] 5.1 Create LLM client wrapper (llm.py) — connects to local Ollama
- [ ] 5.2 Implement NL-to-SQL: user question -> validated SQL (allowlist of tables/columns)
- [ ] 5.3 SQL validation layer: reject non-SELECT, reject unauthorized tables, parameterize
- [ ] 5.4 Execute LLM-generated SQL through audit-logged query wrapper (Step 3)
- [ ] 5.5 Implement memo generation: pass pre-computed results to LLM, get narrative summary
- [ ] 5.6 LLM must receive computed numbers only — never asked to do arithmetic
- [ ] 5.7 Endpoint: POST /api/ask — plain-English Q&A returning data + SQL + audit ref
- [ ] 5.8 Endpoint: POST /api/memo — generate memo from computed variance results
- [ ] 5.9 TDD: test NL-to-SQL produces valid SQL for common question patterns
- [ ] 5.10 TDD: test SQL validation rejects dangerous/unauthorized queries
- [ ] 5.11 TDD: test memo generation includes correct pre-computed figures
- [ ] 5.12 TDD: test no LLM endpoint performs arithmetic

**Approval gate:** LLM integration tested. Backend fully functional. Parallel agents now allowed.

---

## STEP 6 — React + Tailwind Frontend [PENDING]

- [ ] 6.1 Scaffold React app (Vite + Tailwind CSS)
- [ ] 6.2 Configure design system: bg-slate-900, bg-slate-800, Inter, JetBrains Mono
- [ ] 6.3 Set up Tailwind config: emerald-400 (favorable), rose-400 (unfavorable) as variance colors
- [ ] 6.4 Build KPI summary cards (revenue, expenses, net variance) with JetBrains Mono figures
- [ ] 6.5 Build variance data table — aligned decimals, emerald/rose variance coloring
- [ ] 6.6 Build anomaly flags panel — rose-400 highlighted rows
- [ ] 6.7 Install + configure ApexCharts (no gridlines)
- [ ] 6.8 Build main variance bar chart — emerald/rose bars, no gridlines
- [ ] 6.9 Implement click-to-expand: main chart -> detailed breakdown with reveal animation
- [ ] 6.10 Ensure expanded chart is static after transition (no looping animations)
- [ ] 6.11 Build NL Q&A panel — text input, displays results + SQL + audit ref
- [ ] 6.12 Build memo viewer — displays LLM-generated memo with cited calculation_log refs
- [ ] 6.13 Build audit trail panel — clickable result_refs link numbers to provenance
- [ ] 6.14 Data upload UI — drag-and-drop CSV upload to /api/data/upload

---

## STEP 7 — Docker Compose & Integration [PENDING]

- [ ] 7.1 Write Dockerfile for FastAPI backend
- [ ] 7.2 Write Dockerfile for React frontend (build + nginx serve)
- [ ] 7.3 Write docker-compose.yml: backend + ollama + frontend services
- [ ] 7.4 Configure Ollama service with model pull (e.g., llama3.2 or qwen2.5)
- [ ] 7.5 Volume mounts: DuckDB persistence, Ollama model storage
- [ ] 7.6 Environment variable wiring from .env
- [ ] 7.7 End-to-end test: docker compose up -> all services healthy
- [ ] 7.8 End-to-end test: upload data -> see variances -> ask question -> get memo
- [ ] 7.9 End-to-end test: click any number -> see audit provenance

---

## BACKLOG (post-MVP)

- [ ] Multi-entity / multi-period comparison views
- [ ] User authentication (JWT or OIDC)
- [ ] Scheduled data ingestion (cron-based CSV pull)
- [ ] Export memos to PDF
- [ ] Scenario modeling (what-if analysis)
- [ ] Email alert on anomaly detection
- [ ] Multi-user role-based access control

---

## STATUS LEGEND

- [ ] = pending
- [~] = in progress
- [x] = done
- [!] = blocked / needs approval
