//! Operation ids for the SDKWork Plugins HTTP surfaces.
//!
//! Backend-api (admin) operations use the `pluginsAdmin` resource prefix; the
//! app-api marketplace surface uses the `plugins` prefix.

pub const OP_ADMIN_LIST_CATEGORIES: &str = "pluginsAdmin.listCategories";
pub const OP_ADMIN_UPSERT_CATEGORY: &str = "pluginsAdmin.upsertCategory";
pub const OP_ADMIN_LIST_PLUGINS: &str = "pluginsAdmin.listPlugins";
pub const OP_ADMIN_CREATE_PLUGIN: &str = "pluginsAdmin.createPlugin";
pub const OP_ADMIN_UPDATE_PLUGIN: &str = "pluginsAdmin.updatePlugin";
pub const OP_ADMIN_DELETE_PLUGIN: &str = "pluginsAdmin.deletePlugin";

pub const OP_APP_LIST_PLUGINS: &str = "plugins.list";
pub const OP_APP_RETRIEVE_PLUGIN: &str = "plugins.retrieve";
pub const OP_APP_LIST_CATEGORIES: &str = "plugins.listCategories";
