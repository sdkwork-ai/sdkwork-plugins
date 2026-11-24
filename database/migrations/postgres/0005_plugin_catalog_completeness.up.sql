-- sdkwork:migration
-- id: 0005_plugin_catalog_completeness
-- engine: postgres
-- module: plugins
-- purpose: Make the dsh-market catalog complete and installable: widen the
--   public plugin uuid, give the registry entry its own unique identity and
--   first-class facts, add the install-target, media, and capability tables,
--   localize taxonomy provenance, and repair the two indexes the consolidated
--   baseline absorbed without them.
-- reversible: false
-- rollback: forward-fix (the new columns and child tables are additive; a
--   rollback would have to drop catalog data that the seed re-creates, so the
--   canonical repair is a reviewed forward migration).
-- transactional: true
-- lock: lightweight
-- lock_timeout: 2s
-- statement_timeout: 30s

BEGIN;

-- The registry's public identifier is derived from the catalog URL release
-- slug, which exceeds the original 64-character width for long repository
-- paths. Widening keeps every existing value and removes the seed failure.
ALTER TABLE ai_plugin
    ALTER COLUMN uuid TYPE VARCHAR(128);

ALTER TABLE ai_plugin
    ADD COLUMN IF NOT EXISTS catalog_provider VARCHAR(32) NOT NULL DEFAULT 'sdkwork',
    ADD COLUMN IF NOT EXISTS catalog_url TEXT,
    ADD COLUMN IF NOT EXISTS catalog_page_url TEXT,
    ADD COLUMN IF NOT EXISTS owner_login VARCHAR(128),
    ADD COLUMN IF NOT EXISTS npm_package VARCHAR(214),
    ADD COLUMN IF NOT EXISTS tarball_url TEXT,
    ADD COLUMN IF NOT EXISTS repository_url TEXT,
    ADD COLUMN IF NOT EXISTS repository_path TEXT,
    ADD COLUMN IF NOT EXISTS repository_ref VARCHAR(128),
    ADD COLUMN IF NOT EXISTS registry_version VARCHAR(64),
    ADD COLUMN IF NOT EXISTS added_on DATE,
    ADD COLUMN IF NOT EXISTS stars_count BIGINT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS stars_checked_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS downloads_count BIGINT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS downloads_start DATE,
    ADD COLUMN IF NOT EXISTS downloads_end DATE,
    ADD COLUMN IF NOT EXISTS downloads_checked_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS is_deprecated BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS replaced_by_catalog_url TEXT,
    ADD COLUMN IF NOT EXISTS catalog_revision VARCHAR(32);

ALTER TABLE ai_plugin_category
    ADD COLUMN IF NOT EXISTS taxonomy_source VARCHAR(32) NOT NULL DEFAULT 'product';

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'ck_ai_plugin_catalog_provider' AND conrelid = 'ai_plugin'::regclass
    ) THEN
        ALTER TABLE ai_plugin
            ADD CONSTRAINT ck_ai_plugin_catalog_provider
            CHECK (catalog_provider <> '');
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'ck_ai_plugin_stars_count_nonnegative' AND conrelid = 'ai_plugin'::regclass
    ) THEN
        ALTER TABLE ai_plugin
            ADD CONSTRAINT ck_ai_plugin_stars_count_nonnegative CHECK (stars_count >= 0);
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'ck_ai_plugin_downloads_count_nonnegative' AND conrelid = 'ai_plugin'::regclass
    ) THEN
        ALTER TABLE ai_plugin
            ADD CONSTRAINT ck_ai_plugin_downloads_count_nonnegative CHECK (downloads_count >= 0);
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'ck_ai_plugin_category_taxonomy_source' AND conrelid = 'ai_plugin_category'::regclass
    ) THEN
        ALTER TABLE ai_plugin_category
            ADD CONSTRAINT ck_ai_plugin_category_taxonomy_source
            CHECK (taxonomy_source IN ('product', 'dsh-market'));
    END IF;
END
$$;

