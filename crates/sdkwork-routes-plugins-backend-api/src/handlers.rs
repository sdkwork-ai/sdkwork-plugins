//! Handler-facing helpers re-exported by the crate root. Business logic lives
//! in the service crate; these thin wrappers keep the HTTP layer declarative.

use sdkwork_intelligence_plugins_service::{
    PluginsService, UpsertPluginCategoryCommand,
};
use sdkwork_plugins_contract::{PluginCategoryRecord, PluginRecord};
use sdkwork_utils_rust::{SdkWorkPageData, SdkWorkResourceData};

use crate::list_query::SdkWorkListQuery;
use crate::response::{item_data, paginate_items, ApiResult};

/// Blank category record in the shape the service expects on upsert.
pub fn default_category_record(
    category_code: String,
    name: String,
) -> PluginCategoryRecord {
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
    let items = service.list_categories(tenant_id).await?;
    Ok(paginate_items(filter_categories(items, query), query))
}

pub async fn upsert_category<R: sdkwork_intelligence_plugins_service::PluginsRepository>(
    service: &PluginsService<R>,
    tenant_id: u64,
    operator_id: u64,
    command: UpsertPluginCategoryCommand,
) -> ApiResult<SdkWorkResourceData<PluginCategoryRecord>> {
    let saved = service.upsert_category(tenant_id, operator_id, command).await?;
    Ok(item_data(saved))
}

pub async fn list_plugins<R: sdkwork_intelligence_plugins_service::PluginsRepository>(
    service: &PluginsService<R>,
    tenant_id: u64,
    query: &SdkWorkListQuery,
) -> ApiResult<SdkWorkPageData<PluginRecord>> {
    query.validate()?;
    let items = service.list_plugins(tenant_id).await?;
    Ok(paginate_items(filter_plugins(items, query), query))
}

pub async fn create_plugin<R: sdkwork_intelligence_plugins_service::PluginsRepository>(
    service: &PluginsService<R>,
    tenant_id: u64,
    operator_id: u64,
    command: sdkwork_intelligence_plugins_service::CreatePluginCommand,
) -> ApiResult<SdkWorkResourceData<PluginRecord>> {
    let created = service.create_plugin(tenant_id, operator_id, command).await?;
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

fn filter_by_keyword<T, F>(items: Vec<T>, query: &SdkWorkListQuery, matches: F) -> Vec<T>
where
    F: Fn(&T, &str) -> bool,
{
    let Some(keyword) = query.search_keyword() else {
        return items;
    };
    let keyword = keyword.to_lowercase();
    items
        .into_iter()
        .filter(|item| matches(item, keyword.as_str()))
        .collect()
}

fn filter_categories(
    items: Vec<PluginCategoryRecord>,
    query: &SdkWorkListQuery,
) -> Vec<PluginCategoryRecord> {
    filter_by_keyword(items, query, |item, keyword| {
        item.name.to_lowercase().contains(keyword)
            || item.category_code.to_lowercase().contains(keyword)
    })
}

fn filter_plugins(items: Vec<PluginRecord>, query: &SdkWorkListQuery) -> Vec<PluginRecord> {
    filter_by_keyword(items, query, |item, keyword| {
        item.name.to_lowercase().contains(keyword)
            || item.plugin_key.to_lowercase().contains(keyword)
            || item
                .description
                .as_deref()
                .unwrap_or("")
                .to_lowercase()
                .contains(keyword)
            || item
                .category_code
                .as_deref()
                .unwrap_or("")
                .to_lowercase()
                .contains(keyword)
            || item.provider.as_deref().unwrap_or("").to_lowercase().contains(keyword)
            || item
                .tags
                .iter()
                .any(|tag| tag.to_lowercase().contains(keyword))
    })
}
