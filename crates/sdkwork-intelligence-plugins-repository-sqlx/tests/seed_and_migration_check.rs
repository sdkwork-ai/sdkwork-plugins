use sqlx::postgres::PgPoolOptions;
use sqlx::PgPool;
use std::sync::Arc;

use sdkwork_id_core::SnowflakeIdGenerator;
use sdkwork_intelligence_plugins_repository_sqlx::SqlxPluginsRepository;
use sdkwork_intelligence_plugins_service::{CreatePluginCommand, PluginsService};
use sdkwork_plugins_contract::{
    PluginArtifactSource, PluginImplementationType, PluginInstallationAction,
    PluginInstallationStatus, PluginInstallationSyncCommand, PluginVisibility,
};

const BASELINE: &str =
    include_str!("../../../database/ddl/baseline/postgres/0001_plugins_baseline.sql");
const SEED: &str = include_str!("../../../database/seeds/common/001_plugin_categories.sql");
const PLUGIN_SEED: &str = include_str!("../../../database/seeds/common/002_plugin_catalog.sql");
const MIGRATION: &str =
    include_str!("../../../database/migrations/postgres/0002_plugin_artifact_sources.up.sql");
const MARKETPLACE_MIGRATION: &str =
    include_str!("../../../database/migrations/postgres/0003_plugin_marketplace_metadata.up.sql");
const MARKETPLACE_REGISTRY_MIGRATION: &str =
    include_str!("../../../database/migrations/postgres/0004_plugin_marketplace_registry.up.sql");
const CATALOG_COMPLETENESS_MIGRATION: &str =
    include_str!("../../../database/migrations/postgres/0005_plugin_catalog_completeness.up.sql");
const INSTALLATION_MIGRATION: &str =
    include_str!("../../../database/migrations/postgres/0006_plugin_installation_sync.up.sql");

/// The dsh-market payload and the locale display sets are tens of megabytes,
/// so the catalog test reads them from the repository at run time instead of
/// embedding them in the test binary.
const DSH_MARKET_CATALOG_SEED: &str = "database/seeds/common/003_dsh_market_catalog.sql";
const LOCALE_SEEDS: [&str; 4] = [
    "database/seeds/locales/zh-CN/001_plugin_categories_display.sql",
    "database/seeds/locales/zh-CN/002_plugin_catalog_display.sql",
    "database/seeds/locales/en-US/001_plugin_categories_display.sql",
    "database/seeds/locales/en-US/002_plugin_catalog_display.sql",
];

/// Catalog facts the dsh-market seed must produce regardless of how often it
/// is applied.
#[derive(Debug, PartialEq, Eq)]
struct CatalogSeedCounts {
    catalog_plugins: i64,
    duplicate_plugin_keys: i64,
    install_targets: i64,
    default_targets: i64,
    plugins_without_exactly_one_default: i64,
    media_rows: i64,
    capability_rows: i64,
    max_uuid_length: i64,
}

fn read_repository_file(relative: &str) -> String {
    let path = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .join(relative);
    std::fs::read_to_string(&path)
        .unwrap_or_else(|error| panic!("read {} failed: {error}", path.display()))
}

async fn apply_sql(pool: &PgPool, sql: &str, purpose: &str) {
    // `raw_sql` runs multi-statement scripts through the simple query
    // protocol. `AssertSqlSafe<String>` lets a run-time seed file be owned by
    // the statement instead of requiring a `'static` literal.
    sqlx::raw_sql(sqlx::AssertSqlSafe(sql.to_string()))
        .execute(pool)
        .await
        .unwrap_or_else(|error| panic!("{purpose} failed: {error}"));
}

async fn read_catalog_seed_counts(pool: &PgPool) -> CatalogSeedCounts {
    let scalar = |sql: &'static str| async move {
        sqlx::query_scalar::<_, i64>(sql)
            .fetch_one(pool)
            .await
            .unwrap_or_else(|error| panic!("count query failed: {error}"))
    };
    CatalogSeedCounts {
        catalog_plugins: scalar(
            "SELECT COUNT(*) FROM ai_plugin WHERE catalog_url IS NOT NULL AND deleted_at IS NULL",
        )
        .await,
        duplicate_plugin_keys: scalar(
            "SELECT COUNT(*) FROM (
                 SELECT tenant_id, plugin_key FROM ai_plugin
                 WHERE deleted_at IS NULL
                 GROUP BY tenant_id, plugin_key HAVING COUNT(*) > 1
             ) AS duplicates",
        )
        .await,
        install_targets: scalar(
            "SELECT COUNT(*) FROM ai_plugin_install_target WHERE deleted_at IS NULL",
        )
        .await,
        default_targets: scalar(
            "SELECT COUNT(*) FROM ai_plugin_install_target
             WHERE is_default AND deleted_at IS NULL",
        )
        .await,
        plugins_without_exactly_one_default: scalar(
            "SELECT COUNT(*) FROM (
                 SELECT plugin_id FROM ai_plugin_install_target
                 WHERE is_default AND deleted_at IS NULL
                 GROUP BY tenant_id, plugin_id HAVING COUNT(*) <> 1
             ) AS offenders",
        )
        .await,
        media_rows: scalar("SELECT COUNT(*) FROM ai_plugin_media WHERE deleted_at IS NULL").await,
        capability_rows: scalar(
            "SELECT COUNT(*) FROM ai_plugin_capability WHERE deleted_at IS NULL",
        )
        .await,
        max_uuid_length: scalar(
            "SELECT GREATEST(
                 COALESCE((SELECT MAX(LENGTH(uuid)) FROM ai_plugin), 0),
                 COALESCE((SELECT MAX(LENGTH(uuid)) FROM ai_plugin_category), 0),
                 COALESCE((SELECT MAX(LENGTH(uuid)) FROM ai_plugin_install_target), 0),
                 COALESCE((SELECT MAX(LENGTH(uuid)) FROM ai_plugin_media), 0),
                 COALESCE((SELECT MAX(LENGTH(uuid)) FROM ai_plugin_capability), 0)
             )::bigint",
        )
        .await,
    }
}

