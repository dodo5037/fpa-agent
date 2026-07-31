-- ── FP&A Agent Dashboard — DuckDB Schema ────────────────────────────
-- Run via backend/db.py:init_db() or standalone: duckdb <db_path> < init_schema.sql

-- ── Dimension: entities ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS entities (
    entity_id   VARCHAR PRIMARY KEY,
    entity_name VARCHAR NOT NULL
);

-- ── Dimension: accounts ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS accounts (
    account_id    VARCHAR PRIMARY KEY,
    account_name  VARCHAR NOT NULL,
    account_type  VARCHAR NOT NULL CHECK (account_type IN ('revenue', 'expense')),
    category      VARCHAR
);

-- ── Dimension: periods ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS periods (
    period_id    VARCHAR PRIMARY KEY,
    fiscal_year  INTEGER NOT NULL,
    period_num   INTEGER NOT NULL,
    period_label VARCHAR NOT NULL
);

-- ── Fact: budget_actuals ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS budget_actuals (
    entity_id   VARCHAR NOT NULL,
    account_id  VARCHAR NOT NULL,
    period_id   VARCHAR NOT NULL,
    scenario    VARCHAR NOT NULL CHECK (scenario IN ('budget', 'actual')),
    amount      DECIMAL(18,2) NOT NULL,
    FOREIGN KEY (entity_id)  REFERENCES entities(entity_id),
    FOREIGN KEY (account_id) REFERENCES accounts(account_id),
    FOREIGN KEY (period_id)  REFERENCES periods(period_id)
);

-- ── Audit: calculation_log ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS calculation_log (
    log_id      INTEGER PRIMARY KEY,
    sql_query   VARCHAR NOT NULL,
    params_json VARCHAR,
    timestamp   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    result_ref  VARCHAR NOT NULL
);

-- Sequence for log_id (DuckDB SEQUENCE)
CREATE SEQUENCE IF NOT EXISTS seq_calculation_log START 1;

-- ── App Settings (key-value store) ────────────────────────────────
CREATE TABLE IF NOT EXISTS settings (
    key   VARCHAR PRIMARY KEY,
    value VARCHAR NOT NULL
);

-- Default: audit logging OFF
INSERT OR IGNORE INTO settings (key, value) VALUES ('audit_enabled', 'false');
INSERT OR IGNORE INTO settings (key, value) VALUES ('ollama_base_url', '');
INSERT OR IGNORE INTO settings (key, value) VALUES ('ollama_model', '');

-- ── Sessions (each session = a separate data workspace) ──────────
CREATE TABLE IF NOT EXISTS sessions (
    session_id  VARCHAR PRIMARY KEY,
    session_name VARCHAR NOT NULL,
    created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Add session_id column to budget_actuals (data isolated per session)
-- Using INSERT OR IGNORE pattern for idempotency
ALTER TABLE budget_actuals ADD COLUMN IF NOT EXISTS session_id VARCHAR DEFAULT 'default';
