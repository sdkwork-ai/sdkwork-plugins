use sdkwork_plugins_contract::{
    PluginArtifactSource, PluginImplementationType, PluginInstallStatus, PluginLifecycleStatus,
    PluginRecord, PluginVisibility,
};

use super::validation::validate_plugin_record;

const SHA256: &str = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

fn plugin(source: Option<PluginArtifactSource>) -> PluginRecord {
    PluginRecord {
        id: 0,
        uuid: String::new(),
        organization_id: 0,
        owner_user_id: 0,
        plugin_key: "demo-plugin".to_string(),
        name: "Demo Plugin".to_string(),
        description: None,
        category_id: None,
        category_code: None,
        version_label: "1.0.0".to_string(),
        provider: None,
        implementation_type: PluginImplementationType::SdkworkNative,
        visibility: PluginVisibility::Tenant,
        manifest: serde_json::json!({}),
        source,
        install_status: PluginInstallStatus::Available,
        tags: Vec::new(),
        allowed_role_codes: Vec::new(),
        lifecycle_status: PluginLifecycleStatus::Active,
        version: 0,
        created_at: String::new(),
        updated_at: String::new(),
    }
}

#[test]
fn accepts_legacy_manifest_only_plugin() {
    validate_plugin_record(&plugin(None)).expect("manifest-only plugin remains valid");
}

#[test]
fn accepts_all_plugin_artifact_sources() {
    validate_plugin_record(&plugin(Some(PluginArtifactSource::DriveFile {
        drive_uri: "drive://spaces/plugins/nodes/archive".to_string(),
        checksum_sha256: SHA256.to_string(),
        size_bytes: Some(42),
    })))
    .expect("drive file source");

    validate_plugin_record(&plugin(Some(PluginArtifactSource::DriveDirectory {
        drive_uri: "drive://spaces/plugins/nodes/directory".to_string(),
    })))
    .expect("drive directory source");

    validate_plugin_record(&plugin(Some(PluginArtifactSource::Git {
        repository_url: "https://github.com/sdkwork/plugins.git".to_string(),
        repository_path: "plugins/demo".to_string(),
        git_ref: Some("main".to_string()),
    })))
    .expect("git source");
}

#[test]
fn rejects_unsafe_plugin_artifact_sources() {
    assert!(
        validate_plugin_record(&plugin(Some(PluginArtifactSource::DriveFile {
            drive_uri: "https://example.com/archive.zip".to_string(),
            checksum_sha256: "bad".to_string(),
            size_bytes: None,
        })))
        .is_err()
    );

    assert!(
        validate_plugin_record(&plugin(Some(PluginArtifactSource::Git {
            repository_url: "http://github.com/sdkwork/plugins.git".to_string(),
            repository_path: "plugins/demo".to_string(),
            git_ref: None,
        })))
        .is_err()
    );

    assert!(
        validate_plugin_record(&plugin(Some(PluginArtifactSource::Git {
            repository_url: "https://github.com/sdkwork/plugins.git".to_string(),
            repository_path: "../escape".to_string(),
            git_ref: None,
        })))
        .is_err()
    );
}

#[test]
fn plugin_artifact_source_wire_shape_is_camel_case() {
    let source = PluginArtifactSource::Git {
        repository_url: "https://github.com/sdkwork/plugins.git".to_string(),
        repository_path: "plugins/demo".to_string(),
        git_ref: Some("main".to_string()),
    };
    let value = serde_json::to_value(&source).expect("serialize source");
    assert_eq!(value["kind"], "git");
    assert_eq!(
        value["repositoryUrl"],
        "https://github.com/sdkwork/plugins.git"
    );
    assert_eq!(value["repositoryPath"], "plugins/demo");
    assert_eq!(value["gitRef"], "main");
    let parsed: PluginArtifactSource = serde_json::from_value(value).expect("deserialize source");
    assert_eq!(parsed, source);
}
