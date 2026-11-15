# common seeds

Environment-independent seed scripts, applied in filename order on
`seedOnBoot` (see `database.manifest.json`).

- `001_plugin_categories.sql` seeds the agent plugin category set: code &
  development, data retrieval, document processing, database apps, image
  processing, and business apps. The inserts are idempotent and keyed by
  `(tenant_id, category_code)`.