-- One registry entry is identified by its provider and catalog URL. This is
-- the boundary DB051 asks for and makes a re-import order-independent.
CREATE UNIQUE INDEX IF NOT EXISTS uq_ai_plugin_catalog_entry
    ON ai_plugin (tenant_id, catalog_provider, catalog_url)
    WHERE catalog_url IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_ai_plugin_catalog_deprecated
    ON ai_plugin (tenant_id, is_deprecated)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_ai_plugin_catalog_added
    ON ai_plugin (tenant_id, added_on DESC)
    WHERE catalog_url IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_ai_plugin_catalog_downloads
    ON ai_plugin (tenant_id, downloads_count DESC)
    WHERE catalog_url IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_ai_plugin_catalog_stars
    ON ai_plugin (tenant_id, stars_count DESC)
    WHERE catalog_url IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_ai_plugin_category_taxonomy
    ON ai_plugin_category (tenant_id, taxonomy_source, sort_order);

-- The indexes 0004 introduced were absorbed into the consolidated baseline
-- without them, so a fresh install and an upgraded install differed.
CREATE INDEX IF NOT EXISTS idx_ai_plugin_marketplace_catalog_url
    ON ai_plugin ((marketplace_metadata_json ->> 'catalogUrl'))
    WHERE marketplace_metadata_json IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ai_plugin_marketplace_provider
    ON ai_plugin ((marketplace_metadata_json ->> 'provider'))
    WHERE marketplace_metadata_json IS NOT NULL;

