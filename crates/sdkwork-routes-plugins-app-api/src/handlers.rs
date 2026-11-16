use sdkwork_plugins_contract::{PluginCategoryRecord, PluginRecord};
use sdkwork_utils_rust::{SdkWorkPageData, SdkWorkResourceData};

use crate::list_query::SdkWorkListQuery;
use crate::response::{item_data, page_data_from_total, ApiProblem, ApiResult};

pub async fn list_plugins<R: sdkwork_intelligence_plugins_service::PluginsRepository>(
    service: &sdkwork_intelligence_plugins_service::PluginsService<R>,
    tenant_id: u64,
    organization_id: u64,
    user_id: u64,
    query: &SdkWorkListQuery,
) -> ApiResult<SdkWorkPageData<PluginRecord>> {
    query.validate()?;
    // The marketplace lists what a visitor can install: only active plugins
    // inside the caller's visibility scope. The store applies the scope, view
    // filter and keyword before it cuts the page, so `totalItems` is the
    // visible catalogue size.
    let (limit, offset) = page_window(query);
    let (items, total) = service
        .list_catalog_plugins_page(
            tenant_id,
            organization_id,
            user_id,
            &query.catalog_filter(),
            query.search_keyword(),
            limit,
            offset,
        )
        .await?;
    Ok(page_data_from_total(items, total, query))
}