async fn connect(url: &str) -> PgPool {
    PgPoolOptions::new()
        .max_connections(1)
        .connect(url)
        .await
        .expect("connect plugin database")
}

async fn create_schema(pool: &PgPool, schema: &str) {
    sqlx::query(sqlx::AssertSqlSafe(format!("CREATE SCHEMA \"{schema}\"")))
        .execute(pool)
        .await
        .expect("create plugin test schema");
    sqlx::query(sqlx::AssertSqlSafe(format!(
        "SET search_path TO \"{schema}\""
    )))
    .execute(pool)
    .await
    .expect("set plugin test search path");
}

#[tokio::test]
async fn seeds_agent_plugin_categories_idempotently() {
    let url = match std::env::var("SDKWORK_PLUGINS_POSTGRES_URL") {
        Ok(value) if !value.trim().is_empty() => value,
        _ => return,
    };
    let admin = connect(&url).await;
    let schema = format!(
        "plugins_seed_check_{}_{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .expect("time")
            .as_nanos()
    );
    create_schema(&admin, &schema).await;
    let pool = connect(&url).await;
    sqlx::query(sqlx::AssertSqlSafe(format!(
        "SET search_path TO \"{schema}\""
    )))
    .execute(&pool)
    .await
    .expect("set seed test search path");

    sqlx::raw_sql(BASELINE)
        .execute(&pool)
        .await
        .expect("apply plugin baseline");
    sqlx::raw_sql(SEED)
        .execute(&pool)
        .await
        .expect("apply plugin category seed");
    sqlx::raw_sql(SEED)
        .execute(&pool)
        .await
        .expect("reapply plugin category seed idempotently");

    let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM ai_plugin_category")
        .fetch_one(&pool)
        .await
        .expect("count seeded categories");
    assert_eq!(
        count, 6,
        "the seed must create the six agent plugin categories"
    );

    let names: Vec<String> =
        sqlx::query_scalar("SELECT name FROM ai_plugin_category ORDER BY sort_order")
            .fetch_all(&pool)
            .await
            .expect("read seeded category names");
    assert_eq!(
        names,
        vec![
            "代码与开发".to_string(),
            "数据检索".to_string(),
            "文档处理".to_string(),
            "数据库应用".to_string(),
            "图像处理".to_string(),
            "商业应用".to_string(),
        ]
    );
    let category_locales: serde_json::Value = sqlx::query_scalar(
        "SELECT name_locales_json FROM ai_plugin_category WHERE category_code = 'code-development'",
    )
    .fetch_one(&pool)
    .await
    .expect("read category locale seed");
    assert_eq!(category_locales["en-US"], "Code and Development");

    pool.close().await;
    sqlx::query(sqlx::AssertSqlSafe(format!(
        "DROP SCHEMA \"{schema}\" CASCADE"
    )))
    .execute(&admin)
    .await
    .expect("drop seed test schema");
    admin.close().await;
}

#[tokio::test]
async fn seeds_featured_plugins_without_overwriting_curation() {
    let url = match std::env::var("SDKWORK_PLUGINS_POSTGRES_URL") {
        Ok(value) if !value.trim().is_empty() => value,
        _ => return,
    };
    let admin = connect(&url).await;
    let schema = format!(
        "plugins_featured_seed_check_{}_{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .expect("time")
            .as_nanos()
    );
    create_schema(&admin, &schema).await;
    let pool = connect(&url).await;
    sqlx::query(sqlx::AssertSqlSafe(format!(
        "SET search_path TO \"{schema}\""
    )))
    .execute(&pool)
    .await
    .expect("set seed test search path");
    sqlx::raw_sql(BASELINE)
        .execute(&pool)
        .await
        .expect("apply plugin baseline");
    sqlx::raw_sql(SEED)
        .execute(&pool)
        .await
        .expect("seed plugin categories");
    sqlx::raw_sql(PLUGIN_SEED)
        .execute(&pool)
        .await
        .expect("seed plugin catalog");

    sqlx::query(
        "UPDATE ai_plugin SET featured_title_locales_json = '{\"en-US\":\"Operator curation\"}'::jsonb, featured_order = 3 WHERE plugin_key = 'code-reviewer'",
    )
    .execute(&pool)
    .await
    .expect("curate a featured plugin");
    sqlx::raw_sql(PLUGIN_SEED)
        .execute(&pool)
        .await
        .expect("reapply catalog seed without replacing curation");

    let plugin_rows: Vec<(String, i64, i32, serde_json::Value, Option<String>)> = sqlx::query_as(
        "SELECT plugin_key, usage_count, featured_order, featured_title_locales_json, featured_image_url FROM ai_plugin WHERE is_featured ORDER BY featured_order",
    )
    .fetch_all(&pool)
    .await
    .expect("read featured seed rows");
    // Four placements, so the featured shelf is a full grid on a fresh
    // deployment; the operator's curation of the first row survives.
    assert_eq!(plugin_rows.len(), 4);
    assert_eq!(plugin_rows[0].0, "code-reviewer");
    assert_eq!(plugin_rows[0].1, 3200);
    assert_eq!(plugin_rows[0].2, 3);
    assert_eq!(plugin_rows[0].3["en-US"], "Operator curation");
    assert_eq!(plugin_rows[0].4, None);
    assert_eq!(plugin_rows[1].0, "web-search");
    assert_eq!(plugin_rows[1].1, 5200);
    assert_eq!(plugin_rows[1].2, 20);
    assert_eq!(plugin_rows[1].3["en-US"], "Web Search");
    assert_eq!(plugin_rows[1].4, None);
    assert_eq!(plugin_rows[2].0, "document-parser");
    assert_eq!(plugin_rows[2].1, 4300);
    assert_eq!(plugin_rows[2].2, 30);
    assert_eq!(plugin_rows[2].3["en-US"], "Universal Document Parser");
    assert_eq!(plugin_rows[2].4, None);
    assert_eq!(plugin_rows[3].0, "sql-console");
    assert_eq!(plugin_rows[3].1, 3100);
    assert_eq!(plugin_rows[3].2, 40);
    assert_eq!(plugin_rows[3].3["en-US"], "Database Connector");
    assert_eq!(plugin_rows[3].4, None);

    pool.close().await;
    sqlx::query(sqlx::AssertSqlSafe(format!(
        "DROP SCHEMA \"{schema}\" CASCADE"
    )))
    .execute(&admin)
    .await
    .expect("drop seed test schema");
    admin.close().await;
}

