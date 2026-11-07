use sdkwork_id_core::SnowflakeIdGenerator;
use sdkwork_intelligence_plugins_service::{PluginsResult, PluginsServiceError};
use sdkwork_plugins_contract::{
    PluginCategoryRecord, PluginInstallStatus, PluginLifecycleStatus, PluginImplementationType,
    PluginRecord, PluginVisibility,
};
use sqlx::{PgPool, Row};

use crate::entity_ids::{new_plugins_snowflake_id, new_plugins_uuid};
use crate::json_util::{string_list_from_json, string_list_to_json, timestamp_to_rfc3339};

const ACTIVE_ENTITY_FILTER: &str = "deleted_at IS NULL AND lifecycle_status <> 4";

const CATEGORY_SELECT: &str = r#"
    id, uuid, tenant_id, organization_id, category_code, name, description, sort_order,
    lifecycle_status, version, created_at, updated_at, created_by, updated_by, deleted_at
"#;

const PLUGIN_SELECT: &str = r#"
    id, uuid, tenant_id, organization_id, plugin_key, name, description, category_id,
    category_code, version_label, provider, implementation_type, visibility, manifest_json,
    install_status, lifecycle_status, tags_json, allowed_role_codes_json, version, created_at,
    updated_at, created_by, updated_by, deleted_at
"#;

fn map_sqlx(error: sqlx::Error) -> PluginsServiceError {
    PluginsServiceError::Repository(error.to_string())
}

fn resolve_entity_id(generator: &SnowflakeIdGenerator, id: i64) -> i64 {
    if id == 0 {
        new_plugins_snowflake_id(generator)
    } else {
        id
    }
}

fn resolve_entity_uuid(uuid: &str) -> String {
    if uuid.is_empty() {
        new_plugins_uuid()
    } else {
        uuid.to_string()
    }
}

fn read_json_string(row: &sqlx::postgres::PgRow, field: &str) -> PluginsResult<String> {
    let value: serde_json::Value = row
        .try_get::<serde_json::Value, _>(field)
        .map_err(map_sqlx)?;
    serde_json::to_string(&value)
        .map_err(|error| PluginsServiceError::Repository(format!("encode {field} json failed: {error}")))
}

fn map_implementation(value: &str) -> PluginsResult<PluginImplementationType> {
    PluginImplementationType::parse(value)
        .ok_or_else(|| PluginsServiceError::Repository(format!("invalid implementation_type: {value}")))
}

fn map_visibility(value: &str) -> PluginsResult<PluginVisibility> {
    PluginVisibility::parse(value)
        .ok_or_else(|| PluginsServiceError::Repository(format!("invalid visibility: {value}")))
}

fn map_install_status(value: &str) -> PluginsResult<PluginInstallStatus> {
    PluginInstallStatus::parse(value)
        .ok_or_else(|| PluginsServiceError::Repository(format!("invalid install_status: {value}")))
}

fn map_lifecycle(value: i16) -> PluginsResult<PluginLifecycleStatus> {
    PluginLifecycleStatus::from_db_code(value)
        .ok_or_else(|| PluginsServiceError::Repository(format!("invalid lifecycle status: {value}")))
}

fn row_to_category(row: &sqlx::postgres::PgRow) -> PluginsResult<PluginCategoryRecord> {
    Ok(PluginCategoryRecord {
        id: row.try_get::<i64, _>("id").map_err(map_sqlx)?,
        uuid: row.try_get("uuid").map_err(map_sqlx)?,
        category_code: row.try_get("category_code").map_err(map_sqlx)?,
        name: row.try_get("name").map_err(map_sqlx)?,
        description: row.try_get("description").map_err(map_sqlx)?,
        sort_order: row.try_get("sort_order").map_err(map_sqlx)?,
        lifecycle_status: map_lifecycle(row.try_get("lifecycle_status").map_err(map_sqlx)?)?,
        version: row.try_get::<i64, _>("version").map_err(map_sqlx)?,
        created_at: timestamp_to_rfc3339(row.try_get("created_at").map_err(map_sqlx)?),
        updated_at: timestamp_to_rfc3339(row.try_get("updated_at").map_err(map_sqlx)?),
    })
}

