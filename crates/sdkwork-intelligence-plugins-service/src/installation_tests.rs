use sdkwork_plugins_contract::{
    PluginImplementationType, PluginInstallStatus, PluginInstallationAction,
    PluginInstallationStatus, PluginInstallationSyncCommand, PluginLifecycleStatus,
    PluginMarketplaceCommit, PluginMarketplaceMetadata, PluginMarketplaceRelease, PluginRecord,
    PluginVisibility,
};

use crate::{InMemoryPluginRepository, PluginsRepository, PluginsService};

const TENANT: u64 = 7;
const ORGANIZATION: u64 = 3;
const USER: u64 = 11;
const HOST: &str = "host-alpha";

fn catalog_plugin() -> PluginRecord {
    PluginRecord {
        id: 0,
        uuid: String::new(),
        organization_id: 0,
        owner_user_id: 0,
        plugin_key: "demo-plugin".to_string(),
        name: "Demo Plugin".to_string(),
        description: Some("catalog entry".to_string()),
        name_locales: serde_json::json!({ "zh-CN": "演示插件" }),
        description_locales: serde_json::json!({}),
        icon_url: None,
        usage_count: 9,
        featured: true,
        featured_order: 1,
        featured_title_locales: serde_json::json!({}),
        featured_description_locales: serde_json::json!({}),
        featured_image_url: None,
        category_id: None,
        category_code: Some("official".to_string()),
        version_label: "1.2.3".to_string(),
        provider: Some("dsh-market".to_string()),
        implementation_type: PluginImplementationType::Custom,
        visibility: PluginVisibility::Tenant,
        manifest: serde_json::json!({ "name": "demo-plugin" }),
        source: None,
        marketplace_metadata: Some(PluginMarketplaceMetadata {
            provider: "dsh-market".to_string(),
            catalog_url: "https://dsh.market/plugin/sdkwork/demo".to_string(),
            page_url: None,
            owner: Some("sdkwork".to_string()),
            npm_package: Some("@sdkwork/demo-plugin".to_string()),
            tarball_url: None,
            repository_url: Some("https://github.com/sdkwork/demo.git".to_string()),
            repository_path: Some("plugins/demo".to_string()),
            repository_ref: Some("main".to_string()),
            version: Some("1.2.3".to_string()),
            install: Some("@sdkwork/demo-plugin@1.2.3".to_string()),
            categories: vec!["official".to_string()],
            added: Some("2026-01-01".to_string()),
            stars: Some(42),
            stars_checked_at: None,
            downloads: Some(7),
            downloads_start: None,
            downloads_end: None,
            downloads_checked_at: None,
            github_release_downloads: Some(3),
            release_manifest: None,
            release: Some(PluginMarketplaceRelease {
                tag: Some("v1.2.3".to_string()),
                name: Some("Demo 1.2.3".to_string()),
                published_at: Some("2026-11-01T00:00:00Z".to_string()),
                url: Some("https://github.com/sdkwork/demo/releases/tag/v1.2.3".to_string()),
                body: Some("release notes".to_string()),
            }),
            recent_commits: vec![PluginMarketplaceCommit {
                sha: "abc123".to_string(),
                message: Some("prepare release".to_string()),
                date: Some("2026-10-30T00:00:00Z".to_string()),
            }],
            updates_checked_at: Some("2026-11-26".to_string()),
            icon_url: None,
            screenshots: Vec::new(),
            capabilities: vec!["network".to_string()],
            capability_red_lines: Vec::new(),
            capability_checked_at: None,
            deprecated: false,
            replacement: None,
            previous_npm: Vec::new(),
            catalog_revision: Some("2026-11-26".to_string()),
            raw: serde_json::json!({}),
        }),
        catalog_provider: "dsh-market".to_string(),
        catalog_url: Some("https://dsh.market/plugin/sdkwork/demo".to_string()),
        catalog_page_url: None,
        owner_login: Some("sdkwork".to_string()),
        npm_package: Some("@sdkwork/demo-plugin".to_string()),
        tarball_url: None,
        repository_url: Some("https://github.com/sdkwork/demo.git".to_string()),
        repository_path: Some("plugins/demo".to_string()),
        repository_ref: Some("main".to_string()),
        registry_version: Some("1.2.3".to_string()),
        added_on: Some("2026-01-01".to_string()),
        stars_count: 42,
        stars_checked_at: None,
        downloads_count: 7,
        downloads_start: None,
        downloads_end: None,
        downloads_checked_at: None,
        is_deprecated: false,
        replaced_by_catalog_url: None,
        catalog_revision: Some("2026-11-26".to_string()),
        install_target: None,
        install_targets: Vec::new(),
        media: Vec::new(),
        capabilities: vec!["network".to_string()],
        capability_red_lines: Vec::new(),
        install_status: PluginInstallStatus::Available,
        tags: vec!["demo".to_string()],
        allowed_role_codes: Vec::new(),
        lifecycle_status: PluginLifecycleStatus::Active,
        version: 0,
        created_at: String::new(),
        updated_at: String::new(),
    }
}

