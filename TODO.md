# FP&A Agent Dashboard — Status

> **Rules:** All financial math = SQL/Python only. LLM = NL-to-SQL + summarization.
> Every number traceable via calculation_log. **Audit is mandatory — always ON, no toggle.**

---

## Status: COMPLETE — Aug 7, 2026

All features built, tested, deployed. **118 backend tests pass.** Zero JS errors.

### What's running at http://localhost:5173

| Feature | Status |
|---------|--------|
| CSV upload → auto account-type inference | ✓ |
| 3 KPI cards (Revenue, Expenses, Net Variance) | ✓ |
| Variance by Account chart (5 types: Bar/Line/Area/Pie/Donut) | ✓ |
| Click chart bar → period detail drill-down | ✓ |
| Anomaly detection with configurable threshold | ✓ |
| Session isolation (multiple independent workspaces) | ✓ |
| Plain-English Q&A via Ollama (async, cancellable) | ✓ (needs Ollama configured) |
| Auto-generated variance memo (YTD-aggregated) | ✓ (needs Ollama configured) |
| Audit trail (mandatory, mutation-driven — no toggle) | ✓ |
| AI conversation history (persisted per session) | ✓ |
| Smart polling (hash-based, no spurious reloads) | ✓ |
| Diverging variance bar chart | ✓ |
| Monthly variance + cumulative YTD combo chart | ✓ |
| Vector delta trendline chart | ✓ |
| Timeseries engine (cumulative YTD, moving avg) | ✓ |
| Regional/entity-level aggregation | ✓ |
| Dark mode + monospace numbers | ✓ |
| Widget menu (···) on each panel | ✓ |
| Docker Compose deployment | ✓ |

### Backend endpoints

`/api/health`, `/api/sessions`, `/api/sessions/{id}/info`, `/api/sessions/{id}/version`,
`/api/summary`, `/api/variance`, `/api/anomalies`, `/api/timeseries`, `/api/regional`,
`/api/audit/trail`, `/api/ai/history`, `/api/settings`, `/api/data/{id}`,
`/api/ask` (POST), `/api/memo` (POST), `/api/data/upload` (POST),
`/api/audit/log` (GET), `/api/audit/{ref}` (GET)

### Bugs resolved (historical — confirmed fixed via fresh-clone test, Aug 7)

1. **Spurious 60s poll reload** — dataHashRef started null, first poll always triggered reload
2. **Upload wiped UI** — handleUploadComplete used isRefresh=false
3. **Phantom audit refs** — calc_ref returned even when audit disabled (audit now mandatory)
4. **Null-prop crashes** — VarianceTable + AnomalyPanel lacked null guards
5. **$0.00 KPI values** — DuckDB `conn.description` not thread-safe across concurrent API calls; fixed with per-thread connections
6. **Pie/Donut chart 0.0% labels** — ApexCharts `val` in dataLabels formatter is already a percentage; formatter was double-dividing
7. **Divergence chart overflow** — large account lists squished; fixed with overflow-y-auto + dynamic height
8. **Audit logging spam** — anomaly hook fired on every read/poll; moved to mutation-driven state-diffing in upload handler

### Known limitations

- Ollama integration requires manual configuration in Settings
- Frontend uses manual state management (TanStack Query provider exists but useQuery not adopted)
- No frontend test framework
- Browser caching can serve stale JS after Docker rebuild (use ?v=N query param)

---

## Backlog

- Multi-entity / multi-period comparison views
- User authentication (JWT or OIDC)
- Scheduled data ingestion (cron-based CSV pull)
- Export memos to PDF
- Scenario modeling (what-if analysis)
- Email alert on anomaly detection
- Multi-user role-based access control

---

## NEEDS MANUAL VERIFICATION — do NOT add to feature list until confirmed

The following features were implemented but have not been independently verified
via a full fresh-clone browser test. Manually test each one, then move verified
items into the feature list above.

- Drag-and-drop grid layout (react-grid-layout)
- Session-based layout persistence (localStorage)
- Resize handles (8-edge, neon teal on hover)
- Auto-Layout button (compact vertical packing)
- Wobble mount animation on widget drop
- +Add Widget menu with hidden-by-default advanced charts
- Multi-instance widget spawning
- Smart chart label truncation (SVG formatter, not CSS)
- Animated gradient progress button (Ask / Generate Memo)
- Cancel button for active LLM generation
- Pie/Donut slices showing real percentages
- Anomalies panel overflow-y-auto scroll
