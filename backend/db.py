"""DuckDB connection management and schema initialization."""
import duckdb
import os


def init_db(db_path: str = None) -> duckdb.DuckDBPyConnection:
    """
    Initialize a DuckDB database with the FP&A schema.

    Args:
        db_path: Path to the DuckDB file. None or ':memory:' for in-memory DB.

    Returns:
        DuckDB connection with schema initialized.
    """
    if db_path is None or db_path == ":memory:":
        conn = duckdb.connect(":memory:")
    else:
        # Ensure parent directory exists
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
