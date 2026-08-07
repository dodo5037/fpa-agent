"""A1: Operational audit logger — mandatory, always-on event logging.

Separate from calculation_log (SQL traceability). This logs business
events: CSV uploads, data deletions, anomaly detections, system calcs.
"""
import json
import duckdb


def insert_audit_event(
    conn: duckdb.DuckDBPyConnection,
    session_id: str,
    event_category: str,
    description: str,
    metadata: dict | None = None,
) -> str:
    """Insert an audit event. Returns the generated UUID log_id."""
    meta_json = json.dumps(metadata or {}, default=str)
    row = conn.execute(
        """INSERT INTO audit_logs (session_id, event_category, description, metadata)
           VALUES (?, ?, ?, ?::JSON)
           RETURNING log_id""",
        [session_id, event_category, description, meta_json],
    ).fetchone()
    return str(row[0])


def query_audit_log(
    conn: duckdb.DuckDBPyConnection,
    session_id: str = "default",
    limit: int = 50,
    offset: int = 0,
    search: str | None = None,
    category: str | None = None,
) -> tuple[list[dict], int]:
    """Query audit events with optional search and category filter.
    Returns (entries, total_count).
    """
    conditions = ["session_id = ?"]
    params = [session_id]

    if search:
        conditions.append(
            "(LOWER(description) LIKE ? OR LOWER(metadata::VARCHAR) LIKE ?)"
        )
        like = f"%{search.lower()}%"
        params.extend([like, like])

    if category:
        conditions.append("event_category = ?")
        params.append(category)

    where = " AND ".join(conditions)

    total = conn.execute(
        f"SELECT COUNT(*) FROM audit_logs WHERE {where}", params
    ).fetchone()[0]

    rows = conn.execute(
        f"""SELECT log_id, timestamp, session_id, event_category, description, metadata
            FROM audit_logs
            WHERE {where}
            ORDER BY timestamp DESC
            LIMIT ? OFFSET ?""",
        params + [limit, offset],
    ).fetchall()

    entries = [
        {
            "log_id": str(r[0]),
            "timestamp": str(r[1]),
            "session_id": r[2],
            "event_category": r[3],
            "description": r[4],
            "metadata": json.loads(r[5]) if r[5] else {},
        }
        for r in rows
    ]

    return entries, total


def clear_audit_logs(conn: duckdb.DuckDBPyConnection, session_id: str) -> int:
    """Delete all audit events for a session. Returns count deleted."""
    count = conn.execute(
        "SELECT COUNT(*) FROM audit_logs WHERE session_id = ?",
        [session_id],
    ).fetchone()[0]
    conn.execute("DELETE FROM audit_logs WHERE session_id = ?", [session_id])
    return count
