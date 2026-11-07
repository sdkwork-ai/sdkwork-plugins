use sdkwork_plugins_contract::{
    PERM_ADMIN_CATEGORY_MANAGE, PERM_ADMIN_CATEGORY_READ, PERM_ADMIN_PLUGIN_MANAGE,
    PERM_ADMIN_PLUGIN_READ,
};
use sdkwork_web_core::{HttpMethod, HttpRoute, HttpRouteManifest, RateLimitTier};

const fn admin_route(
    method: HttpMethod,
    path: &'static str,
    operation_id: &'static str,
    permission: &'static str,
) -> HttpRoute {
    HttpRoute::dual_token(method, path, "plugins-admin", operation_id)
        .with_required_permission(permission)
}

const fn abuse_sensitive_admin_route(
    method: HttpMethod,
    path: &'static str,
    operation_id: &'static str,
    permission: &'static str,
) -> HttpRoute {
    HttpRoute::dual_token(method, path, "plugins-admin", operation_id)
        .with_rate_limit_tier(RateLimitTier::AuthCritical)
        .with_required_permission(permission)
}

const HTTP_ROUTES: &[HttpRoute] = &[
    admin_route(
        HttpMethod::Get,
        "/backend/v3/api/plugin_categories",
        "pluginsAdmin.listCategories",
        PERM_ADMIN_CATEGORY_READ,
    ),
    admin_route(
        HttpMethod::Post,
        "/backend/v3/api/plugin_categories",
        "pluginsAdmin.upsertCategory",
        PERM_ADMIN_CATEGORY_MANAGE,
    ),
    admin_route(
        HttpMethod::Get,
        "/backend/v3/api/plugins",
        "pluginsAdmin.listPlugins",
        PERM_ADMIN_PLUGIN_READ,
    ),
    admin_route(
        HttpMethod::Post,
        "/backend/v3/api/plugins",
        "pluginsAdmin.createPlugin",
        PERM_ADMIN_PLUGIN_MANAGE,
    ),
    admin_route(
        HttpMethod::Put,
        "/backend/v3/api/plugins/{pluginKey}",
        "pluginsAdmin.updatePlugin",
        PERM_ADMIN_PLUGIN_MANAGE,
    ),
    abuse_sensitive_admin_route(
        HttpMethod::Delete,
        "/backend/v3/api/plugins/{pluginKey}",
        "pluginsAdmin.deletePlugin",
        PERM_ADMIN_PLUGIN_MANAGE,
    ),
];

pub fn backend_route_manifest() -> HttpRouteManifest {
    HttpRouteManifest::new(HTTP_ROUTES)
}
