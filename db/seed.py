"""Seed DuckDB with sample budget-vs-actuals data for development and testing."""
import duckdb
import random


def load_seed_data(conn: duckdb.DuckDBPyConnection) -> None:
    """
    Populate dimension and fact tables with realistic sample data.

    Data shape:
      - 2 entities (North Division, South Division)
      - 8 accounts (4 revenue, 4 expense)
      - 12 periods (FY2024 Jan-Dec)
      - ~384 fact rows (2 entities × 8 accounts × 12 periods × 2 scenarios)
    """
    random.seed(42)

    # ── Entities ──────────────────────────────────────────────────
    entities = [
        ("E001", "North Division"),
        ("E002", "South Division"),
    ]
    conn.executemany(
        "INSERT INTO entities VALUES (?, ?)", entities
    )

    # ── Accounts ──────────────────────────────────────────────────
    accounts = [
        ("R001", "Product Revenue",      "revenue", "Revenue"),
        ("R002", "Service Revenue",      "revenue", "Revenue"),
        ("R003", "Licensing Revenue",    "revenue", "Revenue"),
        ("R004", "Other Income",         "revenue", "Revenue"),
        ("E001", "Salaries & Benefits",  "expense", "Personnel"),
        ("E002", "Office & Facilities",  "expense", "Operations"),
        ("E003", "Marketing & Ads",      "expense", "Operations"),
        ("E004", "IT & Software",        "expense", "Technology"),
    ]
    conn.executemany(
        "INSERT INTO accounts VALUES (?, ?, ?, ?)", accounts
    )

    # ── Periods (FY2024 Jan-Dec) ──────────────────────────────────
    periods = []
    for month in range(1, 13):
        pid = f"2024-{month:02d}"
        label = f"FY2024 {['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][month-1]}"
        periods.append((pid, 2024, month, label))
    conn.executemany(
        "INSERT INTO periods VALUES (?, ?, ?, ?)", periods
    )

    # ── Budget & Actuals ──────────────────────────────────────────
    # Base monthly amounts per account (budget)
    base_amounts = {
        "R001": 500000, "R002": 200000, "R003": 100000, "R004": 50000,
        "E001": 280000, "E002": 80000,  "E003": 60000,  "E004": 45000,
    }

    fact_rows = []
    for entity_id, _ in entities:
        for account_id, _, account_type, _ in accounts:
            for period_id, _, _, _ in periods:
                base = base_amounts[account_id]
                # Budget: base + small seasonal variation
                budget_amt = round(base * (1 + 0.05 * random.gauss(0, 1)), 2)
                # Actual: budget + variance (revenue tends slightly under, expense slightly over)
                if account_type == "revenue":
                    actual_mult = 1 + random.gauss(-0.02, 0.08)
                else:
                    actual_mult = 1 + random.gauss(0.03, 0.06)
                actual_amt = round(base * actual_mult, 2)

                fact_rows.append((entity_id, account_id, period_id, "budget", budget_amt))
                fact_rows.append((entity_id, account_id, period_id, "actual", actual_amt))

    conn.executemany(
        "INSERT INTO budget_actuals (entity_id, account_id, period_id, scenario, amount, session_id) VALUES (?, ?, ?, ?, ?, ?)",
        [(e, a, p, s, amt, "default") for (e, a, p, s, amt) in fact_rows]
    )
