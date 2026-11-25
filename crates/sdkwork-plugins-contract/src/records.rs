use serde::{Deserialize, Serialize};

use crate::enums::{
    PluginImplementationType, PluginInstallStatus, PluginLifecycleStatus, PluginVisibility,
};

fn empty_json_object() -> serde_json::Value {
    serde_json::json!({})
}

/// Catalog provider of a plugin that predates the catalog columns: SDKWork
/// authored the record itself.
fn default_catalog_provider() -> String {
    "sdkwork".to_string()
}

/// Where a managed plugin's package content comes from.
///
/// Mirrors the Skills artifact-source contract so the admin surfaces stay
/// consistent: a Drive archive, an existing Drive directory, or a Git
/// repository path.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind")]
pub enum PluginArtifactSource {
    #[serde(rename = "drive_file")]
    DriveFile {
        #[serde(rename = "driveUri")]
        drive_uri: String,
        #[serde(rename = "checksumSha256")]
        checksum_sha256: String,
        #[serde(
            default,
            rename = "sizeBytes",
            with = "sdkwork_utils_rust::serde_uint64::option"
        )]
        size_bytes: Option<u64>,
    },
    #[serde(rename = "drive_directory")]
    DriveDirectory {
        #[serde(rename = "driveUri")]
        drive_uri: String,
    },
    #[serde(rename = "git")]
    Git {
        #[serde(rename = "repositoryUrl")]
        repository_url: String,
        #[serde(rename = "repositoryPath")]
        repository_path: String,
        #[serde(default, rename = "gitRef")]
        git_ref: Option<String>,
    },
}

/// Catalog metadata imported from an external plugin registry.
///
/// The artifact `source` above describes content owned by SDKWork. This
/// projection describes a curated discovery entry and keeps the registry's
/// install target separate from uploaded artifacts. `catalogUrl` is the
/// stable identity submitted to a registry-authoritative installer. The
/// `install` string is display-only and must never be treated as an install
/// target by a client.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginMarketplaceMetadata {
    pub provider: String,
    pub catalog_url: String,
    #[serde(default)]
    pub page_url: Option<String>,
    #[serde(default)]
    pub owner: Option<String>,
    #[serde(default)]
    pub npm_package: Option<String>,
    #[serde(default)]
    pub tarball_url: Option<String>,
    #[serde(default)]
    pub repository_url: Option<String>,
    #[serde(default)]
    pub repository_path: Option<String>,
    #[serde(default)]
    pub repository_ref: Option<String>,
    #[serde(default)]
    pub version: Option<String>,
    #[serde(default)]
    pub install: Option<String>,
    #[serde(default)]
    pub categories: Vec<String>,
    #[serde(default)]
    pub added: Option<String>,
    /// Star count captured by the registry. Stored snapshots keep the
    /// registry's JSON number, so intake accepts either representation while
    /// the wire form stays the contract decimal string (`catalog_numbers`).
    #[serde(default, with = "crate::catalog_numbers")]
    pub stars: Option<u64>,
    #[serde(default)]
    pub stars_checked_at: Option<String>,
    /// Download count captured by the registry, read through the same
    /// number-or-string intake as `stars`.
    #[serde(default, with = "crate::catalog_numbers")]
    pub downloads: Option<u64>,
    #[serde(default)]
    pub downloads_start: Option<String>,
    #[serde(default)]
    pub downloads_end: Option<String>,
    #[serde(default)]
    pub downloads_checked_at: Option<String>,
    /// Release-asset download count from the registry, same intake rule.
    #[serde(default, with = "crate::catalog_numbers")]
    pub github_release_downloads: Option<u64>,
    #[serde(default)]
    pub release_manifest: Option<serde_json::Value>,
    #[serde(default)]
    pub icon_url: Option<String>,
    #[serde(default)]
    pub screenshots: Vec<String>,
    #[serde(default)]
    pub capabilities: Vec<String>,
    #[serde(default)]
    pub capability_red_lines: Vec<String>,
    #[serde(default)]
    pub capability_checked_at: Option<String>,
    #[serde(default)]
    pub deprecated: bool,
    #[serde(default)]
    pub replacement: Option<String>,
    #[serde(default)]
    pub previous_npm: Vec<String>,
    #[serde(default)]
    pub catalog_revision: Option<String>,
    /// Original registry entry retained for forward-compatible re-projection.
    #[serde(default)]
    pub raw: serde_json::Value,
}