#[tokio::test]
async fn adds_plugin_source_column_idempotently() {
    let url = match std::env::var("SDKWORK_PLUGINS_POSTGRES_URL") {
        Ok(value) if !value.trim().is_empty() => value,
        _ => return,
    };
    let admin = connect(&url).await;
    let schema = format!(
        "plugins_migration_check_{}_{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .expect("time")
            .as_nanos()
    );
    create_schema(&admin, &schema).await;
    let pool = connect(&url).await;
    sqlx::query(sqlx::AssertSqlSafe(format!(
        "SET search_path TO \"{schema}\""
    )))
    .execute(&pool)
    .await
    .expect("set migration test search path");

    sqlx::raw_sql("CREATE TABLE ai_plugin (id BIGINT PRIMARY KEY, plugin_key TEXT NOT NULL);")
        .execute(&pool)
        .await
        .expect("create legacy ai_plugin table");

    sqlx::raw_sql(MIGRATION)
        .execute(&pool)
        .await
        .expect("apply plugin artifact source migration");
    sqlx::raw_sql(MIGRATION)
        .execute(&pool)
        .await
        .expect("reapply plugin artifact source migration idempotently");

    let column_count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM information_schema.columns
         WHERE table_schema = current_schema()
           AND table_name = 'ai_plugin'
           AND column_name = 'source_json'",
    )
    .fetch_one(&pool)
    .await
    .expect("read source_json column metadata");
    assert_eq!(column_count, 1);

    sqlx::query(
        "INSERT INTO ai_plugin (id, plugin_key, source_json)
         VALUES (1, 'demo', '{\"kind\":\"git\",\"repositoryUrl\":\"https://example.com/org/repo.git\",\"repositoryPath\":\"plugins/demo\"}'::jsonb)",
    )
    .execute(&pool)
    .await
    .expect("insert plugin source descriptor");

    pool.close().await;
    sqlx::query(sqlx::AssertSqlSafe(format!(
        "DROP SCHEMA \"{schema}\" CASCADE"
    )))
    .execute(&admin)
    .await
    .expect("drop migration test schema");
    admin.close().await;
}

