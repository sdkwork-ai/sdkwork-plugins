# common seeds

Environment-independent seed scripts, applied in the order declared by
`seed.manifest.json#profiles` on `seedOnBoot` (see `database.manifest.json`).
Locale-specific display copy lives under `seeds/locales/{locale}/`.

- `001_plugin_categories.sql` seeds the SDKWork product plugin categories: code
  and development, data retrieval, document processing, database apps, image
  processing, and business apps. The inserts are idempotent and keyed by
  `(tenant_id, category_code)`.
- `002_plugin_catalog.sql` seeds the SDKWork-authored plugin records.
- `003_dsh_market_catalog.sql` is a generated, idempotent projection of the
  dsh-market `plugins.json` catalog plus the `updates.json` changelog: 12,961
  entries across 23 categories, their machine facts, the full registry
  projection, and the child rows for install targets (21,806 rows, one default
  per entry), media (11,570), capability disclosures (39,906), and the latest
  release/commit history for 12,959 repositories. Regenerate it with
  `pnpm db:import:dsh-market -- --input <plugins.json> --updates <updates.json>`
  after reviewing a catalog update. `node tools/verify_dsh_market_catalog.mjs
  --input <plugins.json> --updates <updates.json>` fails when any registry field
  or changelog record is missing.

The catalog record's `name_locales_json` / `description_locales_json` columns
carry every translation the registry publishes, because the marketplace
switches language at runtime without re-seeding. The active-locale display
columns and the taxonomy labels are owned by the locale seed sets; a seed file
under `common/` never selects the display language.
