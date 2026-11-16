//! Plugins domain service: command validation, record assembly, and the
//! repository contract shared by the in-memory and SQLx implementations.

mod commands;
mod in_memory;
mod validation;

#[cfg(test)]
mod validation_tests;

use async_trait::async_trait;
use thiserror::Error;

pub use commands::{CreatePluginCommand, UpdatePluginCommand, UpsertPluginCategoryCommand};
pub use in_memory::InMemoryPluginRepository;
use sdkwork_plugins_contract::{PluginCategoryRecord, PluginRecord};
use sdkwork_utils_rust::CatalogViewFilter;

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

    /// Paged admin categories: `filter` and `keyword` narrow in the store and
    /// the returned total is the filtered row count, not the page length.
    async fn list_categories_page(
        &self,
        tenant_id: u64,
        filter: &CatalogViewFilter,
        keyword: Option<&str>,
        limit: i64,
        offset: i64,
    ) -> PluginsResult<(Vec<PluginCategoryRecord>, i64)>;

    /// Catalog-visible categories: only `active` rows, in registry order.
    ///
    /// The marketplace surface lists the taxonomy a visitor can actually file
    /// against; draft, disabled and archived categories stay admin-only.
    async fn list_catalog_categories(
        &self,
        tenant_id: u64,
    ) -> PluginsResult<Vec<PluginCategoryRecord>>;

    /// Paged catalog-visible categories; the total is the filtered, visible
    /// row count so `pageInfo.totalItems` never counts admin-only rows.
    async fn list_catalog_categories_page(
        &self,
        tenant_id: u64,
        filter: &CatalogViewFilter,
        keyword: Option<&str>,
        limit: i64,
        offset: i64,
    ) -> PluginsResult<(Vec<PluginCategoryRecord>, i64)>;

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

    /// Paged admin plugins: the store applies the catalog view filter and the
    /// keyword, orders the filtered set, and returns its total row count.
    async fn list_plugins_page(
        &self,
        tenant_id: u64,
        filter: &CatalogViewFilter,
        keyword: Option<&str>,
        limit: i64,
        offset: i64,
    ) -> PluginsResult<(Vec<PluginRecord>, i64)>;

    /// Catalog-visible plugins: only `active` rows.
    ///
    /// The marketplace lists what a visitor can install; draft, disabled and
    /// archived plugins stay admin-only.
    async fn list_catalog_plugins(&self, tenant_id: u64) -> PluginsResult<Vec<PluginRecord>>;

    /// Paged catalog-visible plugins; the total is the filtered, visible row
    /// count so `pageInfo.totalItems` never counts admin-only rows.
    async fn list_catalog_plugins_page(
        &self,
        tenant_id: u64,
        filter: &CatalogViewFilter,
        keyword: Option<&str>,
        limit: i64,
        offset: i64,
    ) -> PluginsResult<(Vec<PluginRecord>, i64)>;

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

    async fn delete_plugin(&self, tenant_id: u64, plugin_key: &str) -> PluginsResult<PluginRecord>;
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

    /// Catalog-visible categories for the marketplace surface.
    pub async fn list_catalog_categories(
        &self,
        tenant_id: u64,
    ) -> PluginsResult<Vec<PluginCategoryRecord>> {
        self.repository.list_catalog_categories(tenant_id).await
    }

    /// One admin category page with store-side filtering and the filtered total.
    pub async fn list_categories_page(
        &self,
        tenant_id: u64,
        filter: &CatalogViewFilter,
        keyword: Option<&str>,
        limit: i64,
        offset: i64,
    ) -> PluginsResult<(Vec<PluginCategoryRecord>, i64)> {
        self.repository
            .list_categories_page(tenant_id, filter, keyword, limit, offset)
            .await
    }

    /// One marketplace category page; admin-only rows never reach the total.
    pub async fn list_catalog_categories_page(
        &self,
        tenant_id: u64,
        filter: &CatalogViewFilter,
        keyword: Option<&str>,
        limit: i64,
        offset: i64,
    ) -> PluginsResult<(Vec<PluginCategoryRecord>, i64)> {
        self.repository
            .list_catalog_categories_page(tenant_id, filter, keyword, limit, offset)
            .await
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

    /// One admin plugin page with store-side filtering and the filtered total.
    pub async fn list_plugins_page(
        &self,
        tenant_id: u64,
        filter: &CatalogViewFilter,
        keyword: Option<&str>,
        limit: i64,
        offset: i64,
    ) -> PluginsResult<(Vec<PluginRecord>, i64)> {
        self.repository
            .list_plugins_page(tenant_id, filter, keyword, limit, offset)
            .await
    }

    /// Catalog-visible plugins for the marketplace surface.
    pub async fn list_catalog_plugins(&self, tenant_id: u64) -> PluginsResult<Vec<PluginRecord>> {
        self.repository.list_catalog_plugins(tenant_id).await
    }

    /// One marketplace plugin page; admin-only rows never reach the total.
    pub async fn list_catalog_plugins_page(
        &self,
        tenant_id: u64,
        filter: &CatalogViewFilter,
        keyword: Option<&str>,
        limit: i64,
        offset: i64,
    ) -> PluginsResult<(Vec<PluginRecord>, i64)> {
        self.repository
            .list_catalog_plugins_page(tenant_id, filter, keyword, limit, offset)
            .await
    }

    pub async fn get_plugin(
        &self,
        tenant_id: u64,
        plugin_key: &str,
    ) -> PluginsResult<PluginRecord> {
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
        if self
            .repository
            .get_plugin(tenant_id, &record.plugin_key)
            .await
            .is_ok()
        {
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