#[tokio::test]
async fn adds_and_backfills_marketplace_metadata_idempotently() {
    let url = match std::env::var("SDKWORK_PLUGINS_POSTGRES_URL") {
        Ok(value) if !value.trim().is_empty() => value,
        _ => return,
    };
    let admin = connect(&url).await;
    let schema = format!(
        "plugins_marketplace_migration_{}_{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .expect("time")
            .as_nanos()
    );
    create_schema(&admin, &schema).await;
    let pool = connect(&url).await;
    sqlx::query(sqlx::AssertSqlSafe(format!(
        "SET search_path TO \"{schema}\""
    )))
    .execute(&pool)
    .await
    .expect("set migration test search path");
    sqlx::raw_sql(BASELINE)
        .execute(&pool)
        .await
        .expect("apply plugin baseline");
    sqlx::raw_sql(MIGRATION)
        .execute(&pool)
        .await
        .expect("apply artifact source migration");
    sqlx::raw_sql(
        "DROP INDEX idx_ai_plugin_catalog_featured;
         ALTER TABLE ai_plugin_category
             DROP COLUMN name_locales_json,
             DROP COLUMN description_locales_json;
         ALTER TABLE ai_plugin
             DROP COLUMN name_locales_json,
             DROP COLUMN description_locales_json,
             DROP COLUMN icon_url,
             DROP COLUMN usage_count,
             DROP COLUMN is_featured,
             DROP COLUMN featured_order,
             DROP COLUMN featured_title_locales_json,
             DROP COLUMN featured_description_locales_json,
             DROP COLUMN featured_image_url;",
    )
    .execute(&pool)
    .await
    .expect("simulate the deployed pre-marketplace schema");
    sqlx::query(
        "INSERT INTO ai_plugin (id, uuid, tenant_id, plugin_key, name, version_label, implementation_type, visibility, manifest_json)
         VALUES (1, 'plugin.code.reviewer', 100001, 'code-reviewer', '代码审查助手', '1.2.0', 'sdkwork-native', 'tenant', '{\"downloadsCount\":3200}'::jsonb),
                (2, 'plugin.web-search', 100001, 'web-search', '联网检索', '1.4.1', 'sdkwork-native', 'public', '{\"downloadsCount\":5200}'::jsonb),
                (3, 'plugin.other-tenant.code-reviewer', 100002, 'code-reviewer', 'Other tenant review', '1.2.0', 'sdkwork-native', 'tenant', '{\"downloadsCount\":99}'::jsonb)",
    )
        .execute(&pool)
        .await
        .expect("insert legacy catalog rows");
    // A deployed pre-marketplace database already carries the category rows
    // the locale backfill updates; the simulated schema has to keep them.
    sqlx::query(
        "INSERT INTO ai_plugin_category (id, uuid, tenant_id, category_code, name, sort_order, lifecycle_status)
         VALUES (1, 'cat.code-development', 100001, 'code-development', '代码与开发', 10, 1)",
    )
    .execute(&pool)
    .await
    .expect("insert legacy category row");

    sqlx::raw_sql(MARKETPLACE_MIGRATION)
        .execute(&pool)
        .await
        .expect("apply marketplace metadata migration");
    sqlx::raw_sql(MARKETPLACE_MIGRATION)
        .execute(&pool)
        .await
        .expect("reapply marketplace metadata migration idempotently");
    sqlx::raw_sql(MARKETPLACE_REGISTRY_MIGRATION)
        .execute(&pool)
        .await
        .expect("apply marketplace registry migration");
    sqlx::raw_sql(MARKETPLACE_REGISTRY_MIGRATION)
        .execute(&pool)
        .await
        .expect("reapply marketplace registry migration idempotently");

    // Two tenants hold the same plugin_key, so the positive assertions must
    // name the tenant they mean instead of relying on scan order.
    let usage_count: i64 = sqlx::query_scalar(
        "SELECT usage_count FROM ai_plugin WHERE tenant_id = 100001 AND plugin_key = 'code-reviewer'",
    )
    .fetch_one(&pool)
    .await
    .expect("read migrated usage count");
    assert_eq!(usage_count, 3200);
    let featured: (bool, i32, serde_json::Value, Option<String>) = sqlx::query_as(
        "SELECT is_featured, featured_order, featured_title_locales_json, featured_image_url FROM ai_plugin WHERE tenant_id = 100001 AND plugin_key = 'code-reviewer'",
    )
    .fetch_one(&pool)
    .await
    .expect("read migrated featured placement");
    assert!(featured.0);
    assert_eq!(featured.1, 10);
    assert_eq!(featured.2["en-US"], "Code Review Assistant");
    assert_eq!(featured.3, None);
    let other_tenant_featured: bool = sqlx::query_scalar(
        "SELECT is_featured FROM ai_plugin WHERE tenant_id = 100002 AND plugin_key = 'code-reviewer'",
    )
    .fetch_one(&pool)
    .await
    .expect("read same-key plugin in another tenant");
    assert!(
        !other_tenant_featured,
        "seed presentation must stay tenant-scoped"
    );
    let category_locales: serde_json::Value = sqlx::query_scalar(
        "SELECT name_locales_json FROM ai_plugin_category WHERE category_code = 'code-development'",
    )
    .fetch_one(&pool)
    .await
    .expect("read migrated category locale copy");
    assert_eq!(category_locales["en-US"], "Code and Development");
    let featured_fields: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'ai_plugin' AND column_name IN ('is_featured', 'featured_title_locales_json', 'featured_image_url', 'marketplace_metadata_json')",
    )
    .fetch_one(&pool)
    .await
    .expect("read marketplace metadata columns");
    assert_eq!(featured_fields, 4);

    pool.close().await;
    sqlx::query(sqlx::AssertSqlSafe(format!(
        "DROP SCHEMA \"{schema}\" CASCADE"
    )))
    .execute(&admin)
    .await
    .expect("drop migration test schema");
    admin.close().await;
}

#[tokio::test]
async fn round_trips_plugin_artifact_source() {
    let url = match std::env::var("SDKWORK_PLUGINS_POSTGRES_URL") {
        Ok(value) if !value.trim().is_empty() => value,
        _ => return,
    };
    let admin = connect(&url).await;
    let schema = format!(
        "plugins_source_round_trip_{}_{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .expect("time")
            .as_nanos()
    );
    create_schema(&admin, &schema).await;
    let pool = connect(&url).await;
    sqlx::query(sqlx::AssertSqlSafe(format!(
        "SET search_path TO \"{schema}\""
    )))
    .execute(&pool)
    .await
    .expect("set round-trip test search path");
    sqlx::raw_sql(BASELINE)
        .execute(&pool)
        .await
        .expect("apply plugin baseline");

    let generator = Arc::new(SnowflakeIdGenerator::new(731).expect("create generator"));
    let service = PluginsService::new(SqlxPluginsRepository::new(pool.clone(), generator));
    let source = PluginArtifactSource::DriveFile {
        drive_uri: "drive://spaces/plugins/nodes/archive".to_string(),
        checksum_sha256: "a".repeat(64),
        size_bytes: Some(128),
    };
    let record = service
        .create_plugin(
            100001,
            0,
            1,
            CreatePluginCommand {
                plugin_key: "demo-plugin".to_string(),
                name: "Demo Plugin".to_string(),
                description: None,
                name_locales: serde_json::json!({}),
                description_locales: serde_json::json!({}),
                icon_url: None,
                featured: false,
                featured_order: 0,
                featured_title_locales: serde_json::json!({}),
                featured_description_locales: serde_json::json!({}),
                featured_image_url: None,
                category_id: None,
                category_code: Some("code-development".to_string()),
                version_label: Some("1.0.0".to_string()),
                provider: None,
                implementation_type: PluginImplementationType::SdkworkNative,
                visibility: Some(PluginVisibility::Tenant),
                manifest: Some(serde_json::json!({"entrypoint": "run"})),
                source: Some(source.clone()),
                marketplace_metadata: None,
                tags: Vec::new(),
                allowed_role_codes: Vec::new(),
            },
        )
        .await
        .expect("create plugin with artifact source");
    assert_eq!(record.source, Some(source.clone()));

    let listed = service.list_plugins(100001).await.expect("list plugins");
    assert_eq!(listed.len(), 1);
    assert_eq!(listed[0].source, Some(source));

    let stored: serde_json::Value =
        sqlx::query_scalar("SELECT source_json FROM ai_plugin WHERE plugin_key='demo-plugin'")
            .fetch_one(&pool)
            .await
            .expect("read stored source_json");
    assert_eq!(stored["kind"], "drive_file");
    assert_eq!(stored["driveUri"], "drive://spaces/plugins/nodes/archive");

    pool.close().await;
    sqlx::query(sqlx::AssertSqlSafe(format!(
        "DROP SCHEMA \"{schema}\" CASCADE"
    )))
    .execute(&admin)
    .await
    .expect("drop round-trip test schema");
    admin.close().await;
}