/// One stored install target of a catalog plugin.
///
/// `kind` selects the installer namespace (`registry`, `archive`, `git`,
/// `path`, `drive`) and `spec` is the complete specification for it, so a
/// client never has to rebuild the target from display copy.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginInstallTarget {
    pub kind: String,
    pub spec: String,
    #[serde(default)]
    pub package_name: Option<String>,
    #[serde(default)]
    pub package_version: Option<String>,
    #[serde(default)]
    pub is_default: bool,
}

/// One media asset attached to a catalog plugin.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginMedia {
    /// `icon`, `screenshot`, `featured`, or `cover`.
    pub kind: String,
    pub url: String,
    /// Display order inside the media kind.
    pub sort_order: i32,
}

/// Marketplace category grouping managed plugins.
///
/// `id` is a snowflake id serialized as a decimal string on the wire
/// (`API_SPEC.md` section 13.6 int64-string contract).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginCategoryRecord {
    #[serde(with = "sdkwork_utils_rust::serde_int64")]
    pub id: i64,
    pub uuid: String,
    pub category_code: String,
    pub name: String,
    pub description: Option<String>,
    /// Locale-specific display names keyed by BCP-47 locale.
    #[serde(default = "empty_json_object")]
    pub name_locales: serde_json::Value,
    /// Locale-specific descriptions keyed by BCP-47 locale.
    #[serde(default = "empty_json_object")]
    pub description_locales: serde_json::Value,
    pub sort_order: i32,
    pub lifecycle_status: PluginLifecycleStatus,
    #[serde(with = "sdkwork_utils_rust::serde_int64")]
    pub version: i64,
    pub created_at: String,
    pub updated_at: String,
}