fn row_to_plugin(row: &sqlx::postgres::PgRow) -> PluginsResult<PluginRecord> {
    Ok(PluginRecord {
        id: row.try_get::<i64, _>("id").map_err(map_sqlx)?,
        uuid: row.try_get("uuid").map_err(map_sqlx)?,
        plugin_key: row.try_get("plugin_key").map_err(map_sqlx)?,
        name: row.try_get("name").map_err(map_sqlx)?,
        description: row.try_get("description").map_err(map_sqlx)?,
        category_id: row
            .try_get::<Option<i64>, _>("category_id")
            .map_err(map_sqlx)?,
        category_code: row.try_get("category_code").map_err(map_sqlx)?,
        version_label: row.try_get("version_label").map_err(map_sqlx)?,
        provider: row.try_get("provider").map_err(map_sqlx)?,
        implementation_type: map_implementation(
            row.try_get::<String, _>("implementation_type")
                .map_err(map_sqlx)?
                .as_str(),
        )?,
        visibility: map_visibility(
            row.try_get::<String, _>("visibility")
                .map_err(map_sqlx)?
                .as_str(),
        )?,
        manifest: row.try_get("manifest_json").map_err(map_sqlx)?,
        install_status: map_install_status(
            row.try_get::<String, _>("install_status")
                .map_err(map_sqlx)?
                .as_str(),
        )?,
        tags: string_list_from_json(read_json_string(row, "tags_json")?.as_str(), "tags_json")?,
        allowed_role_codes: string_list_from_json(
            read_json_string(row, "allowed_role_codes_json")?.as_str(),
            "allowed_role_codes_json",
        )?,
        lifecycle_status: map_lifecycle(row.try_get("lifecycle_status").map_err(map_sqlx)?)?,
        version: row.try_get::<i64, _>("version").map_err(map_sqlx)?,
        created_at: timestamp_to_rfc3339(row.try_get("created_at").map_err(map_sqlx)?),
        updated_at: timestamp_to_rfc3339(row.try_get("updated_at").map_err(map_sqlx)?),
    })
}

pub async fn list_categories(
    pool: &PgPool,
    tenant_id: u64,
) -> PluginsResult<Vec<PluginCategoryRecord>> {
    let query = format!(
        r#"
        SELECT {CATEGORY_SELECT}
        FROM ai_plugin_category
        WHERE tenant_id IN (0, $1) AND {ACTIVE_ENTITY_FILTER}
        ORDER BY sort_order ASC, category_code ASC
        "#
    );
    let rows = sqlx::query(sqlx::AssertSqlSafe(query.as_str()))
        .bind(tenant_id as i64)
        .fetch_all(pool)
        .await
        .map_err(map_sqlx)?;
    rows.iter().map(row_to_category).collect()
}

pub async fn get_category(
    pool: &PgPool,
    tenant_id: u64,
    category_code: &str,
) -> PluginsResult<PluginCategoryRecord> {
    let query = format!(
        r#"
        SELECT {CATEGORY_SELECT}
        FROM ai_plugin_category
        WHERE tenant_id = $1 AND category_code = $2 AND deleted_at IS NULL
        LIMIT 1
        "#
    );
    let row = sqlx::query(sqlx::AssertSqlSafe(query.as_str()))
        .bind(tenant_id as i64)
        .bind(category_code)
        .fetch_optional(pool)
        .await
        .map_err(map_sqlx)?;
    row.as_ref()
        .map(row_to_category)
        .transpose()?
        .ok_or_else(|| PluginsServiceError::NotFound(category_code.to_string()))
}