#[tokio::test]
async fn seeds_the_complete_dsh_market_catalog_idempotently() {
    let url = match std::env::var("SDKWORK_PLUGINS_POSTGRES_URL") {
        Ok(value) if !value.trim().is_empty() => value,
        _ => return,
    };
    let admin = connect(&url).await;
    let schema = format!(
        "plugins_catalog_seed_check_{}_{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .expect("time")
            .as_nanos()
    );
    create_schema(&admin, &schema).await;
    let pool = connect(&url).await;
    sqlx::query(sqlx::AssertSqlSafe(format!(
        "SET search_path TO \"{schema}\""
    )))
    .execute(&pool)
    .await
    .expect("set catalog seed test search path");

    apply_sql(&pool, BASELINE, "apply plugin baseline").await;
    for (sql, purpose) in [
        (MIGRATION, "apply artifact source migration"),
        (
            MARKETPLACE_MIGRATION,
            "apply marketplace metadata migration",
        ),
        (
            MARKETPLACE_REGISTRY_MIGRATION,
            "apply marketplace registry migration",
        ),
        (
            CATALOG_COMPLETENESS_MIGRATION,
            "apply catalog completeness migration",
        ),
    ] {
        apply_sql(&pool, sql, purpose).await;
    }
    apply_sql(&pool, SEED, "seed plugin categories").await;
    apply_sql(&pool, PLUGIN_SEED, "seed plugin catalog").await;

    let market_seed = read_repository_file(DSH_MARKET_CATALOG_SEED);
    let locale_seeds = LOCALE_SEEDS.map(|path| (path, read_repository_file(path)));
    apply_sql(&pool, &market_seed, "seed the dsh-market catalog").await;
    for (path, sql) in &locale_seeds {
        apply_sql(&pool, sql, &format!("seed locale display set {path}")).await;
    }

    let first = read_catalog_seed_counts(&pool).await;
    assert_eq!(
        first.catalog_plugins, 12_961,
        "the dsh-market seed must import every catalog entry"
    );
    assert_eq!(
        first.duplicate_plugin_keys, 0,
        "catalog plugin keys must stay unique inside a tenant"
    );
    assert_eq!(
        first.install_targets, 21_806,
        "the seed must import every stored install target"
    );
    assert_eq!(
        first.default_targets, 12_961,
        "every catalog plugin carries exactly one default target"
    );
    assert_eq!(first.media_rows, 11_570);
    assert_eq!(first.capability_rows, 39_906);
    assert!(
        first.max_uuid_length <= 128,
        "plugin uuids must fit the widened VARCHAR(128): {}",
        first.max_uuid_length
    );
    assert_eq!(
        first.plugins_without_exactly_one_default, 0,
        "the partial unique index must hold per plugin"
    );

    let catalog_without_default: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM ai_plugin p
         WHERE p.catalog_url IS NOT NULL AND p.deleted_at IS NULL
           AND NOT EXISTS (
               SELECT 1 FROM ai_plugin_install_target t
               WHERE t.tenant_id = p.tenant_id AND t.plugin_id = p.id
                 AND t.is_default AND t.deleted_at IS NULL
           )",
    )
    .fetch_one(&pool)
    .await
    .expect("count catalog plugins without a default target");
    assert_eq!(
        catalog_without_default, 0,
        "every catalog plugin must have exactly one default install target"
    );

    let market_categories: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM ai_plugin_category
         WHERE taxonomy_source = 'dsh-market' AND deleted_at IS NULL",
    )
    .fetch_one(&pool)
    .await
    .expect("count dsh-market categories");
    assert_eq!(market_categories, 23);

    let localized_category: Option<String> = sqlx::query_scalar(
        "SELECT name_locales_json ->> 'zh-CN' FROM ai_plugin_category WHERE category_code = 'agi'",
    )
    .fetch_one(&pool)
    .await
    .expect("read the localized dsh-market category name");
    assert!(
        localized_category.is_some_and(|value| !value.trim().is_empty()),
        "the locale seeds must localize the dsh-market taxonomy"
    );

    // Re-applying the catalog and its locale sets is an upsert, not an append.
    apply_sql(&pool, &market_seed, "reapply the dsh-market catalog").await;
    for (path, sql) in &locale_seeds {
        apply_sql(&pool, sql, &format!("reapply locale display set {path}")).await;
    }
    let second = read_catalog_seed_counts(&pool).await;
    assert_eq!(
        second, first,
        "re-running the catalog seed must leave every count unchanged"
    );

    pool.close().await;
    sqlx::query(sqlx::AssertSqlSafe(format!(
        "DROP SCHEMA \"{schema}\" CASCADE"
    )))
    .execute(&admin)
    .await
    .expect("drop catalog seed test schema");
    admin.close().await;
}