CREATE TABLE IF NOT EXISTS ai_plugin_install_target (
    id BIGINT NOT NULL PRIMARY KEY,
    uuid VARCHAR(64) NOT NULL,
    tenant_id BIGINT NOT NULL,
    organization_id BIGINT NOT NULL DEFAULT 0,
    plugin_id BIGINT NOT NULL,
    target_kind VARCHAR(16) NOT NULL,
    target_spec TEXT NOT NULL,
    package_name VARCHAR(214),
    package_version VARCHAR(64),
    is_default BOOLEAN NOT NULL DEFAULT FALSE,
    source_priority INTEGER NOT NULL DEFAULT 0,
    verified_at TIMESTAMPTZ,
    lifecycle_status SMALLINT NOT NULL DEFAULT 1,
    version BIGINT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by BIGINT NOT NULL DEFAULT 0,
    updated_by BIGINT NOT NULL DEFAULT 0,
    deleted_at TIMESTAMPTZ,
    UNIQUE (uuid),
    UNIQUE (tenant_id, plugin_id, target_kind, target_spec),
    CONSTRAINT ck_ai_plugin_install_target_kind
        CHECK (target_kind IN ('registry', 'archive', 'git', 'path', 'drive')),
    CONSTRAINT ck_ai_plugin_install_target_spec
        CHECK (target_spec <> '')
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_ai_plugin_install_target_default
    ON ai_plugin_install_target (tenant_id, plugin_id)
    WHERE is_default AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_ai_plugin_install_target_plugin
    ON ai_plugin_install_target (tenant_id, plugin_id, source_priority)
    WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS ai_plugin_media (
    id BIGINT NOT NULL PRIMARY KEY,
    uuid VARCHAR(64) NOT NULL,
    tenant_id BIGINT NOT NULL,
    organization_id BIGINT NOT NULL DEFAULT 0,
    plugin_id BIGINT NOT NULL,
    media_kind VARCHAR(16) NOT NULL,
    url TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    mime_type VARCHAR(128),
    width INTEGER,
    height INTEGER,
    source_url TEXT,
    lifecycle_status SMALLINT NOT NULL DEFAULT 1,
    version BIGINT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by BIGINT NOT NULL DEFAULT 0,
    updated_by BIGINT NOT NULL DEFAULT 0,
    deleted_at TIMESTAMPTZ,
    UNIQUE (uuid),
    UNIQUE (tenant_id, plugin_id, media_kind, sort_order),
    CONSTRAINT ck_ai_plugin_media_kind
        CHECK (media_kind IN ('icon', 'screenshot', 'featured', 'cover')),
    CONSTRAINT ck_ai_plugin_media_url
        CHECK (url <> '')
);

CREATE INDEX IF NOT EXISTS idx_ai_plugin_media_plugin
    ON ai_plugin_media (tenant_id, plugin_id, media_kind, sort_order)
    WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS ai_plugin_capability (
    id BIGINT NOT NULL PRIMARY KEY,
    uuid VARCHAR(64) NOT NULL,
    tenant_id BIGINT NOT NULL,
    organization_id BIGINT NOT NULL DEFAULT 0,
    plugin_id BIGINT NOT NULL,
    disclosure_kind VARCHAR(16) NOT NULL DEFAULT 'capability',
    capability_code VARCHAR(255) NOT NULL,
    checked_at TIMESTAMPTZ,
    sort_order INTEGER NOT NULL DEFAULT 0,
    lifecycle_status SMALLINT NOT NULL DEFAULT 1,
    version BIGINT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by BIGINT NOT NULL DEFAULT 0,
    updated_by BIGINT NOT NULL DEFAULT 0,
    deleted_at TIMESTAMPTZ,
    UNIQUE (uuid),
    UNIQUE (tenant_id, plugin_id, disclosure_kind, capability_code),
    CONSTRAINT ck_ai_plugin_capability_kind
        CHECK (disclosure_kind IN ('capability', 'red_line')),
    CONSTRAINT ck_ai_plugin_capability_code
        CHECK (capability_code <> '')
);

CREATE INDEX IF NOT EXISTS idx_ai_plugin_capability_plugin
    ON ai_plugin_capability (tenant_id, plugin_id, disclosure_kind, sort_order)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_ai_plugin_capability_code
    ON ai_plugin_capability (tenant_id, disclosure_kind, capability_code)
    WHERE deleted_at IS NULL;

-- Existing catalog rows predate the first-class columns; project what the
-- stored registry metadata already holds so an upgrade loses nothing.
UPDATE ai_plugin
SET catalog_provider = 'dsh-market',
    catalog_url = COALESCE(catalog_url, marketplace_metadata_json ->> 'catalogUrl'),
    catalog_page_url = COALESCE(catalog_page_url, marketplace_metadata_json ->> 'pageUrl'),
    owner_login = COALESCE(owner_login, marketplace_metadata_json ->> 'owner'),
    npm_package = COALESCE(npm_package, marketplace_metadata_json ->> 'npmPackage'),
    tarball_url = COALESCE(tarball_url, marketplace_metadata_json ->> 'tarballUrl'),
    repository_url = COALESCE(repository_url, marketplace_metadata_json ->> 'repositoryUrl'),
    repository_path = COALESCE(repository_path, marketplace_metadata_json ->> 'repositoryPath'),
    repository_ref = COALESCE(repository_ref, marketplace_metadata_json ->> 'repositoryRef'),
    registry_version = COALESCE(registry_version, marketplace_metadata_json ->> 'version'),
    downloads_count = CASE
        WHEN downloads_count = 0 AND COALESCE(marketplace_metadata_json ->> 'downloads', '') ~ '^[0-9]+$'
            THEN (marketplace_metadata_json ->> 'downloads')::NUMERIC::BIGINT
        ELSE downloads_count
    END,
    stars_count = CASE
        WHEN stars_count = 0 AND COALESCE(marketplace_metadata_json ->> 'stars', '') ~ '^[0-9]+$'
            THEN (marketplace_metadata_json ->> 'stars')::NUMERIC::BIGINT
        ELSE stars_count
    END,
    is_deprecated = CASE
        WHEN marketplace_metadata_json ->> 'deprecated' = 'true' THEN TRUE
        ELSE is_deprecated
    END,
    replaced_by_catalog_url = COALESCE(replaced_by_catalog_url, marketplace_metadata_json ->> 'replacement'),
    catalog_revision = COALESCE(catalog_revision, marketplace_metadata_json ->> 'catalogRevision')
WHERE catalog_url IS NULL
  AND (marketplace_metadata_json ->> 'provider') = 'dsh-market';

COMMIT;
