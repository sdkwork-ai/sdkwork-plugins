use sqlx::postgres::PgPoolOptions;
use sqlx::PgPool;
use std::sync::Arc;

use sdkwork_id_core::SnowflakeIdGenerator;
use sdkwork_intelligence_plugins_repository_sqlx::SqlxPluginsRepository;
use sdkwork_intelligence_plugins_service::{CreatePluginCommand, PluginsService};
use sdkwork_plugins_contract::{PluginArtifactSource, PluginImplementationType, PluginVisibility};

const BASELINE: &str =
    include_str!("../../../database/ddl/baseline/postgres/0001_plugins_baseline.sql");
const SEED: &str = include_str!("../../../database/seeds/common/001_plugin_categories.sql");
const PLUGIN_SEED: &str = include_str!("../../../database/seeds/common/002_plugin_catalog.sql");
const MIGRATION: &str =
    include_str!("../../../database/migrations/postgres/0002_plugin_artifact_sources.up.sql");
const MARKETPLACE_MIGRATION: &str =
    include_str!("../../../database/migrations/postgres/0003_plugin_marketplace_metadata.up.sql");

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
    assert_eq!(plugin_rows.len(), 2);
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
                (2, 'plugin.web-search', 100001, 'web-search', '联网检索', '1.4.1', 'sdkwork-native', 'public', '{\"downloadsCount\":5200}'::jsonb)",
    )
        .execute(&pool)
        .await
        .expect("insert legacy catalog rows");

    sqlx::raw_sql(MARKETPLACE_MIGRATION)
        .execute(&pool)
        .await
        .expect("apply marketplace metadata migration");
    sqlx::raw_sql(MARKETPLACE_MIGRATION)
        .execute(&pool)
        .await
        .expect("reapply marketplace metadata migration idempotently");

    let usage_count: i64 =
        sqlx::query_scalar("SELECT usage_count FROM ai_plugin WHERE plugin_key = 'code-reviewer'")
            .fetch_one(&pool)
            .await
            .expect("read migrated usage count");
    assert_eq!(usage_count, 3200);
    let featured: (bool, i32, serde_json::Value, Option<String>) = sqlx::query_as(
        "SELECT is_featured, featured_order, featured_title_locales_json, featured_image_url FROM ai_plugin WHERE plugin_key = 'code-reviewer'",
    )
    .fetch_one(&pool)
    .await
    .expect("read migrated featured placement");
    assert!(featured.0);
    assert_eq!(featured.1, 10);
    assert_eq!(featured.2["en-US"], "Code Review Assistant");
    assert_eq!(featured.3, None);
    let category_locales: serde_json::Value = sqlx::query_scalar(
        "SELECT name_locales_json FROM ai_plugin_category WHERE category_code = 'code-development'",
    )
    .fetch_one(&pool)
    .await
    .expect("read migrated category locale copy");
    assert_eq!(category_locales["en-US"], "Code and Development");
    let featured_fields: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'ai_plugin' AND column_name IN ('is_featured', 'featured_title_locales_json', 'featured_image_url')",
    )
    .fetch_one(&pool)
    .await
    .expect("read marketplace metadata columns");
    assert_eq!(featured_fields, 3);

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
