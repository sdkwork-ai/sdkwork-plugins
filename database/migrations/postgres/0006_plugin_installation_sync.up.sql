-- sdkwork:migration
-- id: 0006_plugin_installation_sync
-- engine: postgres
-- module: plugins
-- purpose: Persist confirmed per-user, per-Host plugin installations with the
--   complete catalog snapshot used at synchronization, and allow SDKWork-owned
--   taxonomy rows such as the default official-plugin category.
-- reversible: false
-- rollback: forward-fix (installation history and snapshots are durable data)
-- transactional: true
-- lock: lightweight
-- lock_timeout: 2s
-- statement_timeout: 30s

BEGIN;

ALTER TABLE ai_plugin_category
    DROP CONSTRAINT IF EXISTS ck_ai_plugin_category_taxonomy_source;
ALTER TABLE ai_plugin_category
    ADD CONSTRAINT ck_ai_plugin_category_taxonomy_source
    CHECK (taxonomy_source IN ('product', 'sdkwork', 'dsh-market'));

CREATE TABLE IF NOT EXISTS ai_plugin_installation (
    id BIGINT NOT NULL PRIMARY KEY,
    uuid VARCHAR(64) NOT NULL,
    tenant_id BIGINT NOT NULL,
    organization_id BIGINT NOT NULL DEFAULT 0,
    user_id BIGINT NOT NULL,
    host_id VARCHAR(128) NOT NULL,
    plugin_id BIGINT,
    plugin_key VARCHAR(128) NOT NULL,
    package_name VARCHAR(214),
    installed_version VARCHAR(64),
    install_spec TEXT,
    status VARCHAR(16) NOT NULL,
    catalog_revision VARCHAR(32),
    catalog_snapshot_json JSONB NOT NULL,
    synchronized_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    removed_at TIMESTAMPTZ,
    version BIGINT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (uuid),
    UNIQUE (tenant_id, organization_id, user_id, host_id, plugin_key),
    CONSTRAINT ck_ai_plugin_installation_host CHECK (host_id <> ''),
    CONSTRAINT ck_ai_plugin_installation_status CHECK (status IN ('installed', 'removed')),
    CONSTRAINT ck_ai_plugin_installation_snapshot CHECK (jsonb_typeof(catalog_snapshot_json) = 'object')
);

CREATE INDEX IF NOT EXISTS idx_ai_plugin_installation_host
    ON ai_plugin_installation (tenant_id, organization_id, user_id, host_id, status);

COMMIT;