/// A managed AI capability plugin.
///
/// The wire field `status` is the serialized entity lifecycle
/// (`lifecycle_status`); install state is tracked separately through
/// `installStatus`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginRecord {
    #[serde(with = "sdkwork_utils_rust::serde_int64")]
    pub id: i64,
    pub uuid: String,
    /// Organization scope of the record. `0` is the tenant-level sentinel a
    /// caller without an organization scope resolves to, so an
    /// `organization`-visible plugin filed at `0` matches those callers only.
    #[serde(default, with = "sdkwork_utils_rust::serde_uint64")]
    pub organization_id: u64,
    /// Owner of a `private` plugin. `private` rows are catalog-visible only to
    /// this user id, in addition to the tenant boundary.
    #[serde(default, with = "sdkwork_utils_rust::serde_uint64")]
    pub owner_user_id: u64,
    pub plugin_key: String,
    pub name: String,
    pub description: Option<String>,
    /// Locale-specific display names keyed by BCP-47 locale.
    #[serde(default = "empty_json_object")]
    pub name_locales: serde_json::Value,
    /// Locale-specific descriptions keyed by BCP-47 locale.
    #[serde(default = "empty_json_object")]
    pub description_locales: serde_json::Value,
    /// Plugin icon resolved through the SDKWork media surface.
    #[serde(default)]
    pub icon_url: Option<String>,
    /// Catalog usage count used for popularity ranking and display.
    #[serde(default, with = "sdkwork_utils_rust::serde_uint64")]
    pub usage_count: u64,
    /// Whether this plugin is eligible for featured placement.
    #[serde(default)]
    pub featured: bool,
    /// Lower values appear first among featured plugins.
    #[serde(default)]
    pub featured_order: i32,
    /// Locale-specific featured card title keyed by BCP-47 locale.
    #[serde(default = "empty_json_object")]
    pub featured_title_locales: serde_json::Value,
    /// Locale-specific featured card description keyed by BCP-47 locale.
    #[serde(default = "empty_json_object")]
    pub featured_description_locales: serde_json::Value,
    /// Featured card artwork resolved through the SDKWork media surface.
    #[serde(default)]
    pub featured_image_url: Option<String>,
    #[serde(with = "sdkwork_utils_rust::serde_int64::option")]
    pub category_id: Option<i64>,
    pub category_code: Option<String>,
    pub version_label: String,
    pub provider: Option<String>,
    pub implementation_type: PluginImplementationType,
    pub visibility: PluginVisibility,
    /// Plugin manifest as a JSON object.
    pub manifest: serde_json::Value,
    /// Package content source. `None` keeps legacy manifest-only plugins valid.
    pub source: Option<PluginArtifactSource>,
    /// Optional curated registry projection. This is catalog metadata, not
    /// proof that the current user has installed the plugin.
    #[serde(default)]
    pub marketplace_metadata: Option<PluginMarketplaceMetadata>,
    /// Provider that authored the catalog entry: `sdkwork` for SDKWork-owned
    /// rows, `dsh-market` for curated registry imports.
    #[serde(default = "default_catalog_provider")]
    pub catalog_provider: String,
    /// Registry-authoritative identity of a catalog entry.
    #[serde(default)]
    pub catalog_url: Option<String>,
    /// Human-readable registry page for the entry, when the registry has one.
    #[serde(default)]
    pub catalog_page_url: Option<String>,
    /// Registry owner login (for example a GitHub account).
    #[serde(default)]
    pub owner_login: Option<String>,
    /// npm package name when the entry is installable from a registry.
    #[serde(default)]
    pub npm_package: Option<String>,
    /// Release archive URL of the entry.
    #[serde(default)]
    pub tarball_url: Option<String>,
    /// Source repository of the entry.
    #[serde(default)]
    pub repository_url: Option<String>,
    /// Sub-directory inside the source repository.
    #[serde(default)]
    pub repository_path: Option<String>,
    /// Branch or tag the entry was imported at.
    #[serde(default)]
    pub repository_ref: Option<String>,
    /// Version published in the package registry, when the entry has one.
    #[serde(default)]
    pub registry_version: Option<String>,
    /// Registry first-publication date (`YYYY-MM-DD`).
    #[serde(default)]
    pub added_on: Option<String>,
    /// Star count captured by the catalog importer.
    #[serde(default, with = "sdkwork_utils_rust::serde_uint64")]
    pub stars_count: u64,
    /// When `stars_count` was captured.
    #[serde(default)]
    pub stars_checked_at: Option<String>,
    /// Download count captured by the catalog importer.
    #[serde(default, with = "sdkwork_utils_rust::serde_uint64")]
    pub downloads_count: u64,
    /// First day of the download-count window (`YYYY-MM-DD`).
    #[serde(default)]
    pub downloads_start: Option<String>,
    /// Last day of the download-count window (`YYYY-MM-DD`).
    #[serde(default)]
    pub downloads_end: Option<String>,
    /// When `downloads_count` was captured.
    #[serde(default)]
    pub downloads_checked_at: Option<String>,
    /// Whether the registry marks the entry as deprecated.
    #[serde(default)]
    pub is_deprecated: bool,
    /// Successor entry named by a deprecated registry record.
    #[serde(default)]
    pub replaced_by_catalog_url: Option<String>,
    /// Catalog snapshot revision the entry was imported from.
    #[serde(default)]
    pub catalog_revision: Option<String>,
    /// The stored default install target, when the catalog provides one.
    #[serde(default)]
    pub install_target: Option<PluginInstallTarget>,
    /// Every stored install target, ordered by source priority.
    #[serde(default)]
    pub install_targets: Vec<PluginInstallTarget>,
    /// Media assets, ordered by kind then display order.
    #[serde(default)]
    pub media: Vec<PluginMedia>,
    /// Declared capability codes, in disclosure order.
    #[serde(default)]
    pub capabilities: Vec<String>,
    /// Declared red-line disclosures, in disclosure order.
    #[serde(default)]
    pub capability_red_lines: Vec<String>,
    pub install_status: PluginInstallStatus,
    pub tags: Vec<String>,
    /// IAM role codes allowed to see and use this plugin. An empty list means
    /// every role, which is the default.
    pub allowed_role_codes: Vec<String>,
    #[serde(rename = "status")]
    pub lifecycle_status: PluginLifecycleStatus,
    #[serde(with = "sdkwork_utils_rust::serde_int64")]
    pub version: i64,
    pub created_at: String,
    pub updated_at: String,
}

