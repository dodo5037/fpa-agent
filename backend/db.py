"""DuckDB connection management and schema initialization."""
import duckdb
import os
import threading


# Per-thread connections — one DuckDB connection per OS thread to avoid
# the shared-connection concurrency bugs (conn.description races, cursor
# interference) that cause intermittent data corruption under load.
_local = threading.local()


def get_db(db_path: str = None) -> duckdb.DuckDBPyConnection:
    """Return a per-thread DuckDB connection, creating one if needed."""
    if db_path is None:
        # Default path relative to this file's project root
        db_path = os.path.join(
            os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
            "data", "fpa.duckdb"
        )

    if not hasattr(_local, 'conn') or _local.conn is None:
        parent = os.path.dirname(os.path.abspath(db_path))
        if parent and not os.path.exists(parent):
            os.makedirs(parent)
        _local.conn = duckdb.connect(db_path)
    return _local.conn


def init_db(db_path: str = None) -> duckdb.DuckDBPyConnection:
    """
    Initialize a DuckDB database with the FP&A schema.

    Args:
        db_path: Path to the DuckDB file. None or ':memory:' for in-memory DB.

    Returns:
        DuckDB connection with schema initialized.
    """
    if db_path is None:
        db_path = os.path.join(
            os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
            "data", "fpa.duckdb"
        )

    if db_path == ":memory:":
        conn = duckdb.connect(":memory:")
    else:
        parent = os.path.dirname(os.path.abspath(db_path))
        if parent and not os.path.exists(parent):
            os.makedirs(parent)
        conn = duckdb.connect(db_path)

    # Load and execute schema DDL
    schema_path = os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
        "db", "init_schema.sql"
    )
    with open(schema_path, "r") as f:
        conn.execute(f.read())

    return conn
