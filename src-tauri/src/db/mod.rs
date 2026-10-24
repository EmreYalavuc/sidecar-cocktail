use rusqlite::{Connection, Result};
use std::path::Path;

pub fn open(db_path: &Path) -> Result<Connection> {
    let conn = Connection::open(db_path)?;
    conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;")?;
    migrate(&conn)?;
    Ok(conn)
}

fn migrate(conn: &Connection) -> Result<()> {
    conn.execute_batch("
        CREATE TABLE IF NOT EXISTS sessions (
            id          TEXT PRIMARY KEY,
            project_path TEXT NOT NULL,
            started_at  TEXT NOT NULL,
            ended_at    TEXT,
            tool_count  INTEGER NOT NULL DEFAULT 0,
            file_count  INTEGER NOT NULL DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS events (
            id           TEXT PRIMARY KEY,
            session_id   TEXT NOT NULL REFERENCES sessions(id),
            event_type   TEXT NOT NULL,
            tool_name    TEXT,
            tool_input   TEXT,
            tool_output  TEXT,
            working_dir  TEXT,
            file_paths   TEXT NOT NULL DEFAULT '[]',
            timestamp    TEXT NOT NULL,
            risk_level   TEXT,
            is_bookmarked INTEGER NOT NULL DEFAULT 0,
            annotation   TEXT
        );

        CREATE INDEX IF NOT EXISTS idx_events_session ON events(session_id);
        CREATE INDEX IF NOT EXISTS idx_events_ts      ON events(timestamp DESC);

        CREATE TABLE IF NOT EXISTS file_changes (
            id          TEXT PRIMARY KEY,
            session_id  TEXT NOT NULL REFERENCES sessions(id),
            event_id    TEXT REFERENCES events(id),
            file_path   TEXT NOT NULL,
            change_type TEXT NOT NULL,
            diff        TEXT,
            lines_added INTEGER NOT NULL DEFAULT 0,
            lines_removed INTEGER NOT NULL DEFAULT 0,
            confidence  TEXT NOT NULL DEFAULT 'Low',
            timestamp   TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_fc_session ON file_changes(session_id);

        CREATE TABLE IF NOT EXISTS analyses (
            id              TEXT PRIMARY KEY,
            event_id        TEXT NOT NULL REFERENCES events(id),
            session_id      TEXT NOT NULL REFERENCES sessions(id),
            mode            TEXT NOT NULL,
            provider        TEXT NOT NULL DEFAULT 'gemini',
            risk_level      TEXT,
            content         TEXT NOT NULL,
            tokens_used     INTEGER NOT NULL DEFAULT 0,
            cost_usd        REAL NOT NULL DEFAULT 0.0,
            secrets_redacted INTEGER NOT NULL DEFAULT 0,
            created_at      TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_analyses_event ON analyses(event_id);

        CREATE TABLE IF NOT EXISTS bookmarks (
            id         TEXT PRIMARY KEY,
            event_id   TEXT NOT NULL REFERENCES events(id),
            label      TEXT NOT NULL DEFAULT '',
            note       TEXT,
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS settings (
            key   TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS watch_paths (
            path     TEXT PRIMARY KEY,
            added_at TEXT NOT NULL
        );
    ")?;
    Ok(())
}
