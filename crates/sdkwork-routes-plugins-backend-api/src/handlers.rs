//! Handler-facing helpers re-exported by the crate root. Business logic lives
//! in the service crate; these thin wrappers keep the HTTP layer declarative.

use sdkwork_intelligence_plugins_service::{PluginsService, UpsertPluginCategoryCommand};
use sdkwork_plugins_contract::{PluginCategoryRecord, PluginRecord};
use sdkwork_utils_rust::{SdkWorkPageData, SdkWorkResourceData};

use crate::list_query::SdkWorkListQuery;
use crate::response::{item_data, page_data_from_total, ApiResult};

/// Blank category record in the shape the service expects on upsert.
pub fn default_category_record(category_code: String, name: String) -> PluginCategoryRecord {
    PluginCategoryRecord {
        id: 0,
        uuid: String::new(),
        category_code,
        name,
        description: None,
        sort_order: 0,
        lifecycle_status: sdkwork_plugins_contract::PluginLifecycleStatus::Active,
        version: 0,
        created_at: String::new(),
        updated_at: String::new(),
    }
}

/// Blank plugin record in the shape the service expects on create.
pub fn default_plugin_record(
    plugin_key: String,
    name: String,
    implementation_type: sdkwork_plugins_contract::PluginImplementationType,
    visibility: sdkwork_plugins_contract::PluginVisibility,
) -> PluginRecord {
    PluginRecord {
        id: 0,
        uuid: String::new(),
        organization_id: 0,
        owner_user_id: 0,
        plugin_key,
        name,
        description: None,
        category_id: None,
        category_code: None,
        version_label: "0.0.1".to_string(),
        provider: None,
        implementation_type,
        visibility,
        manifest: serde_json::json!({}),
        source: None,
        install_status: sdkwork_plugins_contract::PluginInstallStatus::Available,
        tags: vec![],
        allowed_role_codes: vec![],
        lifecycle_status: sdkwork_plugins_contract::PluginLifecycleStatus::Active,
        version: 0,
        created_at: String::new(),
        updated_at: String::new(),
    }
}

pub async fn list_categories<R: sdkwork_intelligence_plugins_service::PluginsRepository>(
    service: &PluginsService<R>,
    tenant_id: u64,
    query: &SdkWorkListQuery,
) -> ApiResult<SdkWorkPageData<PluginCategoryRecord>> {
    query.validate()?;
    // The store filters, orders and counts before it cuts the page; the total
    // is the admin inventory size rather than the page length.
    let (limit, offset) = page_window(query);
    let (items, total) = service
        .list_categories_page(
            tenant_id,
            &query.catalog_filter(),
            query.search_keyword(),
            limit,
            offset,
        )
        .await?;
    Ok(page_data_from_total(items, total, query))
}

/// `(limit, offset)` window handed to the store paged query.
fn page_window(query: &SdkWorkListQuery) -> (i64, i64) {
    let limit = i64::from(query.effective_page_size());
    let offset = (i64::from(query.effective_page()) - 1) * limit;
    (limit, offset)
}

pub async fn upsert_category<R: sdkwork_intelligence_plugins_service::PluginsRepository>(
    service: &PluginsService<R>,
    tenant_id: u64,
    operator_id: u64,
    command: UpsertPluginCategoryCommand,
) -> ApiResult<SdkWorkResourceData<PluginCategoryRecord>> {
    let saved = service
        .upsert_category(tenant_id, operator_id, command)
        .await?;
    Ok(item_data(saved))
}

pub async fn list_plugins<R: sdkwork_intelligence_plugins_service::PluginsRepository>(
    service: &PluginsService<R>,
    tenant_id: u64,
    query: &SdkWorkListQuery,
) -> ApiResult<SdkWorkPageData<PluginRecord>> {
    query.validate()?;
    let (limit, offset) = page_window(query);
    let (items, total) = service
        .list_plugins_page(
            tenant_id,
            &query.catalog_filter(),
            query.search_keyword(),
            limit,
            offset,
        )
        .await?;
    Ok(page_data_from_total(items, total, query))
}

pub async fn create_plugin<R: sdkwork_intelligence_plugins_service::PluginsRepository>(
    service: &PluginsService<R>,
    tenant_id: u64,
    organization_id: u64,
    operator_id: u64,
    command: sdkwork_intelligence_plugins_service::CreatePluginCommand,
) -> ApiResult<SdkWorkResourceData<PluginRecord>> {
    let created = service
        .create_plugin(tenant_id, organization_id, operator_id, command)
        .await?;
    Ok(item_data(created))
}

pub async fn update_plugin<R: sdkwork_intelligence_plugins_service::PluginsRepository>(
    service: &PluginsService<R>,
    tenant_id: u64,
    operator_id: u64,
    plugin_key: &str,
    command: sdkwork_intelligence_plugins_service::UpdatePluginCommand,
) -> ApiResult<SdkWorkResourceData<PluginRecord>> {
    let updated = service
        .update_plugin(tenant_id, operator_id, plugin_key, command)
        .await?;
    Ok(item_data(updated))
}

pub async fn delete_plugin<R: sdkwork_intelligence_plugins_service::PluginsRepository>(
    service: &PluginsService<R>,
    tenant_id: u64,
    plugin_key: &str,
) -> ApiResult<()> {
    service.delete_plugin(tenant_id, plugin_key).await?;
    Ok(())
}
