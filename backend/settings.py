"""Settings management — stored in DuckDB, persists across restarts.
A1: Audit is now mandatory and always-on. No toggle.
Ollama config starts empty."""
import duckdb


def get_settings_dict(conn: duckdb.DuckDBPyConnection) -> dict:
    """Read Ollama settings from the settings table."""
    rows = conn.execute("SELECT key, value FROM settings").fetchall()
    settings = {}
    for key, value in rows:
        settings[key] = value
    if "ollama_base_url" not in settings:
        settings["ollama_base_url"] = ""
    if "ollama_model" not in settings:
        settings["ollama_model"] = ""
    return settings


def update_setting(conn: duckdb.DuckDBPyConnection, key: str, value: str) -> None:
    """Insert or update a single setting."""
    conn.execute(
        "INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)",
        [key, str(value)]
    )
