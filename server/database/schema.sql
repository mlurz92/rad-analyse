-- Haupttabelle für Untersuchungen
CREATE TABLE IF NOT EXISTS studies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    modalitaet TEXT NOT NULL,
    studiendatum DATETIME NOT NULL,
    studienbeschreibung TEXT,
    anfragename TEXT,
    institution TEXT NOT NULL,
    anfragende_abteilung TEXT,
    anfragender_arzt TEXT,
    ueberweiser TEXT,
    befundverfasser TEXT,
    patientengeschlecht TEXT CHECK(patientengeschlecht IN ('M', 'F', 'D')) NOT NULL,
    patientenalter TEXT CHECK(patientenalter LIKE '%Y') NOT NULL,
    diagnose TEXT,
    untersuchungsstatus TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Indizes für häufig verwendete Spalten
CREATE INDEX IF NOT EXISTS idx_studiendatum ON studies(studiendatum);
CREATE INDEX IF NOT EXISTS idx_modalitaet ON studies(modalitaet);
CREATE INDEX IF NOT EXISTS idx_institution ON studies(institution);
CREATE INDEX IF NOT EXISTS idx_untersuchungsstatus ON studies(untersuchungsstatus);
CREATE INDEX IF NOT EXISTS idx_patientengeschlecht ON studies(patientengeschlecht);
CREATE INDEX IF NOT EXISTS idx_combined_date_status ON studies(studiendatum, untersuchungsstatus);

-- Trigger für automatische Aktualisierung von updated_at
CREATE TRIGGER IF NOT EXISTS update_studies_timestamp 
AFTER UPDATE ON studies
BEGIN
    UPDATE studies SET updated_at = CURRENT_TIMESTAMP
    WHERE id = OLD.id;
END;

-- View für häufig benötigte Statistiken
CREATE VIEW IF NOT EXISTS studies_statistics AS
SELECT 
    strftime('%Y-%m', studiendatum) as month,
    modalitaet,
    institution,
    COUNT(*) as count,
    COUNT(DISTINCT patientengeschlecht) as unique_patients,
    COUNT(CASE WHEN diagnose != '' AND diagnose IS NOT NULL THEN 1 END) as with_diagnosis,
    COUNT(CASE WHEN untersuchungsstatus = 'Freigegeben' THEN 1 END) as completed
FROM studies
GROUP BY 
    strftime('%Y-%m', studiendatum),
    modalitaet,
    institution;

-- Materialized View für Performance (wird durch Trigger aktualisiert)
CREATE TABLE IF NOT EXISTS studies_statistics_materialized AS
SELECT * FROM studies_statistics;

-- Trigger für die Aktualisierung der materialisierten View
CREATE TRIGGER IF NOT EXISTS update_statistics_materialized
AFTER INSERT ON studies
BEGIN
    DELETE FROM studies_statistics_materialized;
    INSERT INTO studies_statistics_materialized
    SELECT * FROM studies_statistics;
END;

-- Indizes für die materialisierte View
CREATE INDEX IF NOT EXISTS idx_stats_month ON studies_statistics_materialized(month);
CREATE INDEX IF NOT EXISTS idx_stats_modalitaet ON studies_statistics_materialized(modalitaet);
CREATE INDEX IF NOT EXISTS idx_stats_institution ON studies_statistics_materialized(institution);

-- Funktion für Volltext-Suche
CREATE VIRTUAL TABLE IF NOT EXISTS studies_fts USING fts5(
    studienbeschreibung,
    anfragename,
    diagnose,
    content='studies',
    content_rowid='id'
);

-- Trigger für Volltext-Suche
CREATE TRIGGER IF NOT EXISTS studies_ai AFTER INSERT ON studies BEGIN
    INSERT INTO studies_fts(rowid, studienbeschreibung, anfragename, diagnose)
    VALUES (new.id, new.studienbeschreibung, new.anfragename, new.diagnose);
END;

CREATE TRIGGER IF NOT EXISTS studies_ad AFTER DELETE ON studies BEGIN
    INSERT INTO studies_fts(studies_fts, rowid, studienbeschreibung, anfragename, diagnose)
    VALUES('delete', old.id, old.studienbeschreibung, old.anfragename, old.diagnose);
END;

CREATE TRIGGER IF NOT EXISTS studies_au AFTER UPDATE ON studies BEGIN
    INSERT INTO studies_fts(studies_fts, rowid, studienbeschreibung, anfragename, diagnose)
    VALUES('delete', old.id, old.studienbeschreibung, old.anfragename, old.diagnose);
    INSERT INTO studies_fts(rowid, studienbeschreibung, anfragename, diagnose)
    VALUES (new.id, new.studienbeschreibung, new.anfragename, new.diagnose);
END;

-- Aufräumen-Funktion für alte Einträge
CREATE TRIGGER IF NOT EXISTS cleanup_old_studies
AFTER INSERT ON studies
WHEN (SELECT COUNT(*) FROM studies) > 1000000
BEGIN
    DELETE FROM studies 
    WHERE id IN (
        SELECT id FROM studies 
        ORDER BY studiendatum ASC 
        LIMIT 100
    );
END;

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