pub async fn upsert_category(
    pool: &PgPool,
    id_generator: &SnowflakeIdGenerator,
    tenant_id: u64,
    operator_id: u64,
    record: PluginCategoryRecord,
) -> PluginsResult<PluginCategoryRecord> {
    let id = resolve_entity_id(id_generator, record.id);
    let uuid = resolve_entity_uuid(&record.uuid);
    let query = format!(
        r#"
        INSERT INTO ai_plugin_category (
            id, uuid, tenant_id, category_code, name, description, sort_order,
            lifecycle_status, version, created_by, updated_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        ON CONFLICT (tenant_id, category_code) DO UPDATE SET
            name = EXCLUDED.name,
            description = EXCLUDED.description,
            sort_order = EXCLUDED.sort_order,
            lifecycle_status = EXCLUDED.lifecycle_status,
            version = ai_plugin_category.version + 1,
            updated_by = EXCLUDED.updated_by,
            updated_at = CURRENT_TIMESTAMP,
            deleted_at = NULL
        RETURNING {CATEGORY_SELECT}
        "#
    );
    let row = sqlx::query(sqlx::AssertSqlSafe(query.as_str()))
        .bind(id)
        .bind(uuid)
        .bind(tenant_id as i64)
        .bind(&record.category_code)
        .bind(&record.name)
        .bind(&record.description)
        .bind(record.sort_order)
        .bind(record.lifecycle_status.as_db_code())
        .bind(record.version)
        .bind(operator_id as i64)
        .bind(operator_id as i64)
        .fetch_one(pool)
        .await
        .map_err(map_sqlx)?;
    row_to_category(&row)
}

pub async fn list_plugins(pool: &PgPool, tenant_id: u64) -> PluginsResult<Vec<PluginRecord>> {
    let query = format!(
        r#"
        SELECT {PLUGIN_SELECT}
        FROM ai_plugin
        WHERE tenant_id = $1 AND {ACTIVE_ENTITY_FILTER}
        ORDER BY updated_at DESC, plugin_key ASC
        "#
    );
    let rows = sqlx::query(sqlx::AssertSqlSafe(query.as_str()))
        .bind(tenant_id as i64)
        .fetch_all(pool)
        .await
        .map_err(map_sqlx)?;
    rows.iter().map(row_to_plugin).collect()
}

pub async fn get_plugin(
    pool: &PgPool,
    tenant_id: u64,
    plugin_key: &str,
) -> PluginsResult<PluginRecord> {
    let query = format!(
        r#"
        SELECT {PLUGIN_SELECT}
        FROM ai_plugin
        WHERE tenant_id = $1 AND plugin_key = $2 AND deleted_at IS NULL
        LIMIT 1
        "#
    );
    let row = sqlx::query(sqlx::AssertSqlSafe(query.as_str()))
        .bind(tenant_id as i64)
        .bind(plugin_key)
        .fetch_optional(pool)
        .await
        .map_err(map_sqlx)?;
    row.as_ref()
        .map(row_to_plugin)
        .transpose()?
        .ok_or_else(|| PluginsServiceError::NotFound(plugin_key.to_string()))
}

pub async fn create_plugin(
    pool: &PgPool,
    id_generator: &SnowflakeIdGenerator,
    tenant_id: u64,
    operator_id: u64,
    record: PluginRecord,
) -> PluginsResult<PluginRecord> {
    let id = resolve_entity_id(id_generator, record.id);
    let uuid = resolve_entity_uuid(&record.uuid);
    let tags_json = bind_string_list(&record.tags, "tags")?;
    let role_codes_json = bind_string_list(&record.allowed_role_codes, "allowed_role_codes")?;
    let query = format!(
        r#"
        INSERT INTO ai_plugin (
            id, uuid, tenant_id, plugin_key, name, description, category_id, category_code,
            version_label, provider, implementation_type, visibility, manifest_json,
            install_status, lifecycle_status, tags_json, allowed_role_codes_json, version,
            created_by, updated_by
        ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18,
            $19, $20
        )
        RETURNING {PLUGIN_SELECT}
        "#
    );
    let row = sqlx::query(sqlx::AssertSqlSafe(query.as_str()))
        .bind(id)
        .bind(uuid)
        .bind(tenant_id as i64)
        .bind(&record.plugin_key)
        .bind(&record.name)
        .bind(&record.description)
        .bind(record.category_id)
        .bind(&record.category_code)
        .bind(&record.version_label)
        .bind(&record.provider)
        .bind(record.implementation_type.as_str())
        .bind(record.visibility.as_str())
        .bind(record.manifest.clone())
        .bind(record.install_status.as_str())
        .bind(record.lifecycle_status.as_db_code())
        .bind(tags_json)
        .bind(role_codes_json)
        .bind(record.version)
        .bind(operator_id as i64)
        .bind(operator_id as i64)
        .fetch_one(pool)
        .await
        .map_err(map_sqlx)?;
    row_to_plugin(&row)
}

pub async fn update_plugin(
    pool: &PgPool,
    tenant_id: u64,
    operator_id: u64,
    plugin_key: &str,
    record: PluginRecord,
) -> PluginsResult<PluginRecord> {
    let tags_json = bind_string_list(&record.tags, "tags")?;
    let role_codes_json = bind_string_list(&record.allowed_role_codes, "allowed_role_codes")?;
    let query = format!(
        r#"
        UPDATE ai_plugin SET
            name = $3,
            description = $4,
            category_id = $5,
            category_code = $6,
            version_label = $7,
            provider = $8,
            implementation_type = $9,
            visibility = $10,
            manifest_json = $11,
            install_status = $12,
            lifecycle_status = $13,
            tags_json = $14,
            allowed_role_codes_json = $15,
            version = ai_plugin.version + 1,
            updated_by = $16,
            updated_at = CURRENT_TIMESTAMP
        WHERE tenant_id = $1 AND plugin_key = $2 AND deleted_at IS NULL
        RETURNING {PLUGIN_SELECT}
        "#
    );
    let row = sqlx::query(sqlx::AssertSqlSafe(query.as_str()))
        .bind(tenant_id as i64)
        .bind(plugin_key)
        .bind(&record.name)
        .bind(&record.description)
        .bind(record.category_id)
        .bind(&record.category_code)
        .bind(&record.version_label)
        .bind(&record.provider)
        .bind(record.implementation_type.as_str())
        .bind(record.visibility.as_str())
        .bind(record.manifest.clone())
        .bind(record.install_status.as_str())
        .bind(record.lifecycle_status.as_db_code())
        .bind(tags_json)
        .bind(role_codes_json)
        .bind(operator_id as i64)
        .fetch_optional(pool)
        .await
        .map_err(map_sqlx)?;
    row.as_ref()
        .map(row_to_plugin)
        .transpose()?
        .ok_or_else(|| PluginsServiceError::NotFound(plugin_key.to_string()))
}

pub async fn delete_plugin(
    pool: &PgPool,
    tenant_id: u64,
    plugin_key: &str,
) -> PluginsResult<PluginRecord> {
    let query = format!(
        r#"
        UPDATE ai_plugin
        SET lifecycle_status = 4, deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
        WHERE tenant_id = $1 AND plugin_key = $2 AND deleted_at IS NULL
        RETURNING {PLUGIN_SELECT}
        "#
    );
    let row = sqlx::query(sqlx::AssertSqlSafe(query.as_str()))
        .bind(tenant_id as i64)
        .bind(plugin_key)
        .fetch_optional(pool)
        .await
        .map_err(map_sqlx)?;
    row.as_ref()
        .map(row_to_plugin)
        .transpose()?
        .ok_or_else(|| PluginsServiceError::NotFound(plugin_key.to_string()))
}

fn bind_string_list(
    items: &[String],
    field: &str,
) -> PluginsResult<serde_json::Value> {
    let encoded = string_list_to_json(items, field)?;
    serde_json::from_str(&encoded).map_err(|error| {
        PluginsServiceError::Repository(format!("encode {field} json failed: {error}"))
    })
}
