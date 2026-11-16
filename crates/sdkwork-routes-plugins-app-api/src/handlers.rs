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
    // The marketplace lists what a visitor can install: only active plugins.
    let items = service.list_catalog_plugins(tenant_id).await?;
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
    // The marketplace lists the taxonomy a visitor can file against: only
    // active categories, in registry order. Archived/draft categories stay
    // visible to the backend administration surface only.
    let items = service.list_catalog_categories(tenant_id).await?;
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
    let filter = query.catalog_filter();
    let items = items
        .into_iter()
        .filter(|item| filter.allows(item.category_code.as_deref(), &item.allowed_role_codes))
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
    use sdkwork_utils_rust::CatalogViewQuery;

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
            catalog: CatalogViewQuery {
                category_code: category_code.map(str::to_string),
                role_codes: role_codes.map(str::to_string),
            },
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
        let filtered = filter_plugins(
            catalog(),
            &query(Some("document-processing"), Some("org_admin")),
        );
        assert!(filtered.is_empty());
    }

    fn category(code: &str, status: PluginLifecycleStatus) -> PluginCategoryRecord {
        PluginCategoryRecord {
            id: 1,
            uuid: String::new(),
            category_code: code.to_string(),
            name: code.to_string(),
            description: None,
            sort_order: 10,
            lifecycle_status: status,
            version: 0,
            created_at: String::new(),
            updated_at: String::new(),
        }
    }

    #[tokio::test]
    async fn marketplace_categories_keep_only_active_registry_rows() {
        use sdkwork_intelligence_plugins_service::{
            InMemoryPluginRepository, PluginsRepository, PluginsService,
        };

        let repository = InMemoryPluginRepository::default();
        for row in [
            category("code-development", PluginLifecycleStatus::Active),
            category("data-retrieval", PluginLifecycleStatus::Draft),
            category("business-apps", PluginLifecycleStatus::Archived),
        ] {
            repository
                .upsert_category(7, 1, row)
                .await
                .expect("seed category");
        }
        let service = PluginsService::new(repository);

        // The administration surface still sees the whole registry...
        let admin = service.list_categories(7).await.expect("admin categories");
        assert_eq!(admin.len(), 3);

        // ...while the marketplace lists only what a visitor can file against.
        let page = list_categories(&service, 7, &SdkWorkListQuery::default())
            .await
            .expect("catalog categories");
        let codes = page
            .items
            .iter()
            .map(|item| item.category_code.as_str())
            .collect::<Vec<_>>();
        assert_eq!(codes, vec!["code-development"]);
    }

    #[tokio::test]
    async fn marketplace_plugins_keep_only_active_records() {
        use sdkwork_intelligence_plugins_service::{
            InMemoryPluginRepository, PluginsRepository, PluginsService,
        };

        let repository = InMemoryPluginRepository::default();
        for (key, status) in [
            ("live-plugin", PluginLifecycleStatus::Active),
            ("draft-plugin", PluginLifecycleStatus::Draft),
            ("archived-plugin", PluginLifecycleStatus::Archived),
        ] {
            let mut record = plugin(key, Some("code-development"), &[]);
            record.lifecycle_status = status;
            repository
                .create_plugin(7, 1, record)
                .await
                .expect("seed plugin");
        }
        let service = PluginsService::new(repository);

        let admin = service.list_plugins(7).await.expect("admin plugins");
        assert_eq!(admin.len(), 3);

        let page = list_plugins(&service, 7, &SdkWorkListQuery::default())
            .await
            .expect("catalog plugins");
        assert_eq!(keys(&page.items), vec!["live-plugin"]);
    }
}
