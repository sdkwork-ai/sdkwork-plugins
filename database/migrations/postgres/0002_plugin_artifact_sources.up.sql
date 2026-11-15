-- sdkwork:migration
-- id: 0002_plugin_artifact_sources
-- engine: postgres
-- module: sdkwork-plugins
-- purpose: Add the structured plugin artifact source descriptor (Drive archive,
--   Drive directory, or Git repository) used by the plugin create/edit forms.
--   Existing manifest-only plugins keep a NULL source.
-- reversible: false
-- rollback: forward-fix (dropping source_json would discard every plugin's
--   package identity; the column is nullable so leaving it in place is safe)
-- transactional: true
-- lock: lightweight
-- lock_timeout: 2s
-- statement_timeout: 30s

BEGIN;

ALTER TABLE ai_plugin
    ADD COLUMN IF NOT EXISTS source_json JSONB;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'ck_ai_plugin_source'
    ) THEN
        ALTER TABLE ai_plugin
            ADD CONSTRAINT ck_ai_plugin_source
            CHECK (source_json IS NULL OR jsonb_typeof(source_json) = 'object');
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'ck_ai_plugin_source_kind'
    ) THEN
        ALTER TABLE ai_plugin
            ADD CONSTRAINT ck_ai_plugin_source_kind
            CHECK (source_json IS NULL OR source_json ->> 'kind' IN ('drive_file', 'drive_directory', 'git'));
    END IF;
END
$$;

COMMIT;
