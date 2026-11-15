# postgres migrations

Incremental migrations applied after the baseline
(`ddl/baseline/postgres/0001_plugins_baseline.sql`). Migrations are
append-only: once a version is applied, its file bytes are immutable
(checksum integrity guard).

- `0002_plugin_artifact_sources` adds `ai_plugin.source_json`, the structured
  artifact source descriptor shared with the Skills artifact model.