#[tokio::test]
async fn hydrates_catalog_record_children_and_install_targets() {
    let url = match std::env::var("SDKWORK_PLUGINS_POSTGRES_URL") {
        Ok(value) if !value.trim().is_empty() => value,
        _ => return,
    };
    let admin = connect(&url).await;
    let schema = format!(
        "plugins_catalog_hydration_{}_{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .expect("time")
            .as_nanos()
    );
    create_schema(&admin, &schema).await;
    let pool = connect(&url).await;
    sqlx::query(sqlx::AssertSqlSafe(format!(
        "SET search_path TO \"{schema}\""
    )))
    .execute(&pool)
    .await
    .expect("set catalog hydration test search path");
    sqlx::raw_sql(BASELINE)
        .execute(&pool)
        .await
        .expect("apply plugin baseline");

    let generator = Arc::new(SnowflakeIdGenerator::new(732).expect("create generator"));
    let service = PluginsService::new(SqlxPluginsRepository::new(pool.clone(), generator));
    let created = service
        .create_plugin(
            100001,
            0,
            1,
            CreatePluginCommand {
                plugin_key: "catalog-demo".to_string(),
                name: "Catalog Demo".to_string(),
                description: None,
                name_locales: serde_json::json!({}),
                description_locales: serde_json::json!({}),
                icon_url: None,
                featured: false,
                featured_order: 0,
                featured_title_locales: serde_json::json!({}),
                featured_description_locales: serde_json::json!({}),
                featured_image_url: None,
                category_id: None,
                category_code: Some("code-development".to_string()),
                version_label: Some("1.0.0".to_string()),
                provider: None,
                implementation_type: PluginImplementationType::SdkworkNative,
                visibility: Some(PluginVisibility::Public),
                manifest: Some(serde_json::json!({})),
                source: None,
                marketplace_metadata: None,
                tags: Vec::new(),
                allowed_role_codes: Vec::new(),
            },
        )
        .await
        .expect("create an admin plugin");

    // The create path keeps an admin plugin out of the catalog: the columns
    // fall back to their defaults and no child row exists.
    let plain = service
        .get_plugin(100001, "catalog-demo")
        .await
        .expect("read the created plugin");
    assert_eq!(plain.catalog_provider, "sdkwork");
    assert_eq!(plain.catalog_url, None);
    assert_eq!(plain.stars_count, 0);
    assert_eq!(plain.downloads_count, 0);
    assert!(!plain.is_deprecated);
    assert!(plain.install_target.is_none());
    assert!(plain.install_targets.is_empty());
    assert!(plain.media.is_empty());
    assert!(plain.capabilities.is_empty());
    assert!(plain.capability_red_lines.is_empty());

    sqlx::query(
        "UPDATE ai_plugin SET
             catalog_provider = 'dsh-market',
             catalog_url = 'https://github.com/example/demo',
             catalog_page_url = 'https://awesome-dsh-plugin.com/p/example/demo/',
             owner_login = 'example',
             npm_package = '@example/demo',
             tarball_url = 'https://github.com/example/demo/releases/download/tag@v1.0.0/demo.tgz',
             repository_url = 'https://github.com/example/demo',
             repository_path = 'demo',
             repository_ref = 'main',
             registry_version = '1.0.0',
             added_on = '2026-10-27',
             stars_count = 42,
             stars_checked_at = '2026-11-24T03:34:07Z',
             downloads_count = 1234,
             downloads_start = '2026-10-25',
             downloads_end = '2026-11-23',
             downloads_checked_at = '2026-11-24T00:00:00Z',
             is_deprecated = TRUE,
             replaced_by_catalog_url = 'https://github.com/example/next',
             catalog_revision = '2026-11-24'
         WHERE tenant_id = 100001 AND plugin_key = 'catalog-demo'",
    )
    .execute(&pool)
    .await
    .expect("mark the plugin as a catalog row");

    // `marketplace_metadata_json` stores the upstream registry entry verbatim,
    // where star and download counts are JSON numbers. Decoding that stored
    // projection must not fail the catalog page (`PluginMarketplaceMetadata`).
    sqlx::query(
        "UPDATE ai_plugin SET marketplace_metadata_json = $1::jsonb
         WHERE tenant_id = 100001 AND plugin_key = 'catalog-demo'",
    )
    .bind(serde_json::json!({
        "provider": "dsh-market",
        "catalogUrl": "https://github.com/example/demo",
        "owner": "example",
        "added": "2026-10-27",
        "stars": 42,
        "downloads": 1234,
        "githubReleaseDownloads": 0,
        "categories": ["code-development"],
        "raw": {}
    }))
    .execute(&pool)
    .await
    .expect("store the registry projection with numbers");

    let plugin_id = created.id;
    for (id, uuid, kind, spec, package_name, package_version, is_default, priority) in [
        (
            9001_i64,
            "plugin.test.target.git",
            "git",
            "git+https://github.com/example/demo.git#main&path:/demo",
            None::<&str>,
            None::<&str>,
            false,
            20_i32,
        ),
        (
            9002_i64,
            "plugin.test.target.archive",
            "archive",
            "archive+https://github.com/example/demo/releases/download/tag@v1.0.0/demo.tgz",
            None::<&str>,
            None::<&str>,
            true,
            10_i32,
        ),
        (
            9003_i64,
            "plugin.test.target.registry",
            "registry",
            "@example/demo@1.0.0",
            Some("@example/demo"),
            Some("1.0.0"),
            false,
            30_i32,
        ),
    ] {
        sqlx::query(
            "INSERT INTO ai_plugin_install_target (
                 id, uuid, tenant_id, plugin_id, target_kind, target_spec, package_name,
                 package_version, is_default, source_priority, lifecycle_status
             ) VALUES ($1, $2, 100001, $3, $4, $5, $6, $7, $8, $9, 1)",
        )
        .bind(id)
        .bind(uuid)
        .bind(plugin_id)
        .bind(kind)
        .bind(spec)
        .bind(package_name.map(str::to_string))
        .bind(package_version.map(str::to_string))
        .bind(is_default)
        .bind(priority)
        .execute(&pool)
        .await
        .expect("insert install target");
    }

    for (id, uuid, kind, url, sort_order) in [
        (
            9101_i64,
            "plugin.test.media.icon",
            "icon",
            "https://raw.githubusercontent.com/example/demo/main/icon.png",
            0_i32,
        ),
        (
            9102_i64,
            "plugin.test.media.screenshot-2",
            "screenshot",
            "https://raw.githubusercontent.com/example/demo/main/shot-2.png",
            2_i32,
        ),
        (
            9103_i64,
            "plugin.test.media.screenshot-1",
            "screenshot",
            "https://raw.githubusercontent.com/example/demo/main/shot-1.png",
            1_i32,
        ),
    ] {
        sqlx::query(
            "INSERT INTO ai_plugin_media (
                 id, uuid, tenant_id, plugin_id, media_kind, url, sort_order, lifecycle_status
             ) VALUES ($1, $2, 100001, $3, $4, $5, $6, 1)",
        )
        .bind(id)
        .bind(uuid)
        .bind(plugin_id)
        .bind(kind)
        .bind(url)
        .bind(sort_order)
        .execute(&pool)
        .await
        .expect("insert media row");
    }

    for (id, uuid, disclosure_kind, code, sort_order) in [
        (
            9201_i64,
            "plugin.test.capability.shell",
            "capability",
            "shell",
            2_i32,
        ),
        (
            9202_i64,
            "plugin.test.capability.network",
            "capability",
            "network",
            1_i32,
        ),
        (
            9203_i64,
            "plugin.test.capability.red-line",
            "red_line",
            "reads credentials and calls the network",
            1_i32,
        ),
    ] {
        sqlx::query(
            "INSERT INTO ai_plugin_capability (
                 id, uuid, tenant_id, plugin_id, disclosure_kind, capability_code, sort_order, lifecycle_status
             ) VALUES ($1, $2, 100001, $3, $4, $5, $6, 1)",
        )
        .bind(id)
        .bind(uuid)
        .bind(plugin_id)
        .bind(disclosure_kind)
        .bind(code)
        .bind(sort_order)
        .execute(&pool)
        .await
        .expect("insert capability row");
    }

    let fetched = service
        .get_catalog_plugin(100001, 0, 0, "catalog-demo")
        .await
        .expect("read the catalog plugin")
        .expect("the catalog plugin is visible");
    assert_eq!(fetched.catalog_provider, "dsh-market");
    assert_eq!(
        fetched.catalog_url.as_deref(),
        Some("https://github.com/example/demo")
    );
    assert_eq!(fetched.owner_login.as_deref(), Some("example"));
    assert_eq!(fetched.stars_count, 42);
    assert_eq!(fetched.downloads_count, 1234);
    let metadata = fetched
        .marketplace_metadata
        .as_ref()
        .expect("the stored registry projection decodes from its numeric encoding");
    assert_eq!(metadata.stars, Some(42));
    assert_eq!(metadata.downloads, Some(1_234));
    assert_eq!(metadata.github_release_downloads, Some(0));
    assert_eq!(fetched.added_on.as_deref(), Some("2026-10-27"));
    assert_eq!(fetched.downloads_start.as_deref(), Some("2026-10-25"));
    assert_eq!(fetched.downloads_end.as_deref(), Some("2026-11-23"));
    assert!(fetched.is_deprecated);
    assert_eq!(
        fetched.replaced_by_catalog_url.as_deref(),
        Some("https://github.com/example/next")
    );

    let targets = fetched.install_targets.clone();
    assert_eq!(targets.len(), 3);
    assert_eq!(
        targets[0].kind, "archive",
        "default target orders first by source priority"
    );
    assert_eq!(
        targets[0].spec,
        "archive+https://github.com/example/demo/releases/download/tag@v1.0.0/demo.tgz"
    );
    assert!(targets[0].is_default);
    assert_eq!(targets[1].kind, "git");
    assert_eq!(targets[2].kind, "registry");
    assert_eq!(targets[2].package_name.as_deref(), Some("@example/demo"));
    assert_eq!(targets[2].package_version.as_deref(), Some("1.0.0"));
    let default_target = fetched
        .install_target
        .as_ref()
        .expect("a stored default target");
    assert_eq!(default_target.kind, "archive");

    let media_kinds = fetched
        .media
        .iter()
        .map(|media| (media.kind.as_str(), media.sort_order))
        .collect::<Vec<_>>();
    assert_eq!(
        media_kinds,
        vec![("icon", 0), ("screenshot", 1), ("screenshot", 2)],
        "media is ordered by kind then sort order"
    );
    assert_eq!(
        fetched.capabilities,
        vec!["network".to_string(), "shell".to_string()]
    );
    assert_eq!(
        fetched.capability_red_lines,
        vec!["reads credentials and calls the network".to_string()]
    );

    // The catalog facts and the ranked child collections are record data now;
    // no server-side install-plan action resolves them for a client.
    assert_eq!(
        fetched.catalog_page_url.as_deref(),
        Some("https://awesome-dsh-plugin.com/p/example/demo/")
    );
    assert_eq!(fetched.npm_package.as_deref(), Some("@example/demo"));
    assert_eq!(
        fetched.tarball_url.as_deref(),
        Some("https://github.com/example/demo/releases/download/tag@v1.0.0/demo.tgz")
    );
    assert_eq!(fetched.repository_path.as_deref(), Some("demo"));
    assert_eq!(fetched.repository_ref.as_deref(), Some("main"));
    assert_eq!(fetched.registry_version.as_deref(), Some("1.0.0"));
    assert_eq!(fetched.catalog_revision.as_deref(), Some("2026-11-24"));

    // An admin edit rewrites the record it read, so the catalog facts and the
    // child rows survive a rename.
    service
        .update_plugin(
            100001,
            1,
            "catalog-demo",
            sdkwork_intelligence_plugins_service::UpdatePluginCommand {
                name: Some("Catalog Demo Renamed".to_string()),
                ..Default::default()
            },
        )
        .await
        .expect("rename the catalog plugin");
    let updated = service
        .get_catalog_plugin(100001, 0, 0, "catalog-demo")
        .await
        .expect("read the renamed plugin")
        .expect("the renamed plugin stays visible");
    assert_eq!(updated.name, "Catalog Demo Renamed");
    assert_eq!(
        updated.stars_count, 42,
        "an admin edit must not clear catalog facts"
    );
    assert_eq!(updated.install_targets.len(), 3);
    assert_eq!(updated.media.len(), 3);
    assert_eq!(updated.capabilities.len(), 2);

    pool.close().await;
    sqlx::query(sqlx::AssertSqlSafe(format!(
        "DROP SCHEMA \"{schema}\" CASCADE"
    )))
    .execute(&admin)
    .await
    .expect("drop catalog hydration test schema");
    admin.close().await;
}

