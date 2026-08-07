# FP&A Agent Dashboard — Status

> **Rules:** All financial math = SQL/Python only. LLM = NL-to-SQL + summarization.
> Every number traceable via calculation_log. Audit OFF by default.

---

## Status: COMPLETE — Aug 1, 2026

All features built, tested, deployed. 114 backend tests pass. Zero JS errors.

### What's running at http://localhost:5173

| Feature | Status |
|---------|--------|
| CSV upload → auto account-type inference | ✓ |
| 3 KPI cards (Revenue, Expenses, Net Variance) | ✓ |
| Variance by Account chart (5 types: Bar/Line/Area/Pie/Donut) | ✓ |
| Click chart bar → period detail drill-down | ✓ |
| Anomaly detection with configurable threshold | ✓ |
| Session isolation (multiple independent workspaces) | ✓ |
| Plain-English Q&A via Ollama | ✓ (needs Ollama configured) |
| Auto-generated variance memo | ✓ (needs Ollama configured) |
| Audit trail (toggle in Settings) | ✓ |
| Smart polling (hash-based, no spurious reloads) | ✓ |
| Diverging variance bar chart (T2.A) | ✓ |
| Monthly variance + cumulative YTD combo chart (T2.B) | ✓ |
| Vector delta trendline chart (T2.C) | ✓ |
| Timeseries engine (cumulative YTD, moving avg) (T1) | ✓ |
| Regional/entity-level aggregation | ✓ |
| Dark mode + monospace numbers (T3) | ✓ |
| Widget menu (···) on each panel | ✓ |
| Docker Compose deployment | ✓ |

### Backend (12 endpoints)

`/api/health`, `/api/sessions`, `/api/sessions/{id}/info`, `/api/sessions/{id}/version`,
`/api/summary`, `/api/variance`, `/api/anomalies`, `/api/timeseries`, `/api/regional`,
`/api/audit/log`, `/api/audit/{ref}`, `/api/settings`, `/api/data/{id}`,
`/api/ask` (POST), `/api/memo` (POST), `/api/data/upload` (POST)

### Bugs fixed this session

1. **Spurious 60s poll reload** — dataHashRef started null, first poll always triggered reload
2. **Upload wiped UI** — handleUploadComplete used isRefresh=false
3. **Phantom audit refs** — calc_ref returned even when audit disabled
4. **Null-prop crashes** — VarianceTable + AnomalyPanel lacked null guards

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