async fn service_with_plugin() -> PluginsService<InMemoryPluginRepository> {
    let service = PluginsService::new(InMemoryPluginRepository::new());
    service
        .repository
        .create_plugin(TENANT, USER, catalog_plugin())
        .await
        .expect("seed the catalog plugin");
    service
}

fn install_command() -> PluginInstallationSyncCommand {
    PluginInstallationSyncCommand {
        plugin_key: "demo-plugin".to_string(),
        action: PluginInstallationAction::Installed,
        package_name: None,
        version: None,
        install_spec: None,
    }
}

#[tokio::test]
async fn install_persists_the_complete_catalog_snapshot() {
    let service = service_with_plugin().await;
    let record = service
        .sync_installation(TENANT, ORGANIZATION, USER, HOST, install_command())
        .await
        .expect("synchronize the installation");

    assert_eq!(record.status, PluginInstallationStatus::Installed);
    assert_eq!(record.host_id, HOST);
    assert_eq!(record.package_name.as_deref(), Some("@sdkwork/demo-plugin"));
    assert_eq!(record.version.as_deref(), Some("1.2.3"));
    assert_eq!(record.catalog_revision.as_deref(), Some("2026-11-26"));
    assert!(record.removed_at.is_none());
    assert_eq!(record.snapshot.plugin_key, "demo-plugin");
    assert_eq!(record.snapshot.category_code.as_deref(), Some("official"));
    assert_eq!(
        record.snapshot.catalog_url.as_deref(),
        Some("https://dsh.market/plugin/sdkwork/demo")
    );
    let release = record
        .snapshot
        .marketplace_metadata
        .as_ref()
        .and_then(|metadata| metadata.release.as_ref())
        .expect("changelog release survives the snapshot");
    assert_eq!(release.tag.as_deref(), Some("v1.2.3"));
}

#[tokio::test]
async fn install_reports_the_host_supplied_identity() {
    let service = service_with_plugin().await;
    let record = service
        .sync_installation(
            TENANT,
            ORGANIZATION,
            USER,
            HOST,
            PluginInstallationSyncCommand {
                plugin_key: "demo-plugin".to_string(),
                action: PluginInstallationAction::Installed,
                package_name: Some("demo-plugin".to_string()),
                version: Some("1.2.4".to_string()),
                install_spec: Some("demo-plugin@1.2.4".to_string()),
            },
        )
        .await
        .expect("synchronize the installation");

    assert_eq!(record.package_name.as_deref(), Some("demo-plugin"));
    assert_eq!(record.version.as_deref(), Some("1.2.4"));
    assert_eq!(record.install_spec.as_deref(), Some("demo-plugin@1.2.4"));

    let updated = service
        .sync_installation(
            TENANT,
            ORGANIZATION,
            USER,
            HOST,
            PluginInstallationSyncCommand {
                action: PluginInstallationAction::Updated,
                version: Some("1.2.5".to_string()),
                ..install_command()
            },
        )
        .await
        .expect("update without restating the Host package identity");
    assert_eq!(updated.package_name.as_deref(), Some("demo-plugin"));
    assert_eq!(updated.version.as_deref(), Some("1.2.5"));
}

#[tokio::test]
async fn update_and_removal_keep_one_record_for_the_host() {
    let service = service_with_plugin().await;
    let installed = service
        .sync_installation(TENANT, ORGANIZATION, USER, HOST, install_command())
        .await
        .expect("install");

    let updated = service
        .sync_installation(
            TENANT,
            ORGANIZATION,
            USER,
            HOST,
            PluginInstallationSyncCommand {
                action: PluginInstallationAction::Updated,
                version: Some("1.2.4".to_string()),
                ..install_command()
            },
        )
        .await
        .expect("update");
    assert_eq!(updated.id, installed.id);
    assert_eq!(updated.status, PluginInstallationStatus::Installed);

    let removed = service
        .sync_installation(
            TENANT,
            ORGANIZATION,
            USER,
            HOST,
            PluginInstallationSyncCommand {
                action: PluginInstallationAction::Removed,
                ..install_command()
            },
        )
        .await
        .expect("remove");
    assert_eq!(removed.id, installed.id);
    assert_eq!(removed.status, PluginInstallationStatus::Removed);
    assert_eq!(removed.version.as_deref(), Some("1.2.4"));
    assert_eq!(removed.snapshot.plugin_key, "demo-plugin");
    assert!(removed.removed_at.is_some());
}

