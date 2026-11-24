# postgres migrations

Incremental migrations applied after the baseline
(`ddl/baseline/postgres/0001_plugins_baseline.sql`). Migrations are
append-only: once a version is applied, its file bytes are immutable
(checksum integrity guard). The baseline already expresses their end state for
greenfield installs; the chain remains the upgrade path for databases
provisioned before a fold.

- `0002_plugin_artifact_sources` adds `ai_plugin.source_json`, the structured
  artifact source descriptor shared with the Skills artifact model.
- `0003_plugin_marketplace_metadata` adds localized category/plugin copy,
  media URLs, usage ranking and featured placement fields for the SDKWork
  Plugins catalog. Existing manifest `downloadsCount`/`usageCount` values seed
  the new usage counter when they are non-negative integer strings.
- `0004_plugin_marketplace_registry` adds the `marketplace_metadata_json`
  registry projection and its provider/catalog-URL indexes.
- `0005_plugin_catalog_completeness` widens the public plugin id, gives the
  registry entry its own identity and first-class facts, adds the
  `ai_plugin_install_target`, `ai_plugin_media`, and `ai_plugin_capability`
  tables, marks taxonomy provenance, and restores the two indexes 0004
  introduced that the consolidated baseline had absorbed without.
