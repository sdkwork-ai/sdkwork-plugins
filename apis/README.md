# apis

OpenAPI authorities for **sdkwork-plugins**. Hand-authored to match the route
crate manifests and handlers exactly.

| Authority | Path | Surface |
|-----------|------|---------|
| App (marketplace, read-only) | `app-api/plugins/plugins-app-api.openapi.json` | `/app/v3/api/*` |
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

`plugins.marketplace.install` is declared in the permission inventory for the
future install lifecycle command surface; no route carries it yet.

## Wire contract

- Success envelope: `SdkWorkApiResponse` with `code: 0`, `data`, `traceId`
  (`API_SPEC.md` section 4.5). Errors: HTTP 4xx/5xx `application/problem+json`.
- All list routes accept `SdkWorkListQuery`: `page` (default 1), `page_size`
  (default 20, max 200), `q` (free-text), `cursor` (rejected: offset only).
- int64 wire fields (`id`, `version`, `categoryId`) are decimal strings with
  `x-sdkwork-int64-string: true` (`API_SPEC.md` section 13.6).
- Record and command property names are camelCase, matching the Rust serde
  `rename_all = "camelCase"` projections in `sdkwork-plugins-contract`.

## SDK generation

```bash
node sdks/sdkwork-plugins-backend-sdk/bin/generate-sdk.mjs --language typescript
node sdks/sdkwork-plugins-app-sdk/bin/generate-sdk.mjs --language typescript
```
