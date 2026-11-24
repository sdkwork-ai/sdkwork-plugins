-- sdkwork:migration
-- id: 0004_plugin_marketplace_registry
-- engine: postgres
-- module: sdkwork-plugins
-- purpose: Store a typed, lossless projection of curated dsh-market registry
--   entries without overloading the SDKWork artifact source descriptor.
-- reversible: false
-- rollback: forward-fix (catalog provenance is retained for re-projection).
-- transactional: true
-- lock: lightweight
-- lock_timeout: 2s
-- statement_timeout: 30s

BEGIN;

ALTER TABLE ai_plugin
    ADD COLUMN IF NOT EXISTS marketplace_metadata_json JSONB;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'ck_ai_plugin_marketplace_metadata'
          AND conrelid = 'ai_plugin'::regclass
    ) THEN
        ALTER TABLE ai_plugin
            ADD CONSTRAINT ck_ai_plugin_marketplace_metadata
            CHECK (marketplace_metadata_json IS NULL OR jsonb_typeof(marketplace_metadata_json) = 'object');
    END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_ai_plugin_marketplace_catalog_url
    ON ai_plugin ((marketplace_metadata_json ->> 'catalogUrl'))
    WHERE marketplace_metadata_json IS NOT NULL
      AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_ai_plugin_marketplace_provider
    ON ai_plugin ((marketplace_metadata_json ->> 'provider'), tenant_id)
    WHERE marketplace_metadata_json IS NOT NULL
      AND deleted_at IS NULL;

COMMIT;
