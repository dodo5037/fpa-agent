"""Settings management — stored in DuckDB, persists across restarts.
Audit logging defaults to OFF. Ollama config starts empty."""
import json
import duckdb


def get_settings_dict(conn: duckdb.DuckDBPyConnection) -> dict:
    """Read all settings from the settings table."""
    rows = conn.execute("SELECT key, value FROM settings").fetchall()
    settings = {}
    for key, value in rows:
        if key == "audit_enabled":
            settings[key] = value == "true"
        else:
            settings[key] = value
    # Defaults
    if "audit_enabled" not in settings:
        settings["audit_enabled"] = False
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


def is_audit_enabled(conn: duckdb.DuckDBPyConnection) -> bool:
    """Quick check if audit logging is currently enabled."""
    return get_settings_dict(conn).get("audit_enabled", False)
