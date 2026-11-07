-- Plugins module baseline DDL (postgres) — contract v1.0.0

CREATE TABLE IF NOT EXISTS ai_plugin_category (
    id BIGINT NOT NULL PRIMARY KEY,
    uuid VARCHAR(64) NOT NULL,
    tenant_id BIGINT NOT NULL,
    organization_id BIGINT NOT NULL DEFAULT 0,
    category_code VARCHAR(128) NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    lifecycle_status SMALLINT NOT NULL DEFAULT 1,
    version BIGINT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by BIGINT NOT NULL DEFAULT 0,
    updated_by BIGINT NOT NULL DEFAULT 0,
    deleted_at TIMESTAMPTZ,
    UNIQUE (uuid),
    UNIQUE (tenant_id, category_code)
);

CREATE TABLE IF NOT EXISTS ai_plugin (
    id BIGINT NOT NULL PRIMARY KEY,
    uuid VARCHAR(64) NOT NULL,
    tenant_id BIGINT NOT NULL,
    organization_id BIGINT NOT NULL DEFAULT 0,
    owner_user_id BIGINT NOT NULL DEFAULT 0,
    plugin_key VARCHAR(128) NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    category_id BIGINT,
    category_code VARCHAR(128),
    version_label VARCHAR(64) NOT NULL DEFAULT '0.0.1',
    provider VARCHAR(128),
    implementation_type VARCHAR(64) NOT NULL DEFAULT 'sdkwork-native',
    visibility VARCHAR(32) NOT NULL DEFAULT 'tenant',
    manifest_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    install_status VARCHAR(32) NOT NULL DEFAULT 'available',
    lifecycle_status SMALLINT NOT NULL DEFAULT 1,
    tags_json JSONB NOT NULL DEFAULT '[]'::jsonb,
    allowed_role_codes_json JSONB NOT NULL DEFAULT '[]'::jsonb,
    version BIGINT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by BIGINT NOT NULL DEFAULT 0,
    updated_by BIGINT NOT NULL DEFAULT 0,
    deleted_at TIMESTAMPTZ,
    UNIQUE (uuid),
    UNIQUE (tenant_id, plugin_key)
);

CREATE INDEX IF NOT EXISTS idx_ai_plugin_category_tenant
    ON ai_plugin_category (tenant_id, lifecycle_status);
CREATE INDEX IF NOT EXISTS idx_ai_plugin_tenant
    ON ai_plugin (tenant_id, lifecycle_status);
CREATE INDEX IF NOT EXISTS idx_ai_plugin_category_ref
    ON ai_plugin (tenant_id, category_id);