pub async fn retrieve_plugin<R: sdkwork_intelligence_plugins_service::PluginsRepository>(
    service: &sdkwork_intelligence_plugins_service::PluginsService<R>,
    tenant_id: u64,
    organization_id: u64,
    user_id: u64,
    plugin_key: &str,
) -> ApiResult<SdkWorkResourceData<PluginRecord>> {
    // The marketplace retrieves only what it would list: an unpublished or
    // out-of-scope plugin must not be readable by its key either, so the store
    // query carries the same lifecycle and visibility gate as the list.
    let Some(record) = service
        .get_catalog_plugin(tenant_id, organization_id, user_id, plugin_key)
        .await?
    else {
        return Err(ApiProblem::not_found(format!(
            "plugin {plugin_key} is not visible in the catalog"
        )));
    };
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
    // visible to the backend administration surface only, and the store total
    // counts only the rows this surface can see.
    let (limit, offset) = page_window(query);
    let (items, total) = service
        .list_catalog_categories_page(
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

/// Reference predicate for the plugin catalog view. The HTTP path now pushes
/// both filters and the keyword into the repository; this helper stays as the
/// unit-test oracle for the rules the store predicates must mirror.
#[cfg(test)]
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

#[cfg(test)]
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

#[cfg(test)]
mod tests {
    use sdkwork_intelligence_plugins_service::PluginsRepository;
    use sdkwork_plugins_contract::{
        PluginImplementationType, PluginInstallStatus, PluginLifecycleStatus, PluginVisibility,
    };
    use sdkwork_utils_rust::CatalogViewQuery;

    use super::*;

    fn plugin(key: &str, category: Option<&str>, roles: &[&str]) -> PluginRecord {
        PluginRecord {
            id: 1,
            uuid: String::new(),
            organization_id: 0,
            owner_user_id: 0,
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

    fn scoped_plugin(
        key: &str,
        visibility: PluginVisibility,
        organization_id: u64,
        owner_user_id: u64,
    ) -> PluginRecord {
        let mut record = plugin(key, Some("code-development"), &[]);
        record.visibility = visibility;
        record.organization_id = organization_id;
        record.owner_user_id = owner_user_id;
        record
    }

    async fn seed(
        repository: &sdkwork_intelligence_plugins_service::InMemoryPluginRepository,
        tenant_id: u64,
        record: PluginRecord,
    ) {
        repository
            .create_plugin(tenant_id, 1, record)
            .await
            .expect("seed plugin");
    }

    fn sorted_keys(items: &[PluginRecord]) -> Vec<String> {
        let mut keys = items
            .iter()
            .map(|item| item.plugin_key.clone())
            .collect::<Vec<_>>();
        keys.sort();
        keys
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

        let page = list_plugins(&service, 7, 0, 0, &SdkWorkListQuery::default())
            .await
            .expect("catalog plugins");
        assert_eq!(keys(&page.items), vec!["live-plugin"]);
    }

    #[tokio::test]
    async fn marketplace_retrieve_hides_unpublished_plugins() {
        use sdkwork_intelligence_plugins_service::{
            InMemoryPluginRepository, PluginsRepository, PluginsService,
        };

        let repository = InMemoryPluginRepository::default();
        for (key, status) in [
            ("live-plugin", PluginLifecycleStatus::Active),
            ("draft-plugin", PluginLifecycleStatus::Draft),
        ] {
            let mut record = plugin(key, Some("code-development"), &[]);
            record.lifecycle_status = status;
            repository
                .create_plugin(7, 1, record)
                .await
                .expect("seed plugin");
        }
        let service = PluginsService::new(repository);

        let live = retrieve_plugin(&service, 7, 0, 0, "live-plugin")
            .await
            .expect("a published plugin is readable");
        assert_eq!(live.item.plugin_key, "live-plugin");

        // The catalog list hides drafts; retrieving one by key must 404 rather
        // than leak it.
        let hidden = retrieve_plugin(&service, 7, 0, 0, "draft-plugin")
            .await
            .expect_err("a draft plugin is not part of the catalog");
        assert!(
            format!("{hidden:?}").contains("is not visible in the catalog"),
            "expected a not-found catalog error, got {hidden:?}"
        );

        // The administration surface still reads it.
        let admin = service
            .get_plugin(7, "draft-plugin")
            .await
            .expect("admin reads the draft");
        assert_eq!(admin.lifecycle_status, PluginLifecycleStatus::Draft);
    }

    fn paged_query(page: i32, page_size: i32, category: Option<&str>) -> SdkWorkListQuery {
        SdkWorkListQuery {
            page: Some(page),
            page_size: Some(page_size),
            catalog: CatalogViewQuery {
                category_code: category.map(str::to_string),
                role_codes: None,
            },
            ..Default::default()
        }
    }

    #[tokio::test]
    async fn page_two_returns_the_filtered_tail_and_the_filtered_total() {
        use sdkwork_intelligence_plugins_service::{
            InMemoryPluginRepository, PluginsRepository, PluginsService,
        };

        let repository = InMemoryPluginRepository::default();
        for key in ["alpha", "beta", "gamma"] {
            repository
                .create_plugin(7, 1, plugin(key, Some("data-retrieval"), &[]))
                .await
                .expect("seed plugin");
        }
        let service = PluginsService::new(repository);

        let first = list_plugins(
            &service,
            7,
            0,
            0,
            &paged_query(1, 2, Some("data-retrieval")),
        )
        .await
        .expect("first page");
        let second = list_plugins(
            &service,
            7,
            0,
            0,
            &paged_query(2, 2, Some("data-retrieval")),
        )
        .await
        .expect("second page");

        assert_eq!(first.items.len(), 2);
        assert_eq!(second.items.len(), 1);
        assert_eq!(second.page_info.total_items.as_deref(), Some("3"));
        assert_eq!(second.page_info.total_pages, Some(2));
        assert_eq!(second.page_info.has_more, Some(false));

        let tail_key = second.items[0].plugin_key.as_str();
        let mut seen = keys(&first.items);
        assert!(!seen.contains(&tail_key));
        seen.push(tail_key);
        seen.sort_unstable();
        assert_eq!(seen, vec!["alpha", "beta", "gamma"]);
    }

    #[tokio::test]
    async fn category_filter_pages_the_filtered_total_not_the_unfiltered_one() {
        use sdkwork_intelligence_plugins_service::{
            InMemoryPluginRepository, PluginsRepository, PluginsService,
        };

        let repository = InMemoryPluginRepository::default();
        for key in ["search", "index", "crawl"] {
            repository
                .create_plugin(7, 1, plugin(key, Some("data-retrieval"), &[]))
                .await
                .expect("seed data-retrieval plugin");
        }
        for key in ["ocr", "segment"] {
            repository
                .create_plugin(7, 1, plugin(key, Some("image-processing"), &[]))
                .await
                .expect("seed image-processing plugin");
        }
        let service = PluginsService::new(repository);

        let page = list_plugins(
            &service,
            7,
            0,
            0,
            &paged_query(1, 2, Some("data-retrieval")),
        )
        .await
        .expect("filtered page");
        assert_eq!(page.items.len(), 2);
        assert_eq!(
            page.page_info.total_items.as_deref(),
            Some("3"),
            "totalItems must count the filtered rows, not every plugin"
        );
        assert!(page
            .items
            .iter()
            .all(|item| item.category_code.as_deref() == Some("data-retrieval")));
    }

    #[tokio::test]
    async fn catalog_pages_hide_admin_only_plugins_across_pages() {
        use sdkwork_intelligence_plugins_service::{
            InMemoryPluginRepository, PluginsRepository, PluginsService,
        };

        let repository = InMemoryPluginRepository::default();
        for (key, status) in [
            ("live-one", PluginLifecycleStatus::Active),
            ("live-two", PluginLifecycleStatus::Active),
            ("draft", PluginLifecycleStatus::Draft),
            ("archived", PluginLifecycleStatus::Archived),
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
        assert_eq!(admin.len(), 4);

        let mut visible = Vec::new();
        for page in 1..=2 {
            let result = list_plugins(&service, 7, 0, 0, &paged_query(page, 1, None))
                .await
                .expect("catalog page");
            assert_eq!(result.items.len(), 1);
            assert_eq!(result.page_info.total_items.as_deref(), Some("2"));
            assert!(result
                .items
                .iter()
                .all(|item| item.lifecycle_status == PluginLifecycleStatus::Active));
            visible.extend(keys(&result.items).into_iter().map(str::to_string));
        }
        visible.sort_unstable();
        assert_eq!(
            visible,
            vec!["live-one".to_string(), "live-two".to_string()]
        );
    }

    #[tokio::test]
    async fn catalog_hides_private_plugins_from_other_users() {
        let repository = sdkwork_intelligence_plugins_service::InMemoryPluginRepository::default();
        seed(
            &repository,
            7,
            scoped_plugin("owner-only", PluginVisibility::Private, 0, 42),
        )
        .await;
        let service = sdkwork_intelligence_plugins_service::PluginsService::new(repository);

        let owner = list_plugins(&service, 7, 0, 42, &SdkWorkListQuery::default())
            .await
            .expect("owner catalog");
        assert_eq!(keys(&owner.items), vec!["owner-only"]);
        assert_eq!(owner.page_info.total_items.as_deref(), Some("1"));

        // Same tenant, same organization, different user: hidden from the list
        // and from its own retrieve route.
        let colleague = list_plugins(&service, 7, 0, 43, &SdkWorkListQuery::default())
            .await
            .expect("colleague catalog");
        assert!(colleague.items.is_empty());
        assert_eq!(
            colleague.page_info.total_items.as_deref(),
            Some("0"),
            "the visible total must not count another user's private plugin"
        );
        let hidden = retrieve_plugin(&service, 7, 0, 43, "owner-only")
            .await
            .expect_err("a private plugin is not readable by another user");
        assert!(
            format!("{hidden:?}").contains("status: 404"),
            "expected a 404 problem, got {hidden:?}"
        );
    }

    #[tokio::test]
    async fn catalog_scopes_organization_plugins_to_the_callers_organization() {
        let repository = sdkwork_intelligence_plugins_service::InMemoryPluginRepository::default();
        seed(
            &repository,
            7,
            scoped_plugin("org-17-tool", PluginVisibility::Organization, 17, 0),
        )
        .await;
        let service = sdkwork_intelligence_plugins_service::PluginsService::new(repository);

        // Every caller inside organization 17 sees it, whatever their user id.
        for user_id in [0, 99] {
            let page = list_plugins(&service, 7, 17, user_id, &SdkWorkListQuery::default())
                .await
                .expect("same-organization catalog");
            assert_eq!(keys(&page.items), vec!["org-17-tool"]);
            assert_eq!(page.page_info.total_items.as_deref(), Some("1"));
        }

        // Another organization, including the tenant-level `0` sentinel, does
        // not see it.
        for (organization_id, user_id) in [(0, 0), (18, 42)] {
            let page = list_plugins(
                &service,
                7,
                organization_id,
                user_id,
                &SdkWorkListQuery::default(),
            )
            .await
            .expect("other-organization catalog");
            assert!(
                page.items.is_empty(),
                "organization {organization_id} must not see another organization's plugin"
            );
            assert_eq!(page.page_info.total_items.as_deref(), Some("0"));
            let hidden = retrieve_plugin(&service, 7, organization_id, user_id, "org-17-tool")
                .await
                .expect_err("an organization plugin is not readable by another organization");
            assert!(format!("{hidden:?}").contains("status: 404"));
        }

        // The admin surface stays tenant-wide.
        let admin = service
            .get_plugin(7, "org-17-tool")
            .await
            .expect("admin reads the organization plugin");
        assert_eq!(admin.organization_id, 17);
    }

    #[tokio::test]
    async fn catalog_lists_tenant_and_public_plugins_for_every_caller() {
        let repository = sdkwork_intelligence_plugins_service::InMemoryPluginRepository::default();
        seed(
            &repository,
            7,
            scoped_plugin("tenant-plugin", PluginVisibility::Tenant, 0, 0),
        )
        .await;
        seed(
            &repository,
            7,
            scoped_plugin("public-plugin", PluginVisibility::Public, 0, 0),
        )
        .await;
        let service = sdkwork_intelligence_plugins_service::PluginsService::new(repository);

        for (organization_id, user_id) in [(0, 0), (17, 42), (18, 99)] {
            let page = list_plugins(
                &service,
                7,
                organization_id,
                user_id,
                &SdkWorkListQuery::default(),
            )
            .await
            .expect("catalog page");
            assert_eq!(
                sorted_keys(&page.items),
                vec!["public-plugin".to_string(), "tenant-plugin".to_string()],
                "tenant/public plugins are visible to every caller of the tenant"
            );
            assert_eq!(page.page_info.total_items.as_deref(), Some("2"));
        }
    }

    #[tokio::test]
    async fn catalog_retrieve_404s_hidden_plugins_while_admin_reads_them() {
        let repository = sdkwork_intelligence_plugins_service::InMemoryPluginRepository::default();
        seed(
            &repository,
            7,
            scoped_plugin("private-tool", PluginVisibility::Private, 0, 42),
        )
        .await;
        let mut draft = plugin("draft-tool", Some("code-development"), &[]);
        draft.lifecycle_status = PluginLifecycleStatus::Draft;
        seed(&repository, 7, draft).await;
        let service = sdkwork_intelligence_plugins_service::PluginsService::new(repository);

        // Another user cannot retrieve the private plugin by key...
        let private_hidden = retrieve_plugin(&service, 7, 0, 43, "private-tool")
            .await
            .expect_err("a private plugin 404s for another user");
        assert!(format!("{private_hidden:?}").contains("status: 404"));

        // ...and the catalog also 404s an unpublished draft.
        let draft_hidden = retrieve_plugin(&service, 7, 0, 0, "draft-tool")
            .await
            .expect_err("a draft plugin 404s on the catalog");
        assert!(format!("{draft_hidden:?}").contains("status: 404"));

        // The admin repository read keeps both rows unscoped.
        for key in ["private-tool", "draft-tool"] {
            let admin = service
                .get_plugin(7, key)
                .await
                .expect("admin reads the hidden plugin");
            assert_eq!(admin.plugin_key, key);
        }
    }
}
