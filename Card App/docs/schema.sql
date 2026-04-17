PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS catalog_cards (
    catalog_card_id TEXT PRIMARY KEY NOT NULL,
    sport TEXT NOT NULL CHECK (sport IN ('baseball', 'football', 'basketball')),
    year INTEGER NOT NULL,
    brand TEXT NOT NULL,
    set_name TEXT NOT NULL,
    subset_name TEXT,
    card_number TEXT NOT NULL,
    player_name TEXT NOT NULL,
    team_name TEXT,
    rookie_flag INTEGER NOT NULL DEFAULT 0,
    parallel TEXT,
    variation TEXT,
    search_query_override TEXT,
    notes TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_catalog_cards_lookup
    ON catalog_cards (sport, player_name, set_name, card_number);

CREATE TABLE IF NOT EXISTS scan_sessions (
    session_id TEXT PRIMARY KEY NOT NULL,
    source_type TEXT NOT NULL CHECK (source_type IN ('single_card', 'full_page')),
    source_uri TEXT,
    started_at TEXT NOT NULL,
    completed_at TEXT,
    status TEXT NOT NULL CHECK (status IN ('draft', 'processing', 'review', 'complete', 'failed')),
    notes TEXT
);

CREATE TABLE IF NOT EXISTS scan_crops (
    crop_id TEXT PRIMARY KEY NOT NULL,
    session_id TEXT NOT NULL,
    crop_index INTEGER NOT NULL,
    image_uri TEXT,
    preview_path TEXT,
    bounds_left REAL,
    bounds_top REAL,
    bounds_right REAL,
    bounds_bottom REAL,
    perspective_correction_applied INTEGER NOT NULL DEFAULT 0,
    ocr_text TEXT,
    ocr_confidence REAL,
    selected_match_catalog_card_id TEXT,
    review_status TEXT NOT NULL DEFAULT 'pending' CHECK (review_status IN ('pending', 'confirmed', 'unknown', 'rejected')),
    unknown_flag INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    FOREIGN KEY (session_id) REFERENCES scan_sessions(session_id) ON DELETE CASCADE,
    FOREIGN KEY (selected_match_catalog_card_id) REFERENCES catalog_cards(catalog_card_id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_scan_crops_session
    ON scan_crops (session_id, crop_index);

CREATE INDEX IF NOT EXISTS idx_scan_crops_review_status
    ON scan_crops (review_status);

CREATE TABLE IF NOT EXISTS crop_match_candidates (
    candidate_id TEXT PRIMARY KEY NOT NULL,
    crop_id TEXT NOT NULL,
    catalog_card_id TEXT NOT NULL,
    rank INTEGER NOT NULL,
    confidence_score REAL NOT NULL,
    match_basis TEXT NOT NULL,
    player_score REAL,
    set_score REAL,
    card_number_score REAL,
    review_outcome TEXT NOT NULL DEFAULT 'pending' CHECK (review_outcome IN ('pending', 'accepted', 'rejected')),
    created_at TEXT NOT NULL,
    FOREIGN KEY (crop_id) REFERENCES scan_crops(crop_id) ON DELETE CASCADE,
    FOREIGN KEY (catalog_card_id) REFERENCES catalog_cards(catalog_card_id) ON DELETE CASCADE,
    UNIQUE (crop_id, catalog_card_id)
);

CREATE INDEX IF NOT EXISTS idx_crop_match_candidates_crop_rank
    ON crop_match_candidates (crop_id, rank);

CREATE TABLE IF NOT EXISTS collection_cards (
    collection_card_id TEXT PRIMARY KEY NOT NULL,
    crop_id TEXT,
    catalog_card_id TEXT,
    player_name_snapshot TEXT NOT NULL,
    set_name_snapshot TEXT,
    card_number_snapshot TEXT,
    sport_snapshot TEXT,
    team_name_snapshot TEXT,
    year_snapshot INTEGER,
    image_uri TEXT,
    condition_note TEXT,
    acquired_at TEXT,
    added_at TEXT NOT NULL,
    last_price_snapshot_id TEXT,
    notes TEXT,
    FOREIGN KEY (crop_id) REFERENCES scan_crops(crop_id) ON DELETE SET NULL,
    FOREIGN KEY (catalog_card_id) REFERENCES catalog_cards(catalog_card_id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_collection_cards_catalog
    ON collection_cards (catalog_card_id);

CREATE TABLE IF NOT EXISTS price_snapshots (
    price_snapshot_id TEXT PRIMARY KEY NOT NULL,
    collection_card_id TEXT NOT NULL,
    source_name TEXT NOT NULL,
    source_listing_url TEXT,
    source_query TEXT,
    price_currency TEXT NOT NULL DEFAULT 'USD',
    price_value REAL NOT NULL,
    confidence_label TEXT NOT NULL DEFAULT 'estimate',
    observed_at TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (collection_card_id) REFERENCES collection_cards(collection_card_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_price_snapshots_collection
    ON price_snapshots (collection_card_id, observed_at DESC);

CREATE TABLE IF NOT EXISTS correction_events (
    correction_event_id TEXT PRIMARY KEY NOT NULL,
    crop_id TEXT,
    collection_card_id TEXT,
    event_type TEXT NOT NULL CHECK (event_type IN ('match_override', 'catalog_fix', 'value_override', 'manual_unknown')),
    previous_value TEXT,
    corrected_value TEXT,
    reason TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (crop_id) REFERENCES scan_crops(crop_id) ON DELETE SET NULL,
    FOREIGN KEY (collection_card_id) REFERENCES collection_cards(collection_card_id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_correction_events_created_at
    ON correction_events (created_at DESC);

CREATE TABLE IF NOT EXISTS app_settings (
    setting_key TEXT PRIMARY KEY NOT NULL,
    setting_value TEXT,
    updated_at TEXT NOT NULL
);

