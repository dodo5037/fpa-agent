"""FastAPI application factory and routers for the FP&A Agent Dashboard."""
import csv
import io
import json
import os

import duckdb
from fastapi import FastAPI, HTTPException, UploadFile, File, Query
from fastapi.middleware.cors import CORSMiddleware

from backend.config import get_settings
from backend.variance_engine import calculate_variances, detect_anomalies
from backend.audit import execute_logged, get_audit_entry, get_audit_log, clear_audit_log
from backend.sessions import (
    create_session, get_session, list_sessions, delete_session,
    session_exists, get_session_row_count,
)


def create_app(conn: duckdb.DuckDBPyConnection = None) -> FastAPI:
    settings = get_settings()
    if conn is None:
        from backend.db import init_db
        conn = init_db(settings.duckdb_path)

    # Create a default session if none exists
    if not session_exists(conn, "default"):
        conn.execute(
            "INSERT INTO sessions VALUES ('default', 'Default Session', CURRENT_TIMESTAMP)"
        )

    app = FastAPI(title="FP&A Agent Dashboard", version="2.0.0")

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.state.db = conn

    # ── Sessions ─────────────────────────────────────────────────────
    @app.get("/api/sessions")
    def get_sessions():
        sessions = list_sessions(app.state.db)
        for s in sessions:
            s["row_count"] = get_session_row_count(app.state.db, s["session_id"])
        return {"sessions": sessions}

    @app.post("/api/sessions")
    async def create_new_session(body: dict):
        name = body.get("name", "Untitled Session")
        return create_session(app.state.db, name)

    @app.delete("/api/sessions/{session_id}")
    def delete_session_endpoint(session_id: str):
        if session_id == "default":
            raise HTTPException(status_code=400, detail="Cannot delete default session")
        deleted = delete_session(app.state.db, session_id)
        return {"deleted_rows": deleted}

    @app.get("/api/sessions/{session_id}/info")
    def session_info(session_id: str):
        s = get_session(app.state.db, session_id)
        if s is None:
            raise HTTPException(status_code=404, detail="Session not found")
        s["row_count"] = get_session_row_count(app.state.db, session_id)
        return s

    # ── Health ────────────────────────────────────────────────────────
    @app.get("/api/health")
    def health():
        return {"status": "ok"}

    # ── Variance ──────────────────────────────────────────────────────
    @app.get("/api/variance")
    def get_variance(session_id: str = Query("default")):
        results = calculate_variances(app.state.db, session_id=session_id)
        return {"results": results, "count": len(results)}

    @app.get("/api/variance/{entity_id}")
    def get_variance_by_entity(entity_id: str, session_id: str = Query("default")):
        all_results = calculate_variances(app.state.db, session_id=session_id)
        filtered = [r for r in all_results if r["entity_id"] == entity_id]
        return {"results": filtered, "count": len(filtered)}

    # ── Anomalies ─────────────────────────────────────────────────────
    @app.get("/api/anomalies")
    def get_anomalies(
        threshold_pct: float = Query(default=None),
        session_id: str = Query("default"),
    ):
        threshold = threshold_pct if threshold_pct is not None else settings.anomaly_threshold_pct
        results = detect_anomalies(app.state.db, threshold_pct=threshold, session_id=session_id)
        return {"results": results, "count": len(results), "threshold_pct": threshold}

    # ── Summary ───────────────────────────────────────────────────────
    @app.get("/api/summary")
    def get_summary(session_id: str = Query("default")):
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
        WHERE ba.session_id = ?
        """
        results, calc_ref = execute_logged(app.state.db, sql, params={"session_id": session_id})
        row = results[0] if results else {}
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
    async def upload_data(session_id: str = Query("default"), file: UploadFile = File(...)):
        content = await file.read()
        text = content.decode("utf-8")
        reader = csv.DictReader(io.StringIO(text))

        # Support both formats:
        # Extended: entity_id,account_id,account_name,account_type,category,period_id,scenario,amount
        # Basic:    entity_id,account_id,period_id,scenario,amount
        required_basic = {"entity_id", "account_id", "period_id", "scenario", "amount"}
        if not required_basic.issubset(set(reader.fieldnames or [])):
            raise HTTPException(status_code=400, detail="CSV must have columns: entity_id, account_id, period_id, scenario, amount")

        rows = list(reader)
        if not rows:
            raise HTTPException(status_code=400, detail="CSV has no data rows")

        has_metadata = "account_name" in reader.fieldnames
        data = []
        for r in rows:
            row = (
                r["entity_id"], r["account_id"], r["period_id"],
                r["scenario"], float(r["amount"]), session_id
            )
            data.append(row)

        # Auto-insert missing dimension rows
        entities = {d[0] for d in data}
        accounts = {d[1] for d in data}
        periods = {d[2] for d in data}

        for eid in entities:
            exists = app.state.db.execute("SELECT COUNT(*) FROM entities WHERE entity_id = ?", [eid]).fetchone()[0]
            if exists == 0:
                app.state.db.execute("INSERT INTO entities VALUES (?, ?)", [eid, eid])

        if has_metadata:
            # Use metadata from the CSV
            account_meta = {}
            for r in rows:
                aid = r["account_id"]
                if aid not in account_meta:
                    account_meta[aid] = {
                        "name": r.get("account_name", aid),
                        "type": r.get("account_type", "revenue"),
                        "category": r.get("category", "Uncategorized"),
                    }
            for aid, meta in account_meta.items():
                exists = app.state.db.execute("SELECT COUNT(*) FROM accounts WHERE account_id = ?", [aid]).fetchone()[0]
                if exists == 0:
                    app.state.db.execute(
                        "INSERT INTO accounts VALUES (?, ?, ?, ?)",
                        [aid, meta["name"], meta["type"], meta["category"]]
                    )
                else:
                    # Update existing account with proper metadata
                    app.state.db.execute(
                        "UPDATE accounts SET account_name = ?, account_type = ?, category = ? WHERE account_id = ?",
                        [meta["name"], meta["type"], meta["category"], aid]
                    )
        else:
            for aid in accounts:
                exists = app.state.db.execute("SELECT COUNT(*) FROM accounts WHERE account_id = ?", [aid]).fetchone()[0]
                if exists == 0:
                    app.state.db.execute(
                        "INSERT INTO accounts VALUES (?, ?, 'revenue', 'Uncategorized')", [aid, aid]
                    )

        for pid in periods:
            exists = app.state.db.execute("SELECT COUNT(*) FROM periods WHERE period_id = ?", [pid]).fetchone()[0]
            if exists == 0:
                app.state.db.execute("INSERT INTO periods VALUES (?, 2024, 1, ?)", [pid, pid])

        try:
            app.state.db.executemany(
                "INSERT INTO budget_actuals (entity_id, account_id, period_id, scenario, amount, session_id) VALUES (?, ?, ?, ?, ?, ?)",
                data
            )
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Insert failed: {str(e)}")

        from fastapi import Response
        # Record the uploaded file
        app.state.db.execute(
            "INSERT INTO uploaded_files (file_id, session_id, filename, row_count, uploaded_at) "
            "VALUES (nextval('seq_uploaded_files'), ?, ?, ?, CURRENT_TIMESTAMP)",
            [session_id, file.filename, len(data)]
        )
        return Response(
            content=json.dumps({"rows_inserted": len(data), "filename": file.filename, "session_id": session_id}),
            status_code=201,
            media_type="application/json"
        )

    # ── Data Viewer (per session) ─────────────────────────────────────
    @app.get("/api/data/{session_id}")
    def get_session_data(session_id: str):
        """Get all raw budget_actuals rows for a session."""
        sql = """
        SELECT ba.entity_id, ba.account_id, a.account_name, a.account_type,
               a.category, ba.period_id, ba.scenario, ba.amount
        FROM budget_actuals ba
        LEFT JOIN accounts a ON ba.account_id = a.account_id
        WHERE ba.session_id = ?
        ORDER BY ba.entity_id, ba.period_id, ba.account_id, ba.scenario
        """
        rows = app.state.db.execute(sql, [session_id]).fetchall()
        cols = [d[0] for d in app.state.db.description]
        results = [dict(zip(cols, row)) for row in rows]

        # Also get uploaded files for this session
        files = app.state.db.execute(
            "SELECT file_id, filename, row_count, uploaded_at FROM uploaded_files WHERE session_id = ? ORDER BY uploaded_at DESC",
            [session_id]
        ).fetchall()
        file_list = [
            {"file_id": f[0], "filename": f[1], "row_count": f[2], "uploaded_at": str(f[3])}
            for f in files
        ]

        return {"results": results, "count": len(results), "session_id": session_id, "files": file_list}

    @app.delete("/api/data/{session_id}")
    def clear_session_data(session_id: str):
        """Clear all budget_actuals for a session (keeps the session itself)."""
        count = app.state.db.execute(
            "SELECT COUNT(*) FROM budget_actuals WHERE session_id = ?", [session_id]
        ).fetchone()[0]
        app.state.db.execute("DELETE FROM budget_actuals WHERE session_id = ?", [session_id])
        return {"deleted": count}

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

    @app.post("/api/audit/clear")
    def clear_audit():
        deleted = clear_audit_log(app.state.db)
        return {"deleted": deleted}

    # ── LLM ───────────────────────────────────────────────────────────
    @app.post("/api/ask")
    async def ask(body: dict, session_id: str = Query("default")):
        from backend.llm import ask_question
        question = body.get("question", "")
        if not question.strip():
            raise HTTPException(status_code=400, detail="Question is required")
        try:
            result = ask_question(question, app.state.db)
            return result
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"LLM error: {str(e)}")

    @app.post("/api/memo")
    async def memo(session_id: str = Query("default")):
        from backend.llm import generate_memo
        variance_data = calculate_variances(app.state.db, session_id=session_id)
        try:
            memo_text = generate_memo(variance_data, app.state.db)
            return {"memo": memo_text, "calc_ref": variance_data[0]["calc_ref"] if variance_data else None}
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Memo generation error: {str(e)}")

    # ── Settings ─────────────────────────────────────────────────────
    @app.get("/api/settings")
    def get_app_settings():
        from backend.settings import get_settings_dict
        return get_settings_dict(app.state.db)

    @app.post("/api/settings")
    async def update_app_settings(body: dict):
        from backend.settings import update_setting
        for key, value in body.items():
            update_setting(app.state.db, key, value)
        return {"status": "ok"}

    return app