impl PluginRecord {
    pub fn is_enabled(&self) -> bool {
        self.lifecycle_status == PluginLifecycleStatus::Active
    }
}

/// Canonical role-assignment list: trimmed, empty entries dropped,
/// de-duplicated and sorted.
pub fn normalize_allowed_role_codes(values: &[String]) -> Vec<String> {
    let mut codes = values
        .iter()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .collect::<Vec<_>>();
    codes.sort();
    codes.dedup();
    codes
}

#[cfg(test)]
mod tests {
    use serde_json::{json, Value};

    use super::PluginRecord;

    fn base_record() -> Value {
        json!({
            "id": "1", "uuid": "plugin.demo", "organizationId": "0", "ownerUserId": "0",
            "pluginKey": "dsh-demo", "name": "Demo", "description": null,
            "nameLocales": {}, "descriptionLocales": {}, "iconUrl": null, "usageCount": "0",
            "featured": false, "featuredOrder": 0, "featuredTitleLocales": {},
            "featuredDescriptionLocales": {}, "featuredImageUrl": null, "categoryId": null,
            "categoryCode": null, "versionLabel": "1.0.0", "provider": "dsh-market",
            "implementationType": "custom", "visibility": "public", "manifest": {},
            "source": null, "marketplaceMetadata": null, "installStatus": "available",
            "tags": [], "allowedRoleCodes": [], "status": "active", "version": "1",
            "createdAt": "2026-01-01T00:00:00Z", "updatedAt": "2026-01-01T00:00:00Z"
        })
    }

    #[test]
    fn catalog_fields_default_when_a_record_predates_the_catalog_columns() {
        let record: PluginRecord =
            serde_json::from_value(base_record()).expect("decode a legacy plugin record");
        assert_eq!(record.catalog_provider, "sdkwork");
        assert_eq!(record.stars_count, 0);
        assert_eq!(record.downloads_count, 0);
        assert!(!record.is_deprecated);
        assert!(record.install_target.is_none());
        assert!(record.install_targets.is_empty());
        assert!(record.media.is_empty());

        let wire = serde_json::to_value(&record).expect("encode the plugin record");
        assert_eq!(wire["catalogProvider"], json!("sdkwork"));
        assert_eq!(wire["starsCount"], json!("0"));
        assert_eq!(wire["downloadsCount"], json!("0"));
        assert_eq!(wire["isDeprecated"], json!(false));
        assert_eq!(wire["installTarget"], Value::Null);
        assert_eq!(wire["installTargets"], json!([]));
        assert_eq!(wire["media"], json!([]));
        assert_eq!(wire["capabilities"], json!([]));
        assert_eq!(wire["capabilityRedLines"], json!([]));
    }

