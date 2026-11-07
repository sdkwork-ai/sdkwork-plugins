mod entity_ids;
mod json_util;
mod postgres;

use std::sync::Arc;

use async_trait::async_trait;
use sdkwork_id_core::SnowflakeIdGenerator;
use sdkwork_intelligence_plugins_service::{PluginsRepository, PluginsResult};
use sdkwork_plugins_contract::{PluginCategoryRecord, PluginRecord};
use sqlx::PgPool;

/// PostgreSQL-backed plugins repository over the `ai_plugin_category` and
/// `ai_plugin` tables. Snowflake ids are minted by the caller-provided
/// generator (owned by the database host, matching the MCP composition).
#[derive(Clone)]
pub struct SqlxPluginsRepository {
    pool: PgPool,
    id_generator: Arc<SnowflakeIdGenerator>,
}

impl SqlxPluginsRepository {
    pub fn new(pool: PgPool, id_generator: Arc<SnowflakeIdGenerator>) -> Self {
        Self {
            pool,
            id_generator,
        }
    }

    pub fn pool(&self) -> &PgPool {
        &self.pool
    }

    pub fn id_generator(&self) -> Arc<SnowflakeIdGenerator> {
        self.id_generator.clone()
    }
}

#[async_trait]
impl PluginsRepository for SqlxPluginsRepository {
    async fn list_categories(&self, tenant_id: u64) -> PluginsResult<Vec<PluginCategoryRecord>> {
        postgres::list_categories(&self.pool, tenant_id).await
    }

    async fn get_category(
        &self,
        tenant_id: u64,
        category_code: &str,
    ) -> PluginsResult<PluginCategoryRecord> {
        postgres::get_category(&self.pool, tenant_id, category_code).await
    }

    async fn upsert_category(
        &self,
        tenant_id: u64,
        operator_id: u64,
        record: PluginCategoryRecord,
    ) -> PluginsResult<PluginCategoryRecord> {
        postgres::upsert_category(&self.pool, &self.id_generator, tenant_id, operator_id, record)
            .await
    }

    async fn list_plugins(&self, tenant_id: u64) -> PluginsResult<Vec<PluginRecord>> {
        postgres::list_plugins(&self.pool, tenant_id).await
    }

    async fn get_plugin(&self, tenant_id: u64, plugin_key: &str) -> PluginsResult<PluginRecord> {
        postgres::get_plugin(&self.pool, tenant_id, plugin_key).await
    }

    async fn create_plugin(
        &self,
        tenant_id: u64,
        operator_id: u64,
        record: PluginRecord,
    ) -> PluginsResult<PluginRecord> {
        postgres::create_plugin(&self.pool, &self.id_generator, tenant_id, operator_id, record)
            .await
    }

    async fn update_plugin(
        &self,
        tenant_id: u64,
        operator_id: u64,
        plugin_key: &str,
        record: PluginRecord,
    ) -> PluginsResult<PluginRecord> {
        postgres::update_plugin(&self.pool, tenant_id, operator_id, plugin_key, record).await
    }

    async fn delete_plugin(
        &self,
        tenant_id: u64,
        plugin_key: &str,
    ) -> PluginsResult<PluginRecord> {
        postgres::delete_plugin(&self.pool, tenant_id, plugin_key).await
    }
}
