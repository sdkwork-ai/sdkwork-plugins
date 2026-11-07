# sdks

Generated consumer SDK families (SDK_WORKSPACE_GENERATION_SPEC.md):

| Family | Package | Authority | Prefix |
|---|---|---|---|
| `sdkwork-plugins-app-sdk` | `@sdkwork/plugins-app-sdk` | `apis/app-api/plugins/plugins-app-api.openapi.json` | `/app/v3/api` |
| `sdkwork-plugins-backend-sdk` | `@sdkwork/plugins-backend-sdk` | `apis/backend-api/plugins/plugins-backend-api.openapi.json` | `/backend/v3/api` |

Regenerate through the standard generator
(`../sdkwork-sdk-generator/bin/sdkgen.js`, `--standard-profile sdkwork-v3`)
via each family's `bin/generate-sdk.mjs`; never hand-edit
`generated/` output. Each family's `sdk-manifest.json` declares
`generationInputSpec` and `derivedSpecs`.
