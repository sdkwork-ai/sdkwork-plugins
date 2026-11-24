# apis

OpenAPI authorities for **sdkwork-plugins**. Hand-authored to match the route
crate manifests and handlers exactly.

| Authority | Path | Surface |
|-----------|------|---------|
| App (marketplace catalog) | `app-api/plugins/plugins-app-api.openapi.json` | `/app/v3/api/*` |
| Backend (admin) | `backend-api/plugins/plugins-backend-api.openapi.json` | `/backend/v3/api/*` |

## Backend routes (tag `plugins-admin`)

| Method | Path | Operation | Permission | Success |
|--------|------|-----------|------------|---------|
| GET | `/backend/v3/api/plugin_categories` | `pluginsAdmin.listCategories` | `plugins.admin.category.read` | 200 `data.items` + `data.pageInfo` |
| POST | `/backend/v3/api/plugin_categories` | `pluginsAdmin.upsertCategory` | `plugins.admin.category.manage` | 200 `data.item` (upsert command, not a pure create) |
| GET | `/backend/v3/api/plugins` | `pluginsAdmin.listPlugins` | `plugins.admin.plugin.read` | 200 `data.items` + `data.pageInfo` |
| POST | `/backend/v3/api/plugins` | `pluginsAdmin.createPlugin` | `plugins.admin.plugin.manage` | 201 `data.item` |
| PUT | `/backend/v3/api/plugins/{pluginKey}` | `pluginsAdmin.updatePlugin` | `plugins.admin.plugin.manage` | 200 `data.item` |
| DELETE | `/backend/v3/api/plugins/{pluginKey}` | `pluginsAdmin.deletePlugin` | `plugins.admin.plugin.manage` | 204, no JSON body |

## App routes (tag `plugins`)

| Method | Path | Operation | Permission | Success |
|--------|------|-----------|------------|---------|
| GET | `/app/v3/api/plugins` | `plugins.list` | `plugins.marketplace.read` | 200 `data.items` + `data.pageInfo` |
| GET | `/app/v3/api/plugins/{pluginKey}` | `plugins.retrieve` | `plugins.marketplace.read` | 200 `data.item` |
| GET | `/app/v3/api/plugin_categories` | `plugins.listCategories` | `plugins.marketplace.read` | 200 `data.items` + `data.pageInfo` |

The catalog record includes localized copy, icon and featured-card media,
featured ordering, a usage count, the registry facts captured at import time
and its ranked install targets (`installTarget` is the stored default target,
`installTargets` is ordered by source priority). Installation itself is a local
Host action performed by the client's Host profile; no SDKWork API executes it
and no SDKWork-side install permission gates it.

## Wire contract

- Success envelope: `SdkWorkApiResponse` with `code: 0`, `data`, `traceId`
  (`API_SPEC.md` section 4.5). Errors: HTTP 4xx/5xx `application/problem+json`.
- All list routes accept `SdkWorkListQuery`: `page` (default 1), `page_size`
  (default 20, max 200), `q` (free-text), `cursor` (rejected: offset only).
- The App marketplace plugin list accepts `featured_only=true` to return only
  featured plugins ordered by configured featured order, then usage count and
  plugin key, before pagination. Visibility, category and role filters still
  apply.
- The App marketplace plugin list accepts `sort=updated_at_desc` or
  `sort=usage_count_desc`. Omitting `sort` preserves the existing newest-first
  order. Usage-count sorting is applied before pagination. When
  `featured_only=true`, featured ordering takes precedence.
- The two catalog list routes (`GET /app/v3/api/plugins` and
  `GET /backend/v3/api/plugins`) additionally accept the catalog view filters:
  - `category_code` — one `ai_plugin_category.category_code`; omitted or `all`
    keeps every category.
  - `role_codes` — comma-separated IAM role codes of the signed-in caller. An
    empty value is the all-data view; a value keeps the plugins naming one of
    those roles plus the plugins open to every role (empty
    `allowed_role_codes`). Neither filter widens tenant or visibility scoping.

- int64 wire fields (`id`, `organizationId`, `ownerUserId`, `version`,
  `categoryId`, `starsCount`, `downloadsCount`) are decimal strings with
  `x-sdkwork-int64-string: true` (`API_SPEC.md` section 13.6).
- Catalog reads (`GET /app/v3/api/plugins` and
  `GET /app/v3/api/plugins/{pluginKey}`) are scoped by `ai_plugin.visibility`:
  `tenant`/`public` are visible to every caller of the tenant, `organization`
  only inside the caller's `organization_id` (`0` is the tenant-level
  sentinel), and `private` only to the `owner_user_id`. Backend admin reads
  stay tenant-wide and unscoped.
- Record and command property names are camelCase, matching the Rust serde
  `rename_all = "camelCase"` projections in `sdkwork-plugins-contract`.

## SDK generation

```bash
node sdks/sdkwork-plugins-backend-sdk/bin/generate-sdk.mjs --language typescript
node sdks/sdkwork-plugins-app-sdk/bin/generate-sdk.mjs --language typescript
```
