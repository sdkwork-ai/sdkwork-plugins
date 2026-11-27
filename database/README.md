# plugins database module

Authoritative PostgreSQL module for the Plugins capability (`ai_plugin_*`
tables). Layout follows DATABASE_FRAMEWORK_SPEC.md:

- `contract/` — schema.yaml, table-registry.json, prefix-registry.json.
- `ddl/baseline/postgres/` — versioned baseline DDL (0001_plugins_baseline.sql).
  The baseline expresses the end state of the whole migration chain.
- `migrations/postgres/` — incremental migrations and the upgrade path for
  databases provisioned before a baseline fold. Migrations are append-only and
  immutable once applied: `0002_plugin_artifact_sources`,
  `0003_plugin_marketplace_metadata`, `0004_plugin_marketplace_registry`,
  `0005_plugin_catalog_completeness`, `0006_plugin_installation_sync`.
- `seeds/` — `seed.manifest.json` plus `common/` and per-locale sets.
- `fixtures/` — test fixtures.
- `drift/policy.yaml` — drift observation policy.

## Tables

| Table | Role |
| --- | --- |
| `ai_plugin_category` | Plugin taxonomy. `taxonomy_source` separates the SDKWork-owned categories (`sdkwork`, including the default `official` → 官方插件 / Official plugins category) from SDKWork product categories (`product`) and the imported dsh-market categories (`dsh-market`), whose display labels arrive from the locale seed sets. |
| `ai_plugin` | One managed or cataloged plugin. Registry rows carry their own identity (`catalog_provider` + `catalog_url`), owner, package/repository facts, popularity window, deprecation, and revision; `marketplace_metadata_json` keeps the registry projection. |
| `ai_plugin_install_target` | The install targets a catalog record publishes, in the order the marketplace prefers them, with exactly one default. `target_spec` is the string the Harness plugin manager accepts (`<pkg>@<version>`, `archive+<url>`, `git+<url>.git#<ref>&path:/<dir>`). |
| `ai_plugin_media` | Icon and screenshot rows, ordered per kind. |
| `ai_plugin_capability` | Capability and red-line disclosures with their check time. |
| `ai_plugin_installation` | One confirmed Host mutation per tenant, organization, user, device (`host_id`) and plugin: the action resolved to `installed` or `removed`, the package/version/spec the Host reported, and the complete catalog snapshot used at synchronization. `PUT /app/v3/api/plugin_installations/{hostId}` writes it after the Host confirms the change, keeping rows and their snapshots identical to the catalog record the client sees. |

`ai_plugin.source_json` stores the SDKWork-owned artifact source used by the
admin forms (a Drive archive, an existing Drive directory, or a Git repository
path). It is separate from the catalog's `install_target` rows: a managed
plugin authored in the admin console is not a dsh-market catalog entry.

## dsh-market catalog snapshot

The standard seed profile includes the generated
`common/003_dsh_market_catalog.sql` — the whole public dsh-market registry
(entries, categories, install targets, media, capability disclosures, and the
`updates.json` release/commit history) plus the DeepSeek Harness official
bundles under the default `official` category — and the display sets under
`seeds/locales/{zh-CN,en-US}/`. Regenerate everything, and the recorded
snapshot, with:

```bash
node tools/import_dsh_market_catalog.mjs --input <plugins.json> --updates <updates.json>
node tools/verify_dsh_market_catalog.mjs --input <plugins.json> --updates <updates.json>
```

The source revisions, entry/child counts, and the checksums of every generated
file are recorded in `seeds/dsh-market-catalog.snapshot.json`. Identifiers are
derived from the registry's unique catalog URL, so a re-import is
order-independent and idempotent. PostgreSQL `jsonb` and text reject U+0000,
which a release body occasionally carries; the importer drops it at the SQL
boundary rather than failing the seed transaction. The registry `install` text
is kept for display only; the install target used by clients is the derived
`ai_plugin_install_target` row.

## Initialization state

This module is in **initialization state** for greenfield deployments:

1. **Baseline** — `database/ddl/baseline/{engine}/0001_plugins_baseline.sql` contains the full DDL snapshot, including the effects of migrations 0002–0006.
2. **Migrations** — `database/migrations/{engine}/` keeps that ordered chain as the upgrade path for existing databases; it is not empty by design.
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
