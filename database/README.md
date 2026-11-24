# plugins database module

Authoritative PostgreSQL module for the Plugins capability (`ai_plugin_*`
tables). Layout follows DATABASE_FRAMEWORK_SPEC.md:

- `contract/` — schema.yaml, table-registry.json, prefix-registry.json.
- `ddl/baseline/postgres/` — versioned baseline DDL (0001_plugins_baseline.sql).
- `migrations/postgres/` — incremental migrations on top of the baseline
  (`0002_plugin_artifact_sources` adds `ai_plugin.source_json`, and
  `0003_plugin_marketplace_metadata` adds localized catalog content, media,
  usage and featured presentation fields; migrations are append-only and
  immutable once applied).
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

## Initialization state

This module is in **initialization state** for greenfield deployments:

1. **Baseline** — `database/ddl/baseline/{engine}/0001_plugins_baseline.sql` contains the full DDL snapshot.
2. **Migrations** — `database/migrations/{engine}/` is reserved for post-GA incremental schema changes only. It is intentionally empty at initialization.
3. **Drift** — run `pnpm db:drift:check` before release.

## Commands

```bash
pnpm run db:validate
pnpm run db:materialize:contract
pnpm run db:plan
pnpm run db:init
pnpm run db:migrate
pnpm run db:seed
pnpm run db:status
pnpm run db:drift:check
```
