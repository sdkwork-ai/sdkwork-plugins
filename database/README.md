# plugins database module

Authoritative PostgreSQL module for the Plugins capability (`ai_plugin_*`
tables). Layout follows DATABASE_FRAMEWORK_SPEC.md:

- `contract/` — schema.yaml, table-registry.json, prefix-registry.json.
- `ddl/baseline/postgres/` — versioned baseline DDL (0001_plugins_baseline.sql).
- `migrations/postgres/` — incremental migrations on top of the baseline
  (`0002_plugin_artifact_sources` adds `ai_plugin.source_json`; migrations are
  append-only and immutable once applied).
- `seeds/` — `seed.manifest.json` plus `common/` and per-locale sets. The
  standard profile seeds the six agent plugin categories
  (`common/001_plugin_categories.sql`) and is enabled through `seedOnBoot`.
- `fixtures/` — test fixtures.
- `drift/policy.yaml` — drift observation policy.

## Plugin artifact source

`ai_plugin.source_json` stores the same discriminated source model used by
Skills:

| `kind` | Fields | Meaning |
| --- | --- | --- |
| `drive_file` | `driveUri`, `checksumSha256`, optional `sizeBytes` | Archive uploaded to sdkwork-drive |
| `drive_directory` | `driveUri` | Existing sdkwork-drive folder |
| `git` | `repositoryUrl`, `repositoryPath`, optional `gitRef` | Path inside an https Git repository |

The column is nullable so legacy manifest-only plugins remain valid.

Operate through the root scripts (`pnpm db:plan|migrate|seed|drift:check`).
