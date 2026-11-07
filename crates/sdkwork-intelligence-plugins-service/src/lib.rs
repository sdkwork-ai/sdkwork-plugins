//! Plugins domain service: command validation, record assembly, and the
//! repository contract shared by the in-memory and SQLx implementations.

mod commands;
mod in_memory;
mod validation;

use async_trait::async_trait;
use thiserror::Error;

pub use commands::{CreatePluginCommand, UpdatePluginCommand, UpsertPluginCategoryCommand};
pub use in_memory::InMemoryPluginRepository;
use sdkwork_plugins_contract::{PluginCategoryRecord, PluginRecord};

#[derive(Debug, Error)]
pub enum PluginsServiceError {
    #[error("not found: {0}")]
    NotFound(String),
    #[error("invalid argument: {0}")]
    InvalidArgument(String),
    #[error("repository error: {0}")]
    Repository(String),
}

pub type PluginsResult<T> = Result<T, PluginsServiceError>;

/// Persistence contract for plugin categories and plugins. Tenant and operator
/// identities are explicit parameters: the wire records stay projection-only.
#[async_trait]
pub trait PluginsRepository: Send + Sync {
    async fn list_categories(&self, tenant_id: u64) -> PluginsResult<Vec<PluginCategoryRecord>>;

    async fn get_category(
        &self,
        tenant_id: u64,
        category_code: &str,
    ) -> PluginsResult<PluginCategoryRecord>;

    async fn upsert_category(
        &self,
        tenant_id: u64,
        operator_id: u64,
        record: PluginCategoryRecord,
    ) -> PluginsResult<PluginCategoryRecord>;

    async fn list_plugins(&self, tenant_id: u64) -> PluginsResult<Vec<PluginRecord>>;

    async fn get_plugin(&self, tenant_id: u64, plugin_key: &str) -> PluginsResult<PluginRecord>;

    async fn create_plugin(
        &self,
        tenant_id: u64,
        operator_id: u64,
        record: PluginRecord,
    ) -> PluginsResult<PluginRecord>;

    async fn update_plugin(
        &self,
        tenant_id: u64,
        operator_id: u64,
        plugin_key: &str,
        record: PluginRecord,
    ) -> PluginsResult<PluginRecord>;

    async fn delete_plugin(&self, tenant_id: u64, plugin_key: &str)
        -> PluginsResult<PluginRecord>;
}

pub struct PluginsService<R: PluginsRepository> {
    repository: R,
}

impl<R: PluginsRepository> PluginsService<R> {
    pub fn new(repository: R) -> Self {
        Self { repository }
    }

    pub async fn list_categories(
        &self,
        tenant_id: u64,
    ) -> PluginsResult<Vec<PluginCategoryRecord>> {
        self.repository.list_categories(tenant_id).await
    }

    pub async fn get_category(
        &self,
        tenant_id: u64,
        category_code: &str,
    ) -> PluginsResult<PluginCategoryRecord> {
        validation::validate_category_code(category_code)?;
        self.repository.get_category(tenant_id, category_code).await
    }

    pub async fn upsert_category(
        &self,
        tenant_id: u64,
        operator_id: u64,
        command: UpsertPluginCategoryCommand,
    ) -> PluginsResult<PluginCategoryRecord> {
        let record = validation::category_record_from_command(tenant_id, operator_id, &command)?;
        self.repository
            .upsert_category(tenant_id, operator_id, record)
            .await
    }

    pub async fn list_plugins(&self, tenant_id: u64) -> PluginsResult<Vec<PluginRecord>> {
        self.repository.list_plugins(tenant_id).await
    }

    pub async fn get_plugin(&self, tenant_id: u64, plugin_key: &str) -> PluginsResult<PluginRecord> {
        validation::validate_plugin_key(plugin_key)?;
        self.repository.get_plugin(tenant_id, plugin_key).await
    }

    pub async fn create_plugin(
        &self,
        tenant_id: u64,
        operator_id: u64,
        command: CreatePluginCommand,
    ) -> PluginsResult<PluginRecord> {
        let record = validation::plugin_record_from_create(tenant_id, operator_id, &command)?;
        if self.repository.get_plugin(tenant_id, &record.plugin_key).await.is_ok() {
            return Err(PluginsServiceError::InvalidArgument(format!(
                "plugin_key already exists: {}",
                record.plugin_key
            )));
        }
        self.repository
            .create_plugin(tenant_id, operator_id, record)
            .await
    }

    pub async fn update_plugin(
        &self,
        tenant_id: u64,
        operator_id: u64,
        plugin_key: &str,
        command: UpdatePluginCommand,
    ) -> PluginsResult<PluginRecord> {
        validation::validate_plugin_key(plugin_key)?;
        validation::validate_update_command(&command)?;
        let mut record = self.repository.get_plugin(tenant_id, plugin_key).await?;
        validation::apply_update(&mut record, &command);
        self.repository
            .update_plugin(tenant_id, operator_id, plugin_key, record)
            .await
    }

    pub async fn delete_plugin(
        &self,
        tenant_id: u64,
        plugin_key: &str,
    ) -> PluginsResult<PluginRecord> {
        validation::validate_plugin_key(plugin_key)?;
        self.repository.delete_plugin(tenant_id, plugin_key).await
    }
}

/// Shared service handle used by route states and the API assembly.
pub type SharedPluginsService<R> = std::sync::Arc<PluginsService<R>>;
