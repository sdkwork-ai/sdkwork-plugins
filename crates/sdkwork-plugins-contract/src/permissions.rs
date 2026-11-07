//! Permission codes for the SDKWork Plugins domain (all prefixed `plugins.`).

/// Admin read of plugin categories.
pub const PERM_ADMIN_CATEGORY_READ: &str = "plugins.admin.category.read";
/// Admin manage (create/update) of plugin categories.
pub const PERM_ADMIN_CATEGORY_MANAGE: &str = "plugins.admin.category.manage";
/// Admin read of managed plugins.
pub const PERM_ADMIN_PLUGIN_READ: &str = "plugins.admin.plugin.read";
/// Admin manage (create/update/delete) of managed plugins.
pub const PERM_ADMIN_PLUGIN_MANAGE: &str = "plugins.admin.plugin.manage";
/// Read the tenant plugin marketplace catalog.
pub const PERM_MARKETPLACE_READ: &str = "plugins.marketplace.read";
/// Install/enable a marketplace plugin for the authenticated principal.
pub const PERM_MARKETPLACE_INSTALL: &str = "plugins.marketplace.install";
