"""FastAPI application factory and routers for the FP&A Agent Dashboard."""
import csv
import io
import json
import os
from datetime import datetime, timezone

import duckdb
from fastapi import FastAPI, HTTPException, UploadFile, File, Query
from fastapi.middleware.cors import CORSMiddleware

from backend.config import get_settings
from backend.variance_engine import calculate_variances, detect_anomalies
from backend.audit import execute_logged, get_audit_entry, get_audit_log


def create_app(conn: duckdb.DuckDBPyConnection = None) -> FastAPI:
    """
    Create and configure the FastAPI application.

    Args:
        conn: Optional pre-initialized DuckDB connection (for testing).
              If None, initializes from settings.
    """
    settings = get_settings()
    if conn is None:
        from backend.db import init_db
        conn = init_db(settings.duckdb_path)

    app = FastAPI(title="FP&A Agent Dashboard", version="1.0.0")

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Store conn on app state
    app.state.db = conn

    # ── Health ────────────────────────────────────────────────────────
    @app.get("/api/health")
    def health():
        return {"status": "ok"}

    # ── Variance ──────────────────────────────────────────────────────
    @app.get("/api/variance")
    def get_variance():
        results = calculate_variances(app.state.db)
        return {"results": results, "count": len(results)}

    @app.get("/api/variance/{entity_id}")
    def get_variance_by_entity(entity_id: str):
        all_results = calculate_variances(app.state.db)
        filtered = [r for r in all_results if r["entity_id"] == entity_id]
        return {"results": filtered, "count": len(filtered)}

    # ── Anomalies ─────────────────────────────────────────────────────
    @app.get("/api/anomalies")
    def get_anomalies(threshold_pct: float = Query(default=None)):
        threshold = threshold_pct if threshold_pct is not None else settings.anomaly_threshold_pct
        results = detect_anomalies(app.state.db, threshold_pct=threshold)
        return {"results": results, "count": len(results), "threshold_pct": threshold}

    # ── Summary ───────────────────────────────────────────────────────
    @app.get("/api/summary")
    def get_summary():
        sql = """
        SELECT
            SUM(CASE WHEN a.account_type = 'revenue' AND ba.scenario = 'budget'
                THEN ba.amount ELSE 0 END) AS total_revenue_budget,
            SUM(CASE WHEN a.account_type = 'revenue' AND ba.scenario = 'actual'
                THEN ba.amount ELSE 0 END) AS total_revenue_actual,
            SUM(CASE WHEN a.account_type = 'expense' AND ba.scenario = 'budget'
                THEN ba.amount ELSE 0 END) AS total_expense_budget,
            SUM(CASE WHEN a.account_type = 'expense' AND ba.scenario = 'actual'
                THEN ba.amount ELSE 0 END) AS total_expense_actual
        FROM budget_actuals ba
        JOIN accounts a ON ba.account_id = a.account_id
        """
        results, calc_ref = execute_logged(app.state.db, sql, params={})
        row = results[0] if results else {}
        # Deterministic net variance: actual revenue - actual expense
        rev_actual = float(row.get("total_revenue_actual", 0) or 0)
        exp_actual = float(row.get("total_expense_actual", 0) or 0)
        rev_budget = float(row.get("total_revenue_budget", 0) or 0)
        exp_budget = float(row.get("total_expense_budget", 0) or 0)
        net_variance = (rev_actual - rev_budget) - (exp_actual - exp_budget)
        return {
            "total_revenue_budget": rev_budget,
            "total_revenue_actual": rev_actual,
            "total_expense_budget": exp_budget,
            "total_expense_actual": exp_actual,
            "net_variance": round(net_variance, 2),
            "calc_ref": calc_ref,
        }

    # ── Data Upload ───────────────────────────────────────────────────
    @app.post("/api/data/upload")
    async def upload_data(file: UploadFile = File(...)):
        content = await file.read()
        text = content.decode("utf-8")
        reader = csv.DictReader(io.StringIO(text))

        required_cols = {"entity_id", "account_id", "period_id", "scenario", "amount"}
        if not required_cols.issubset(set(reader.fieldnames or [])):
            raise HTTPException(status_code=400, detail="CSV must have columns: entity_id, account_id, period_id, scenario, amount")

        rows = list(reader)
        if not rows:
            raise HTTPException(status_code=400, detail="CSV has no data rows")

        data = [(r["entity_id"], r["account_id"], r["period_id"], r["scenario"], float(r["amount"])) for r in rows]

        # Auto-insert missing dimension rows to satisfy FK constraints
        entities = {d[0] for d in data}
        accounts = {d[1] for d in data}
        periods = {d[2] for d in data}

        for eid in entities:
            conn_check = app.state.db.execute(
                "SELECT COUNT(*) FROM entities WHERE entity_id = ?", [eid]
            ).fetchone()[0]
            if conn_check == 0:
                app.state.db.execute(
                    "INSERT INTO entities VALUES (?, ?)", [eid, eid]
                )
        for aid in accounts:
            conn_check = app.state.db.execute(
                "SELECT COUNT(*) FROM accounts WHERE account_id = ?", [aid]
            ).fetchone()[0]
            if conn_check == 0:
                app.state.db.execute(
                    "INSERT INTO accounts VALUES (?, ?, 'revenue', 'Uncategorized')",
                    [aid, aid]
                )
        for pid in periods:
            conn_check = app.state.db.execute(
                "SELECT COUNT(*) FROM periods WHERE period_id = ?", [pid]
            ).fetchone()[0]
            if conn_check == 0:
                app.state.db.execute(
                    "INSERT INTO periods VALUES (?, 2024, 1, ?)",
                    [pid, pid]
                )

        try:
            app.state.db.executemany(
                "INSERT INTO budget_actuals VALUES (?, ?, ?, ?, ?)", data
            )
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Insert failed: {str(e)}")

        from fastapi import Response
        return Response(
            content=json.dumps({"rows_inserted": len(data), "filename": file.filename}),
            status_code=201,
            media_type="application/json"
        )

    # ── Audit ─────────────────────────────────────────────────────────
    @app.get("/api/audit/log")
    def audit_log(limit: int = Query(50, ge=1, le=500), offset: int = Query(0, ge=0)):
        entries = get_audit_log(app.state.db, limit=limit, offset=offset)
        return {"entries": entries, "count": len(entries)}

    @app.get("/api/audit/{result_ref}")
    def audit_entry(result_ref: str):
        entry = get_audit_entry(app.state.db, result_ref)
        if entry is None:
            raise HTTPException(status_code=404, detail="Audit entry not found")
        return entry

    return app
