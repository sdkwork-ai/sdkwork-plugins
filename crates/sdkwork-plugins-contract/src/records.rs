use serde::{Deserialize, Serialize};

use crate::enums::{
    PluginImplementationType, PluginInstallStatus, PluginLifecycleStatus, PluginVisibility,
};

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
