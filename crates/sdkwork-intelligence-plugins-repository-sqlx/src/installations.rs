use sdkwork_id_core::SnowflakeIdGenerator;
use sdkwork_intelligence_plugins_service::{PluginsResult, PluginsServiceError};
use sdkwork_plugins_contract::{PluginInstallationRecord, PluginInstallationStatus};
use sdkwork_utils_rust::uuid;
use sqlx::{PgPool, Row};

use crate::entity_ids::new_plugins_snowflake_id;
use crate::json_util::timestamp_to_rfc3339;

fn map_sqlx(error: sqlx::Error) -> PluginsServiceError {
    PluginsServiceError::Repository(error.to_string())
}

fn row_to_installation(row: &sqlx::postgres::PgRow) -> PluginsResult<PluginInstallationRecord> {
    let status = match row
        .try_get::<String, _>("status")
        .map_err(map_sqlx)?
        .as_str()
    {
        "installed" => PluginInstallationStatus::Installed,
        "removed" => PluginInstallationStatus::Removed,
        value => {
            return Err(PluginsServiceError::Repository(format!(
                "invalid installation status: {value}"
            )))
        }
    };
    let snapshot = row
        .try_get::<serde_json::Value, _>("catalog_snapshot_json")
        .map_err(map_sqlx)?;
    Ok(PluginInstallationRecord {
        id: row.try_get("id").map_err(map_sqlx)?,
        host_id: row.try_get("host_id").map_err(map_sqlx)?,
        plugin_key: row.try_get("plugin_key").map_err(map_sqlx)?,
        package_name: row.try_get("package_name").map_err(map_sqlx)?,
        version: row.try_get("installed_version").map_err(map_sqlx)?,
        install_spec: row.try_get("install_spec").map_err(map_sqlx)?,
        status,
        catalog_revision: row.try_get("catalog_revision").map_err(map_sqlx)?,
        snapshot: serde_json::from_value(snapshot).map_err(|error| {
            PluginsServiceError::Repository(format!("decode installation snapshot: {error}"))
        })?,
        synchronized_at: timestamp_to_rfc3339(row.try_get("synchronized_at").map_err(map_sqlx)?),
        removed_at: row
            .try_get::<Option<chrono::DateTime<chrono::Utc>>, _>("removed_at")
            .map_err(map_sqlx)?
            .map(timestamp_to_rfc3339),
    })
}

pub async fn get_installation(
    pool: &PgPool,
    tenant_id: u64,
    organization_id: u64,
    user_id: u64,
    host_id: &str,
    plugin_key: &str,
) -> PluginsResult<Option<PluginInstallationRecord>> {
    let row = sqlx::query(sqlx::AssertSqlSafe(
        "SELECT id, host_id, plugin_key, package_name, installed_version, install_spec, status, \
         catalog_revision, catalog_snapshot_json, synchronized_at, removed_at \
         FROM ai_plugin_installation \
         WHERE tenant_id = $1 AND organization_id = $2 AND user_id = $3 AND host_id = $4 AND plugin_key = $5",
    ))
    .bind(tenant_id as i64)
    .bind(organization_id as i64)
    .bind(user_id as i64)
    .bind(host_id)
    .bind(plugin_key)
    .fetch_optional(pool)
    .await
    .map_err(map_sqlx)?;
    row.as_ref().map(row_to_installation).transpose()
}

pub async fn sync_installation(
    pool: &PgPool,
    id_generator: &SnowflakeIdGenerator,
    tenant_id: u64,
    organization_id: u64,
    user_id: u64,
    record: PluginInstallationRecord,
) -> PluginsResult<PluginInstallationRecord> {
    let snapshot = serde_json::to_value(&record.snapshot).map_err(|error| {
        PluginsServiceError::Repository(format!("encode installation snapshot: {error}"))
    })?;
    let mut transaction = pool.begin().await.map_err(map_sqlx)?;
    let existing_id = sqlx::query(sqlx::AssertSqlSafe(
        "SELECT id FROM ai_plugin_installation \
         WHERE tenant_id = $1 AND organization_id = $2 AND user_id = $3 AND host_id = $4 AND plugin_key = $5 \
         FOR UPDATE",
    ))
    .bind(tenant_id as i64)
    .bind(organization_id as i64)
    .bind(user_id as i64)
    .bind(&record.host_id)
    .bind(&record.plugin_key)
    .fetch_optional(&mut *transaction)
    .await
    .map_err(map_sqlx)?
    .map(|row| row.try_get::<i64, _>("id"))
    .transpose()
    .map_err(map_sqlx)?;
    let id = existing_id.unwrap_or_else(|| new_plugins_snowflake_id(id_generator));
    let row = sqlx::query(sqlx::AssertSqlSafe(
        "INSERT INTO ai_plugin_installation (\
         id, uuid, tenant_id, organization_id, user_id, host_id, plugin_id, plugin_key, package_name, \
         installed_version, install_spec, status, catalog_revision, catalog_snapshot_json, \
         synchronized_at, removed_at, version, updated_at\
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, CURRENT_TIMESTAMP, \
         CASE WHEN $12 = 'removed' THEN CURRENT_TIMESTAMP ELSE NULL END, 1, CURRENT_TIMESTAMP) \
         ON CONFLICT (tenant_id, organization_id, user_id, host_id, plugin_key) DO UPDATE SET \
         plugin_id = EXCLUDED.plugin_id, package_name = EXCLUDED.package_name, \
         installed_version = EXCLUDED.installed_version, install_spec = EXCLUDED.install_spec, \
         status = EXCLUDED.status, catalog_revision = EXCLUDED.catalog_revision, \
         catalog_snapshot_json = EXCLUDED.catalog_snapshot_json, synchronized_at = CURRENT_TIMESTAMP, \
         removed_at = EXCLUDED.removed_at, version = ai_plugin_installation.version + 1, \
         updated_at = CURRENT_TIMESTAMP \
         RETURNING id, host_id, plugin_key, package_name, installed_version, install_spec, status, \
         catalog_revision, catalog_snapshot_json, synchronized_at, removed_at",
    ))
    .bind(id)
    .bind(uuid())
    .bind(tenant_id as i64)
    .bind(organization_id as i64)
    .bind(user_id as i64)
    .bind(&record.host_id)
    .bind(record.snapshot.id)
    .bind(&record.plugin_key)
    .bind(&record.package_name)
    .bind(&record.version)
    .bind(&record.install_spec)
    .bind(record.status.as_str())
    .bind(&record.catalog_revision)
    .bind(snapshot)
    .fetch_one(&mut *transaction)
    .await
    .map_err(map_sqlx)?;
    let stored = row_to_installation(&row)?;
    transaction.commit().await.map_err(map_sqlx)?;
    Ok(stored)
}
