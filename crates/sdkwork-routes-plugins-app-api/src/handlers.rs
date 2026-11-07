use sdkwork_plugins_contract::{PluginCategoryRecord, PluginRecord};
use sdkwork_utils_rust::{SdkWorkPageData, SdkWorkResourceData};

use crate::list_query::SdkWorkListQuery;
use crate::response::{item_data, paginate_items, ApiResult};

pub async fn list_plugins<R: sdkwork_intelligence_plugins_service::PluginsRepository>(
    service: &sdkwork_intelligence_plugins_service::PluginsService<R>,
    tenant_id: u64,
    query: &SdkWorkListQuery,
) -> ApiResult<SdkWorkPageData<PluginRecord>> {
    query.validate()?;
    let items = service.list_plugins(tenant_id).await?;
    Ok(paginate_items(filter_plugins(items, query), query))
}

pub async fn retrieve_plugin<R: sdkwork_intelligence_plugins_service::PluginsRepository>(
    service: &sdkwork_intelligence_plugins_service::PluginsService<R>,
    tenant_id: u64,
    plugin_key: &str,
) -> ApiResult<SdkWorkResourceData<PluginRecord>> {
    let record = service.get_plugin(tenant_id, plugin_key).await?;
    Ok(item_data(record))
}

pub async fn list_categories<R: sdkwork_intelligence_plugins_service::PluginsRepository>(
    service: &sdkwork_intelligence_plugins_service::PluginsService<R>,
    tenant_id: u64,
    query: &SdkWorkListQuery,
) -> ApiResult<SdkWorkPageData<PluginCategoryRecord>> {
    query.validate()?;
    let items = service.list_categories(tenant_id).await?;
    Ok(paginate_items(filter_categories(items, query), query))
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
            || item
                .tags
                .iter()
                .any(|tag| tag.to_lowercase().contains(keyword))
    })
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
