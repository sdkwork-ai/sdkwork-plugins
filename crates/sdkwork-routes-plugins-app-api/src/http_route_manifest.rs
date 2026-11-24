use sdkwork_plugins_contract::{PERM_MARKETPLACE_INSTALL, PERM_MARKETPLACE_READ};
use sdkwork_web_core::{HttpMethod, HttpRoute, HttpRouteManifest};

const fn plugins_route(
    method: HttpMethod,
    path: &'static str,
    operation_id: &'static str,
    permission: &'static str,
) -> HttpRoute {
    HttpRoute::dual_token(method, path, "plugins", operation_id)
        .with_required_permission(permission)
}

const HTTP_ROUTES: &[HttpRoute] = &[
    plugins_route(
        HttpMethod::Get,
        "/app/v3/api/plugins",
        "plugins.list",
        PERM_MARKETPLACE_READ,
    ),
    plugins_route(
        HttpMethod::Get,
        "/app/v3/api/plugins/{pluginKey}",
        "plugins.retrieve",
        PERM_MARKETPLACE_READ,
    ),
    plugins_route(
        HttpMethod::Get,
        "/app/v3/api/plugin_categories",
        "plugins.listCategories",
        PERM_MARKETPLACE_READ,
    ),
];

/// The user-scoped install lifecycle has moved to the client's Host profile,
/// so the marketplace serves install targets as record data and the code
/// stays a reserved IAM inventory export rather than a route permission.
pub const RESERVED_MARKETPLACE_INSTALL_PERMISSION: &str = PERM_MARKETPLACE_INSTALL;

pub fn app_route_manifest() -> HttpRouteManifest {
    HttpRouteManifest::new(HTTP_ROUTES)
}
