"""FastAPI application factory and routers for the FP&A Agent Dashboard."""
import csv
import io
import json
import os

import duckdb
from fastapi import FastAPI, HTTPException, UploadFile, File, Query
from fastapi.middleware.cors import CORSMiddleware

from backend.config import get_settings
from backend.variance_engine import calculate_variances, detect_anomalies, calculate_timeseries, calculate_regional
from backend.audit import execute_logged, get_audit_entry, get_audit_log, clear_audit_log
from backend.audit_logger import insert_audit_event, query_audit_log as query_audit_trail, clear_audit_logs
from backend.sessions import (
    create_session, get_session, list_sessions, delete_session,
    session_exists, get_session_row_count,
)


def create_app(conn: duckdb.DuckDBPyConnection = None, db_path: str = None) -> FastAPI:
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

    # Per-thread connections — resolves the shared-connection concurrency bugs.
    # Tests pass an explicit db_path; production uses settings.duckdb_path.
    resolved_path = db_path or settings.duckdb_path
    app.state.db_path = resolved_path

    def db():
        """Return a per-thread DuckDB connection. Safe for concurrent access."""
        from backend.db import get_db
        return get_db(app.state.db_path)

    # ── Sessions ─────────────────────────────────────────────────────
    @app.get("/api/sessions")
    def get_sessions():
        sessions = list_sessions(db())
        for s in sessions:
            s["row_count"] = get_session_row_count(db(), s["session_id"])
        return {"sessions": sessions}

    @app.post("/api/sessions")
    async def create_new_session(body: dict):
        name = body.get("name", "Untitled Session")
        return create_session(db(), name)

    @app.delete("/api/sessions/{session_id}")
    def delete_session_endpoint(session_id: str):
        if session_id == "default":
            raise HTTPException(status_code=400, detail="Cannot delete default session")
        deleted = delete_session(db(), session_id)
        return {"deleted_rows": deleted}

    @app.get("/api/sessions/{session_id}/info")
    def session_info(session_id: str):
        s = get_session(db(), session_id)
        if s is None:
            raise HTTPException(status_code=404, detail="Session not found")
        s["row_count"] = get_session_row_count(db(), session_id)
        return s

    @app.get("/api/sessions/{session_id}/version")
    def session_version(session_id: str):
        """Cheap poll endpoint: returns row count + data hash.
        Frontend polls this every 60s; only reloads data if hash changed."""
        import hashlib
        d = db()
        s = get_session(d, session_id)
        if s is None:
            raise HTTPException(status_code=404, detail="Session not found")
        row_count = get_session_row_count(d, session_id)
        data_hash = hashlib.sha256(
            f"{session_id}|{row_count}|{s['created_at']}".encode()
        ).hexdigest()[:12]
        return {"row_count": row_count, "data_hash": data_hash, "updated_at": s["created_at"]}

    # ── Health ────────────────────────────────────────────────────────
    @app.get("/api/health")
    def health():
        return {"status": "ok", "version": "2.1.0"}

    # ── Variance ──────────────────────────────────────────────────────
    @app.get("/api/variance")
    def get_variance(session_id: str = Query("default")):
        results = calculate_variances(db(), session_id=session_id)
        return {"results": results, "count": len(results)}

    @app.get("/api/variance/{entity_id}")
    def get_variance_by_entity(entity_id: str, session_id: str = Query("default")):
        all_results = calculate_variances(db(), session_id=session_id)
        filtered = [r for r in all_results if r["entity_id"] == entity_id]
        return {"results": filtered, "count": len(filtered)}

    # ── Timeseries (T1) ─────────────────────────────────────────────
    @app.get("/api/timeseries")
    def get_timeseries(
        session_id: str = Query("default"),
        window: int = Query(3, ge=1, le=12, description="Moving average window size"),
    ):
        """Period-level aggregated variance with cumulative YTD and moving avg."""
        results = calculate_timeseries(db(), session_id=session_id, moving_avg_window=window)
        return {"results": results, "count": len(results)}

    # ── Regional / Entity-level (T1) ─────────────────────────────────
    @app.get("/api/regional")
    def get_regional(session_id: str = Query("default")):
        """Entity-level (regional) aggregated budget vs actual."""
        results = calculate_regional(db(), session_id=session_id)
        return {"results": results, "count": len(results)}

    # ── A1: Operational Audit Trail ─────────────────────────────────
    @app.get("/api/audit/trail")
    def get_audit_trail(
        session_id: str = Query("default"),
        limit: int = Query(50, ge=1, le=200),
        offset: int = Query(0, ge=0),
        search: str = Query(None),
        category: str = Query(None),
    ):
        """Query operational audit log with optional search and category filter."""
        entries, total = query_audit_trail(
            db(), session_id=session_id,
            limit=limit, offset=offset,
            search=search, category=category,
        )
        return {"entries": entries, "count": total}

    # ── Anomalies ─────────────────────────────────────────────────────
    @app.get("/api/anomalies")
    def get_anomalies(
        threshold_pct: float = Query(default=None),
        session_id: str = Query("default"),
    ):
        threshold = threshold_pct if threshold_pct is not None else settings.anomaly_threshold_pct
        results = detect_anomalies(db(), threshold_pct=threshold, session_id=session_id)
        return {"results": results, "count": len(results), "threshold_pct": threshold}

    # ── Summary ───────────────────────────────────────────────────────
    @app.get("/api/summary")
    def get_summary(session_id: str = Query("default")):
        d = db()
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
        results, calc_ref = execute_logged(d, sql, params={"session_id": session_id})
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
        d = db()
        content = await file.read()
        text = content.decode("utf-8")
        reader = csv.DictReader(io.StringIO(text))

        required_basic = {"entity_id", "account_id", "period_id", "scenario", "amount"}
        if not required_basic.issubset(set(reader.fieldnames or [])):
            raise HTTPException(status_code=400, detail="CSV must have columns: entity_id, account_id, period_id, scenario, amount")

        rows = list(reader)
        if not rows:
            raise HTTPException(status_code=400, detail="CSV has no data rows")

        # ── Account type inference from account_id ─────────────────
        def infer_account_type(account_id: str) -> str:
            """Classify an account as revenue or expense by matching keywords
            in the account_id string (case-insensitive)."""
            aid_lower = account_id.lower()
            if any(kw in aid_lower for kw in ("revenue", "sales", "income")):
                return "revenue"
            if any(kw in aid_lower for kw in ("cost", "fee", "expense", "salary", "payroll", "rent", "util")):
                return "expense"
            # Default: treat unknown accounts as expense (conservative)
            return "expense"

        has_metadata = "account_name" in reader.fieldnames
        data = []
        for r in rows:
            row = (
                r["entity_id"], r["account_id"], r["period_id"],
                r["scenario"], float(r["amount"]), session_id
            )
            data.append(row)

        entities = {d[0] for d in data}
        accounts = {d[1] for d in data}
        periods = {d[2] for d in data}

        for eid in entities:
            exists = d.execute("SELECT COUNT(*) FROM entities WHERE entity_id = ?", [eid]).fetchone()[0]
            if exists == 0:
                d.execute("INSERT INTO entities VALUES (?, ?)", [eid, eid])

        if has_metadata:
            account_meta = {}
            for r in rows:
                aid = r["account_id"]
                if aid not in account_meta:
                    explicit_type = r.get("account_type", "").strip().lower()
                    account_meta[aid] = {
                        "name": r.get("account_name", aid),
                        "type": explicit_type if explicit_type in ("revenue", "expense")
                                else infer_account_type(aid),
                        "category": r.get("category", "Uncategorized"),
                    }
            for aid, meta in account_meta.items():
                exists = d.execute("SELECT COUNT(*) FROM accounts WHERE account_id = ?", [aid]).fetchone()[0]
                if exists == 0:
                    d.execute(
                        "INSERT INTO accounts VALUES (?, ?, ?, ?)",
                        [aid, meta["name"], meta["type"], meta["category"]]
                    )
                else:
                    d.execute(
                        "UPDATE accounts SET account_name = ?, account_type = ?, category = ? WHERE account_id = ?",
                        [meta["name"], meta["type"], meta["category"], aid]
                    )
        else:
            for aid in accounts:
                exists = d.execute("SELECT COUNT(*) FROM accounts WHERE account_id = ?", [aid]).fetchone()[0]
                if exists == 0:
                    atype = infer_account_type(aid)
                    d.execute(
                        "INSERT INTO accounts VALUES (?, ?, ?, 'Uncategorized')", [aid, aid, atype]
                    )
                else:
                    # Update existing account type if it was previously misclassified
                    atype = infer_account_type(aid)
                    d.execute(
                        "UPDATE accounts SET account_type = ? WHERE account_id = ?",
                        [atype, aid]
                    )

        for pid in periods:
            exists = d.execute("SELECT COUNT(*) FROM periods WHERE period_id = ?", [pid]).fetchone()[0]
            if exists == 0:
                d.execute("INSERT INTO periods VALUES (?, 2024, 1, ?)", [pid, pid])

        try:
            d.executemany(
                "INSERT INTO budget_actuals (entity_id, account_id, period_id, scenario, amount, session_id) VALUES (?, ?, ?, ?, ?, ?)",
                data
            )
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Insert failed: {str(e)}")

        from fastapi import Response
        d.execute(
            "INSERT INTO uploaded_files (file_id, session_id, filename, row_count, uploaded_at) "
            "VALUES (nextval('seq_uploaded_files'), ?, ?, ?, CURRENT_TIMESTAMP)",
            [session_id, file.filename, len(data)]
        )

        # A2.1: Audit event — data ingestion
        budget_total = sum(d[4] for d in data if d[3] == 'budget')
        actual_total = sum(d[4] for d in data if d[3] == 'actual')
        insert_audit_event(
            d, session_id, 'DATA_INGESTION',
            f"File \"{file.filename}\" processed successfully. Ingested {len(data)} rows.",
            {
                "filename": file.filename,
                "rows_ingested": len(data),
                "total_budget": round(budget_total, 2),
                "total_actual": round(actual_total, 2),
                "entities_created": len(entities),
                "accounts_created": len(accounts),
            }
        )

        # A2.3: Mutation-driven anomaly detection — only after upload
        new_anomalies = detect_anomalies(d, session_id=session_id)
        logged_rows = d.execute(
            "SELECT json_extract_string(metadata, '$.entity_id'), json_extract_string(metadata, '$.account_name'), json_extract_string(metadata, '$.period_id') FROM audit_logs WHERE session_id = ? AND event_category = 'ANOMALY_DETECTION'",
            [session_id]
        ).fetchall()
        logged = set(
            (r[0] or "", r[1] or "", r[2] or "") for r in logged_rows
        )
        for a in new_anomalies:
            key = (a["entity_id"], a["account_name"], a["period_id"])
            if key not in logged:
                insert_audit_event(
                    d, session_id, 'ANOMALY_DETECTION',
                    f"Anomaly detected for {a['entity_id']} - {a['account_name']}",
                    {
                        "entity_id": a["entity_id"],
                        "account_name": a["account_name"],
                        "period_id": a["period_id"],
                        "variance_pct": a["variance_pct"],
                        "variance_amount": a["variance_amount"],
                        "threshold_pct": 10.0,
                    }
                )

        return Response(
            content=json.dumps({"rows_inserted": len(data), "filename": file.filename, "session_id": session_id}),
            status_code=201,
            media_type="application/json"
        )

    # ── Data Viewer (per session) ─────────────────────────────────────
    @app.get("/api/data/{session_id}")
    def get_session_data(session_id: str):
        d = db()
        sql = """
        SELECT ba.entity_id, ba.account_id, a.account_name, a.account_type,
               a.category, ba.period_id, ba.scenario, ba.amount
        FROM budget_actuals ba
        LEFT JOIN accounts a ON ba.account_id = a.account_id
        WHERE ba.session_id = ?
        ORDER BY ba.entity_id, ba.period_id, ba.account_id, ba.scenario
        """
        rows = d.execute(sql, [session_id]).fetchall()
        cols = [c[0] for c in d.description]
        results = [dict(zip(cols, row)) for row in rows]

        files = d.execute(
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
        d = db()
        count = d.execute(
            "SELECT COUNT(*) FROM budget_actuals WHERE session_id = ?", [session_id]
        ).fetchone()[0]
        d.execute("DELETE FROM budget_actuals WHERE session_id = ?", [session_id])
        return {"deleted": count}

    # ── Audit ─────────────────────────────────────────────────────────
    @app.get("/api/audit/log")
    def audit_log(limit: int = Query(50, ge=1, le=500), offset: int = Query(0, ge=0)):
        entries = get_audit_log(db(), limit=limit, offset=offset)
        return {"entries": entries, "count": len(entries)}

    @app.get("/api/audit/{result_ref}")
    def audit_entry(result_ref: str):
        entry = get_audit_entry(db(), result_ref)
        if entry is None:
            raise HTTPException(status_code=404, detail="Audit entry not found")
        return entry

    @app.post("/api/audit/clear")
    def clear_audit():
        deleted = clear_audit_log(db())
        return {"deleted": deleted}

    # ── Q3: AI History ───────────────────────────────────────────────
    @app.get("/api/ai/history")
    def get_ai_history(
        session_id: str = Query("default"),
        limit: int = Query(50, ge=1, le=200),
        offset: int = Query(0, ge=0),
    ):
        """Get AI conversation history for a session."""
        from backend.ai_history import get_ai_history as fetch_ai_history
        entries, total = fetch_ai_history(db(), session_id=session_id, limit=limit, offset=offset)
        return {"entries": entries, "count": total}

    # ── LLM ───────────────────────────────────────────────────────────
    @app.post("/api/ask")
    async def ask(body: dict, session_id: str = Query("default")):
        from backend.llm import ask_question
        question = body.get("question", "")
        if not question.strip():
            raise HTTPException(status_code=400, detail="Question is required")
        try:
            result = await ask_question(question, db(), session_id)
            # Q3.1: Save to history
            from backend.ai_history import save_ai_interaction
            save_ai_interaction(db(), session_id, "question", question, str(result.get("results", [])))
            return result
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"LLM error: {str(e)}")

    @app.post("/api/memo")
    async def memo(session_id: str = Query("default")):
        from backend.llm import generate_memo
        d = db()
        try:
            memo_text = await generate_memo(d, session_id=session_id)
            # Q3.1: Save to history
            from backend.ai_history import save_ai_interaction
            save_ai_interaction(d, session_id, "memo", "Generate variance memo", memo_text)
            return {"memo": memo_text, "calc_ref": None}
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Memo generation error: {str(e)}")

    # ── Settings ─────────────────────────────────────────────────────
    @app.get("/api/settings")
    def get_app_settings():
        from backend.settings import get_settings_dict
        return get_settings_dict(db())

    @app.post("/api/settings")
    async def update_app_settings(body: dict):
        from backend.settings import update_setting
        d = db()
        for key, value in body.items():
            update_setting(d, key, value)
        return {"status": "ok"}

    return app
