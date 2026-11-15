use sdkwork_plugins_contract::{
    category_matches, role_scope_allows, PluginCategoryRecord, PluginRecord,
};
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
    let category = query.category_filter();
    let role_scope = query.role_scope();
    let items = items
        .into_iter()
        .filter(|item| match category.as_deref() {
            Some(code) => category_matches(item.category_code.as_deref(), code),
            None => true,
        })
        .filter(|item| role_scope_allows(&item.allowed_role_codes, &role_scope))
        .collect();
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

#[cfg(test)]
mod tests {
    use sdkwork_plugins_contract::{
        PluginImplementationType, PluginInstallStatus, PluginLifecycleStatus, PluginVisibility,
    };

    use super::*;

    fn plugin(key: &str, category: Option<&str>, roles: &[&str]) -> PluginRecord {
        PluginRecord {
            id: 1,
            uuid: String::new(),
            plugin_key: key.to_string(),
            name: key.to_string(),
            description: None,
            category_id: None,
            category_code: category.map(str::to_string),
            version_label: "1.0.0".to_string(),
            provider: None,
            implementation_type: PluginImplementationType::SdkworkNative,
            visibility: PluginVisibility::Tenant,
            manifest: serde_json::json!({}),
            source: None,
            install_status: PluginInstallStatus::Available,
            tags: vec![],
            allowed_role_codes: roles.iter().map(|role| role.to_string()).collect(),
            lifecycle_status: PluginLifecycleStatus::Active,
            version: 0,
            created_at: String::new(),
            updated_at: String::new(),
        }
    }

    fn keys(items: &[PluginRecord]) -> Vec<&str> {
        items.iter().map(|item| item.plugin_key.as_str()).collect()
    }

    fn query(category_code: Option<&str>, role_codes: Option<&str>) -> SdkWorkListQuery {
        SdkWorkListQuery {
            category_code: category_code.map(str::to_string),
            role_codes: role_codes.map(str::to_string),
            ..Default::default()
        }
    }

    fn catalog() -> Vec<PluginRecord> {
        vec![
            plugin("search", Some("data-retrieval"), &[]),
            plugin("ocr", Some("image-processing"), &[]),
            plugin("audit", Some("document-processing"), &["org_auditor"]),
        ]
    }

    #[test]
    fn all_view_keeps_every_category_and_role() {
        let filtered = filter_plugins(catalog(), &query(None, None));
        assert_eq!(keys(&filtered), vec!["search", "ocr", "audit"]);
    }

    #[test]
    fn category_filter_keeps_only_the_selected_category() {
        let filtered = filter_plugins(catalog(), &query(Some("image-processing"), None));
        assert_eq!(keys(&filtered), vec!["ocr"]);

        let all_selector = filter_plugins(catalog(), &query(Some("all"), None));
        assert_eq!(keys(&all_selector), vec!["search", "ocr", "audit"]);
    }

    #[test]
    fn role_scope_keeps_open_plugins_and_the_named_role() {
        let operator = filter_plugins(catalog(), &query(None, Some("org_auditor")));
        assert_eq!(keys(&operator), vec!["search", "ocr", "audit"]);

        let other_role = filter_plugins(catalog(), &query(None, Some("org_operations")));
        assert_eq!(keys(&other_role), vec!["search", "ocr"]);
    }

    #[test]
    fn category_and_role_filters_compose() {
        let filtered = filter_plugins(catalog(), &query(Some("document-processing"), Some("org_admin")));
        assert!(filtered.is_empty());
    }
}

