# postgres migrations

Incremental migrations applied after the baseline
(`ddl/baseline/postgres/0001_plugins_baseline.sql`). Empty for contract
v1.0.0. Migrations are append-only: once a version is applied, its file
bytes are immutable (checksum integrity guard).
