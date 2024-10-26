-- Migration 001: Initiale Struktur
-- Bereits in schema.sql enthalten

-- Migration 002: Zusätzliche Indizes für häufige Abfragen
CREATE INDEX IF NOT EXISTS idx_institution_date ON studies(institution, studiendatum);
CREATE INDEX IF NOT EXISTS idx_status_date ON studies(untersuchungsstatus, studiendatum);
CREATE INDEX IF NOT EXISTS idx_modalitaet_date ON studies(modalitaet, studiendatum);

-- Migration 003: Erweiterung für Statistiken
CREATE TABLE IF NOT EXISTS studies_daily_stats (
    date TEXT NOT NULL,
    total_studies INTEGER NOT NULL,
    completed_studies INTEGER NOT NULL,
    unique_institutions INTEGER NOT NULL,
    most_common_modalitaet TEXT,
    avg_age REAL,
    PRIMARY KEY (date)
);

-- Migration 004: Trigger für tägliche Statistiken
CREATE TRIGGER IF NOT EXISTS update_daily_stats
AFTER INSERT ON studies
BEGIN
    INSERT OR REPLACE INTO studies_daily_stats (
        date,
        total_studies,
        completed_studies,
        unique_institutions,
        most_common_modalitaet,
        avg_age
    )
    SELECT 
        date(NEW.studiendatum) as date,
        COUNT(*) as total_studies,
        SUM(CASE WHEN untersuchungsstatus = 'Freigegeben' THEN 1 ELSE 0 END) as completed_studies,
        COUNT(DISTINCT institution) as unique_institutions,
        (
            SELECT modalitaet
            FROM studies s2
            WHERE date(s2.studiendatum) = date(NEW.studiendatum)
            GROUP BY modalitaet
            ORDER BY COUNT(*) DESC
            LIMIT 1
        ) as most_common_modalitaet,
        AVG(CAST(REPLACE(patientenalter, 'Y', '') AS INTEGER)) as avg_age
    FROM studies
    WHERE date(studiendatum) = date(NEW.studiendatum)
    GROUP BY date(studiendatum);
END;

-- Migration 005: Performance-Optimierungen
CREATE INDEX IF NOT EXISTS idx_daily_stats_date ON studies_daily_stats(date);
CREATE INDEX IF NOT EXISTS idx_created_at ON studies(created_at);
CREATE INDEX IF NOT EXISTS idx_updated_at ON studies(updated_at);

-- Migration 006: Wartungsoptimierungen
CREATE TRIGGER IF NOT EXISTS cleanup_old_stats
    AFTER INSERT ON studies_daily_stats
    WHEN (SELECT COUNT(*) FROM studies_daily_stats) > 730 -- 2 Jahre
BEGIN
    DELETE FROM studies_daily_stats 
    WHERE date IN (
        SELECT date FROM studies_daily_stats 
        ORDER BY date ASC 
        LIMIT 1
    );
END;

-- Migration 007: Automatische Backup-Trigger
-- Hinzufügen der Tabelle admin_notifications
CREATE TABLE IF NOT EXISTS admin_notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL,
    message TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TRIGGER IF NOT EXISTS backup_reminder
    AFTER INSERT ON studies
    WHEN (SELECT COUNT(*) FROM studies WHERE date(created_at) = date('now')) > 1000
BEGIN
    INSERT INTO admin_notifications (
        type,
        message,
        created_at
    ) VALUES (
        'backup_needed',
        'Mehr als 1000 neue Einträge heute - Backup empfohlen',
        CURRENT_TIMESTAMP
    );
END;

-- Migration 008: Erstellung der Tabelle admin_notifications

-- Migration 009: Weitere Optimierungen (falls benötigt)

-- Integrität sicherstellen
PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA temp_store = MEMORY;
PRAGMA mmap_size = 30000000000;
PRAGMA cache_size = -2000000; -- Etwa 2GB Cache
PRAGMA busy_timeout = 5000;

-- Initiale Optimierung
ANALYZE;
VACUUM;