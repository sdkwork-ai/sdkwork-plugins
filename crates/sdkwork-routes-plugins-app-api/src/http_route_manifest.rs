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
    plugins_route(
        HttpMethod::Put,
        "/app/v3/api/plugin_installations/{hostId}",
        "plugins.syncInstallation",
        PERM_MARKETPLACE_INSTALL,
    ),
];

pub fn app_route_manifest() -> HttpRouteManifest {
    HttpRouteManifest::new(HTTP_ROUTES)
}
