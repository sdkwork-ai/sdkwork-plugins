# crates

Rust workspace members (see the root `Cargo.toml` for the member list):

- `sdkwork-plugins-contract` — records, enums, operation ids, permission codes.
- `sdkwork-intelligence-plugins-service` — domain service + repository port + in-memory repository.
- `sdkwork-intelligence-plugins-repository-sqlx` — PostgreSQL `ai_plugin_*` repository.
- `sdkwork-routes-plugins-app-api` — `/app/v3/api/plugins` marketplace surface.
- `sdkwork-routes-plugins-backend-api` — `/backend/v3/api/plugins` admin surface.
- `sdkwork-api-plugins-assembly` — API assembly contributions (app/backend/combined).
- `sdkwork-api-plugins-standalone-gateway` — canonical standalone host (thin; assembly-only dependencies).
- `sdkwork-plugins-database-host` — database module lifecycle (`database/`).