#[tokio::test]
async fn persists_installation_snapshots_and_reuses_the_record_id() {
    let url = match std::env::var("SDKWORK_PLUGINS_POSTGRES_URL") {
        Ok(value) if !value.trim().is_empty() => value,
        _ => return,
    };
    let admin = connect(&url).await;
    let schema = format!(
        "plugins_installation_sync_{}_{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .expect("time")
            .as_nanos()
    );
    create_schema(&admin, &schema).await;
    let pool = connect(&url).await;
    sqlx::query(sqlx::AssertSqlSafe(format!(
        "SET search_path TO \"{schema}\""
    )))
    .execute(&pool)
    .await
    .expect("set installation test search path");
    sqlx::raw_sql(BASELINE)
        .execute(&pool)
        .await
        .expect("apply plugin baseline");
    sqlx::raw_sql(INSTALLATION_MIGRATION)
        .execute(&pool)
        .await
        .expect("apply installation migration");
    sqlx::raw_sql(INSTALLATION_MIGRATION)
        .execute(&pool)
        .await
        .expect("reapply installation migration idempotently");

    let generator = Arc::new(SnowflakeIdGenerator::new(733).expect("create generator"));
    let service = PluginsService::new(SqlxPluginsRepository::new(pool.clone(), generator));
    service
        .create_plugin(
            100001,
            0,
            1,
            CreatePluginCommand {
                plugin_key: "installation-demo".to_string(),
                name: "Installation Demo".to_string(),
                description: None,
                name_locales: serde_json::json!({}),
                description_locales: serde_json::json!({}),
                icon_url: None,
                featured: false,
                featured_order: 0,
                featured_title_locales: serde_json::json!({}),
                featured_description_locales: serde_json::json!({}),
                featured_image_url: None,
                category_id: None,
                category_code: Some("official".to_string()),
                version_label: Some("2.0.0".to_string()),
                provider: Some("dsh-market".to_string()),
                implementation_type: PluginImplementationType::Custom,
                visibility: Some(PluginVisibility::Tenant),
                manifest: Some(serde_json::json!({})),
                source: None,
                marketplace_metadata: None,
                tags: Vec::new(),
                allowed_role_codes: Vec::new(),
            },
        )
        .await
        .expect("create the catalog plugin");

    let command = |action| PluginInstallationSyncCommand {
        plugin_key: "installation-demo".to_string(),
        action,
        package_name: None,
        version: None,
        install_spec: None,
    };
    let installed = service
        .sync_installation(
            100001,
            0,
            1,
            "host-installation",
            command(PluginInstallationAction::Installed),
        )
        .await
        .expect("persist the installation");
    assert_eq!(installed.status, PluginInstallationStatus::Installed);
    assert_eq!(installed.version.as_deref(), Some("2.0.0"));

    let updated = service
        .sync_installation(
            100001,
            0,
            1,
            "host-installation",
            command(PluginInstallationAction::Updated),
        )
        .await
        .expect("update the installation");
    assert_eq!(updated.id, installed.id);

    let removed = service
        .sync_installation(
            100001,
            0,
            1,
            "host-installation",
            command(PluginInstallationAction::Removed),
        )
        .await
        .expect("remove the installation");
    assert_eq!(removed.id, installed.id);
    assert_eq!(removed.status, PluginInstallationStatus::Removed);
    assert!(removed.removed_at.is_some());

    let (status, snapshot): (String, serde_json::Value) = sqlx::query_as(
        "SELECT status, catalog_snapshot_json FROM ai_plugin_installation \
         WHERE tenant_id = 100001 AND host_id = 'host-installation' AND plugin_key = 'installation-demo'",
    )
    .fetch_one(&pool)
    .await
    .expect("read the stored installation");
    assert_eq!(status, "removed");
    assert_eq!(snapshot["pluginKey"], "installation-demo");
    assert_eq!(snapshot["categoryCode"], "official");

    pool.close().await;
    sqlx::query(sqlx::AssertSqlSafe(format!(
        "DROP SCHEMA \"{schema}\" CASCADE"
    )))
    .execute(&admin)
    .await
    .expect("drop installation test schema");
    admin.close().await;
}