#[tokio::test]
async fn removal_uses_the_stored_snapshot_after_the_catalog_row_disappears() {
    let service = service_with_plugin().await;
    let installed = service
        .sync_installation(TENANT, ORGANIZATION, USER, HOST, install_command())
        .await
        .expect("install");

    service
        .repository
        .delete_plugin(TENANT, "demo-plugin")
        .await
        .expect("retire the catalog row");

    let removed = service
        .sync_installation(
            TENANT,
            ORGANIZATION,
            USER,
            HOST,
            PluginInstallationSyncCommand {
                action: PluginInstallationAction::Removed,
                ..install_command()
            },
        )
        .await
        .expect("remove from the stored snapshot");

    assert_eq!(removed.id, installed.id);
    assert_eq!(removed.snapshot, installed.snapshot);
    assert_eq!(removed.install_spec, installed.install_spec);
}

#[tokio::test]
async fn update_uses_the_stored_snapshot_after_the_catalog_row_disappears() {
    let service = service_with_plugin().await;
    let installed = service
        .sync_installation(TENANT, ORGANIZATION, USER, HOST, install_command())
        .await
        .expect("install");
    service
        .repository
        .delete_plugin(TENANT, "demo-plugin")
        .await
        .expect("retire the catalog row");

    let updated = service
        .sync_installation(
            TENANT,
            ORGANIZATION,
            USER,
            HOST,
            PluginInstallationSyncCommand {
                action: PluginInstallationAction::Updated,
                version: Some("1.2.5".to_string()),
                ..install_command()
            },
        )
        .await
        .expect("update from the stored snapshot");

    assert_eq!(updated.id, installed.id);
    assert_eq!(updated.snapshot, installed.snapshot);
    assert_eq!(updated.version.as_deref(), Some("1.2.5"));
    assert_eq!(updated.status, PluginInstallationStatus::Installed);
    assert!(updated.removed_at.is_none());
}

#[tokio::test]
async fn synchronization_rejects_unverified_users_and_invalid_hosts() {
    let service = service_with_plugin().await;

    let unverified = service
        .sync_installation(TENANT, ORGANIZATION, 0, HOST, install_command())
        .await;
    assert!(unverified.is_err());

    let blank_host = service
        .sync_installation(TENANT, ORGANIZATION, USER, "   ", install_command())
        .await;
    assert!(blank_host.is_err());

    let oversized_host = "h".repeat(129);
    let oversized = service
        .sync_installation(
            TENANT,
            ORGANIZATION,
            USER,
            &oversized_host,
            install_command(),
        )
        .await;
    assert!(oversized.is_err());
}

#[tokio::test]
async fn synchronization_rejects_unknown_and_hidden_plugins() {
    let service = service_with_plugin().await;
    let unknown = service
        .sync_installation(
            TENANT,
            ORGANIZATION,
            USER,
            HOST,
            PluginInstallationSyncCommand {
                plugin_key: "missing-plugin".to_string(),
                ..install_command()
            },
        )
        .await;
    assert!(unknown.is_err());

    let removed_without_record = service
        .sync_installation(
            TENANT,
            ORGANIZATION,
            USER,
            HOST,
            PluginInstallationSyncCommand {
                action: PluginInstallationAction::Removed,
                ..install_command()
            },
        )
        .await
        .expect("record a removal for an installation this database never saw");
    assert_eq!(
        removed_without_record.status,
        PluginInstallationStatus::Removed
    );
    assert_eq!(removed_without_record.snapshot.plugin_key, "demo-plugin");

    service
        .repository
        .update_plugin(
            TENANT,
            USER,
            "demo-plugin",
            PluginRecord {
                visibility: PluginVisibility::Private,
                owner_user_id: USER + 1,
                ..catalog_plugin()
            },
        )
        .await
        .expect("hide the catalog row from this user");
    let hidden = service
        .sync_installation(TENANT, ORGANIZATION, USER, HOST, install_command())
        .await;
    assert!(hidden.is_err());
}
