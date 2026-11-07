use serde::{Deserialize, Serialize};

use crate::enums::{PluginInstallStatus, PluginLifecycleStatus, PluginImplementationType, PluginVisibility};

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