    #[test]
    fn catalog_facts_and_ranked_targets_round_trip_in_camel_case() {
        let mut value = base_record();
        value["catalogProvider"] = json!("dsh-market");
        value["catalogUrl"] = json!("https://github.com/example/dsh-pet");
        value["ownerLogin"] = json!("example");
        value["starsCount"] = json!("73");
        value["downloadsCount"] = json!("117679");
        value["addedOn"] = json!("2026-10-27");
        value["isDeprecated"] = json!(true);
        value["installTargets"] = json!([
            {
                "kind": "registry",
                "spec": "@example/dsh-pet@0.4.21",
                "packageName": "@example/dsh-pet",
                "packageVersion": "0.4.21",
                "isDefault": true
            },
            {
                "kind": "git",
                "spec": "git+https://github.com/example/dsh-pet.git",
                "packageName": null,
                "packageVersion": null,
                "isDefault": false
            }
        ]);
        value["installTarget"] = value["installTargets"][0].clone();
        value["media"] = json!([
            {"kind": "screenshot", "url": "https://example.invalid/shot.png", "sortOrder": 2}
        ]);
        value["capabilities"] = json!(["network", "fs-read"]);
        value["capabilityRedLines"] = json!(["reads credentials and calls the network"]);

        let record: PluginRecord =
            serde_json::from_value(value).expect("decode a complete catalog record");
        assert_eq!(record.catalog_provider, "dsh-market");
        assert_eq!(record.stars_count, 73);
        assert_eq!(record.downloads_count, 117_679);
        assert_eq!(record.added_on.as_deref(), Some("2026-10-27"));
        assert!(record.is_deprecated);
        assert_eq!(record.install_targets.len(), 2);
        assert!(record.install_targets[0].is_default);
        assert_eq!(record.install_targets[1].kind, "git");
        assert_eq!(record.install_target.as_ref().map(|target| target.kind.as_str()), Some("registry"));
        assert_eq!(record.media[0].sort_order, 2);
        assert_eq!(record.capabilities, vec!["network", "fs-read"]);
        assert_eq!(record.capability_red_lines.len(), 1);

        let wire = serde_json::to_value(&record).expect("encode the catalog record");
        assert_eq!(wire["starsCount"], json!("73"), "int64 facts stay decimal strings");
        assert_eq!(wire["downloadsCount"], json!("117679"));
        assert_eq!(wire["installTarget"]["kind"], json!("registry"));
        assert_eq!(wire["installTargets"][1]["packageVersion"], Value::Null);
        assert_eq!(wire["media"][0]["sortOrder"], json!(2));
        assert_eq!(wire["capabilityRedLines"][0], json!("reads credentials and calls the network"));
    }

    /// The curated catalog snapshot is stored verbatim from the upstream
    /// registry, where star and download counts are JSON numbers. Reading that
    /// projection with the strict wire helper discarded the metadata and failed
    /// every marketplace page with `50001`; the record must decode it and still
    /// emit the contract decimal string on the wire.
    #[test]
    fn stored_registry_metadata_numbers_decode_into_the_wire_string_form() {
        let mut value = base_record();
        value["marketplaceMetadata"] = json!({
            "provider": "dsh-market",
            "catalogUrl": "https://github.com/00080000/dsh-project-memory",
            "owner": "00080000",
            "version": "0.7.1",
            "categories": ["memory"],
            "added": "2026-08-20",
            "stars": 34,
            "downloads": 9990,
            "githubReleaseDownloads": 0,
            "capabilityRedLines": [],
            "raw": {}
        });

        let record: PluginRecord =
            serde_json::from_value(value).expect("decode a registry snapshot stored with numbers");
        let metadata = record
            .marketplace_metadata
            .as_ref()
            .expect("stored registry projection");
        assert_eq!(metadata.stars, Some(34));
        assert_eq!(metadata.downloads, Some(9_990));
        assert_eq!(metadata.github_release_downloads, Some(0));

        let wire = serde_json::to_value(&record).expect("encode the catalog record");
        assert_eq!(wire["marketplaceMetadata"]["stars"], json!("34"));
        assert_eq!(wire["marketplaceMetadata"]["downloads"], json!("9990"));
        assert_eq!(
            wire["marketplaceMetadata"]["githubReleaseDownloads"],
            json!("0")
        );
    }
}
