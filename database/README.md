# plugins database module

Authoritative PostgreSQL module for the Plugins capability (`ai_plugin_*`
tables). Layout follows DATABASE_FRAMEWORK_SPEC.md:

- `contract/` — schema.yaml, table-registry.json, prefix-registry.json.
- `ddl/baseline/postgres/` — versioned baseline DDL (0001_plugins_baseline.sql).
- `migrations/postgres/` — incremental migrations on top of the baseline
  (empty at contract v1.0.0; migrations are append-only and immutable once
  applied).
- `seeds/` — `seed.manifest.json` plus `common/` and per-locale sets
  (empty for v1.0.0: the registry tables seed through application flows).
- `fixtures/` — test fixtures (empty at v1.0.0).
- `drift/policy.yaml` — drift observation policy.

Operate through the root scripts (`pnpm db:plan|migrate|drift:check`).
