use serde::Deserialize;

use sdkwork_plugins_contract::{
    PluginImplementationType, PluginInstallStatus, PluginLifecycleStatus, PluginVisibility,
};

/// Admin upsert command for a plugin category (`pluginsAdmin.upsertCategory`).
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpsertPluginCategoryCommand {
    pub category_code: String,
    pub name: String,
    pub description: Option<String>,
    pub sort_order: Option<i32>,
}

/// Admin create command for a managed plugin (`pluginsAdmin.createPlugin`).
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreatePluginCommand {
    pub plugin_key: String,
    pub name: String,
    pub description: Option<String>,
    pub category_id: Option<i64>,
    pub category_code: Option<String>,
    pub version_label: Option<String>,
    pub provider: Option<String>,
    pub implementation_type: PluginImplementationType,
    pub visibility: Option<PluginVisibility>,
    /// Plugin manifest as a JSON object; defaults to an empty object.
    pub manifest: Option<serde_json::Value>,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(default)]
    pub allowed_role_codes: Vec<String>,
}

/// Admin partial update command for a managed plugin
/// (`pluginsAdmin.updatePlugin`). Omitted fields leave the stored value
/// unchanged.
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdatePluginCommand {
    pub name: Option<String>,
    pub description: Option<String>,
    pub category_id: Option<i64>,
    pub category_code: Option<String>,
    pub version_label: Option<String>,
    pub provider: Option<String>,
    pub implementation_type: Option<PluginImplementationType>,
    pub visibility: Option<PluginVisibility>,
    pub manifest: Option<serde_json::Value>,
    pub install_status: Option<PluginInstallStatus>,
    pub tags: Option<Vec<String>>,
    pub allowed_role_codes: Option<Vec<String>>,
    pub lifecycle_status: Option<PluginLifecycleStatus>,
}
