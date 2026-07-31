"""Session management — each session is an isolated data workspace.
Uploaded data is tagged with session_id and persists across refreshes."""
import uuid
import duckdb


def create_session(conn: duckdb.DuckDBPyConnection, name: str) -> dict:
    """Create a new session and return it."""
    session_id = str(uuid.uuid4())[:8]
    conn.execute(
        "INSERT INTO sessions VALUES (?, ?, CURRENT_TIMESTAMP)",
        [session_id, name]
    )
    return get_session(conn, session_id)


def get_session(conn: duckdb.DuckDBPyConnection, session_id: str) -> dict | None:
    row = conn.execute(
        "SELECT session_id, session_name, created_at FROM sessions WHERE session_id = ?",
        [session_id]
    ).fetchone()
    if row is None:
        return None
    return {"session_id": row[0], "session_name": row[1], "created_at": str(row[2])}


def list_sessions(conn: duckdb.DuckDBPyConnection) -> list[dict]:
    rows = conn.execute(
        "SELECT session_id, session_name, created_at FROM sessions ORDER BY created_at DESC"
    ).fetchall()
    return [
        {"session_id": r[0], "session_name": r[1], "created_at": str(r[2])}
        for r in rows
    ]


def delete_session(conn: duckdb.DuckDBPyConnection, session_id: str) -> int:
    """Delete a session and all its data. Returns rows deleted."""
    count = conn.execute(
        "SELECT COUNT(*) FROM budget_actuals WHERE session_id = ?", [session_id]
    ).fetchone()[0]
    conn.execute("DELETE FROM budget_actuals WHERE session_id = ?", [session_id])
    conn.execute("DELETE FROM sessions WHERE session_id = ?", [session_id])
    return count


def session_exists(conn: duckdb.DuckDBPyConnection, session_id: str) -> bool:
    return get_session(conn, session_id) is not None


def get_session_row_count(conn: duckdb.DuckDBPyConnection, session_id: str) -> int:
    return conn.execute(
        "SELECT COUNT(*) FROM budget_actuals WHERE session_id = ?", [session_id]
    ).fetchone()[0]
