"""Q3: AI conversation history — store questions, memos, and responses."""
import duckdb


def save_ai_interaction(
    conn: duckdb.DuckDBPyConnection,
    session_id: str,
    interaction_type: str,
    prompt: str,
    response_text: str,
) -> int:
    """Save an AI interaction. Returns the generated ID."""
    row = conn.execute(
        """INSERT INTO ai_history (id, session_id, type, prompt, response_text)
           VALUES (nextval('seq_ai_history'), ?, ?, ?, ?)
           RETURNING id""",
        [session_id, interaction_type, prompt, response_text],
    ).fetchone()
    return int(row[0])


def get_ai_history(
    conn: duckdb.DuckDBPyConnection,
    session_id: str,
    limit: int = 50,
    offset: int = 0,
) -> tuple[list[dict], int]:
    """Get AI interaction history for a session. Returns (entries, total)."""
    total = conn.execute(
        "SELECT COUNT(*) FROM ai_history WHERE session_id = ?",
        [session_id],
    ).fetchone()[0]

    rows = conn.execute(
        """SELECT id, session_id, type, prompt, response_text, timestamp
           FROM ai_history
           WHERE session_id = ?
           ORDER BY timestamp DESC
           LIMIT ? OFFSET ?""",
        [session_id, limit, offset],
    ).fetchall()

    entries = [
        {
            "id": r[0],
            "session_id": r[1],
            "type": r[2],
            "prompt": r[3],
            "response_text": r[4],
            "timestamp": str(r[5]),
        }
        for r in rows
    ]
    return entries, total
