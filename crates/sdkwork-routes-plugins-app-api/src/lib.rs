//! Marketplace HTTP surface for the SDKWork Plugins capability
//! (`/app/v3/api/plugins`, `/app/v3/api/plugin_categories`). A catalog record
//! carries its ranked install targets as record data; the API never executes a
//! local installation.
//!
//! Success bodies use the `SdkWorkApiResponse` envelope: lists return
//! `data.items` + `data.pageInfo`, retrieval returns `data.item`.

mod handlers;
mod health;
pub mod http_route_manifest;
mod http_support;
mod list_query;
mod paths;
mod ports;
mod response;
mod web_bootstrap;

use std::sync::Arc;

use axum::{
    extract::{Extension, Query, State},
    http::{HeaderMap, StatusCode},
    response::Response,
    routing::get,
    Json, Router,
};
use sdkwork_intelligence_plugins_service::{PluginsRepository, PluginsService};
use sdkwork_web_core::{HttpRouteManifest, WebRequestContext};
use sqlx::PgPool;

pub use handlers::{list_categories, list_plugins, retrieve_plugin};
pub use health::DbReadinessCheck;
pub use http_route_manifest::app_route_manifest;
pub use http_support::{resolve_tenant_id, TENANT_HEADER};
pub use list_query::SdkWorkListQuery;
pub use ports::PluginsAppRequestContext;
pub use response::{finish_api_json, ok_json, ApiProblem, ApiResult};
pub use sdkwork_intelligence_plugins_service::SharedPluginsService;
pub use web_bootstrap::{
    plugins_public_path_prefixes, wrap_router_with_web_framework,
    wrap_router_with_web_framework_from_env, PluginsAppContextInjector,
};

#[derive(Clone)]
pub struct AppState<R: PluginsRepository> {
    pub service: SharedPluginsService<R>,
    pub default_tenant_id: u64,
    pub readiness: Option<DbReadinessCheck>,
}

fn business_routes<R>() -> Router<AppState<R>>
where
    R: PluginsRepository + Clone + Send + Sync + 'static,
{
    Router::new()
        .route(paths::PLUGINS_LIST, get(list_plugins_handler))
        .route(paths::PLUGIN_RETRIEVE, get(retrieve_plugin_handler))
        .route(paths::CATEGORIES_LIST, get(list_categories_handler))
}

pub fn business_router<R>(state: AppState<R>) -> Router
where
    R: PluginsRepository + Clone + Send + Sync + 'static,
{
    business_routes::<R>().with_state(state)
}

pub fn router<R>(state: AppState<R>) -> Router
where
    R: PluginsRepository + Clone + Send + Sync + 'static,
{
    Router::new()
        .route(paths::LIVEZ, get(health::livez))
        .route(paths::READYZ, get(readyz_handler::<R>))
        .route(paths::HEALTHZ, get(healthz_handler::<R>))
        .merge(business_routes::<R>())
        .with_state(state)
}

async fn readyz_handler<R>(
    State(state): State<AppState<R>>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)>
where
    R: PluginsRepository + Send + Sync,
{
    health::readyz_with_state(state.readiness.clone()).await
}

async fn healthz_handler<R>(
    State(state): State<AppState<R>>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)>
where
    R: PluginsRepository + Send + Sync,
{
    health::healthz_with_state(state.readiness.clone()).await
}

fn resolve_request_tenant_id(
    ctx: &WebRequestContext,
    context: Option<&Extension<PluginsAppRequestContext>>,
    default_tenant_id: u64,
) -> u64 {
    if let Some(extension) = context {
        return extension.0.tenant_id;
    }
    http_support::resolve_tenant_id_from_context(ctx, default_tenant_id)
}

/// Caller identities the marketplace visibility scope keys on: the organization
/// scope (`0` is the tenant-level sentinel) and the actor user id. Both fall
/// back to `0` when the verified context carries no organization or principal.
fn resolve_request_scope(context: Option<&Extension<PluginsAppRequestContext>>) -> (u64, u64) {
    let app_context = context.map(|extension| &extension.0);
    let organization_id = app_context
        .and_then(|app_context| app_context.organization_id)
        .unwrap_or(0);
    let user_id = app_context
        .and_then(|app_context| app_context.actor_id)
        .unwrap_or(0);
    (organization_id, user_id)
}

async fn list_plugins_handler<R>(
    ctx: WebRequestContext,
    State(state): State<AppState<R>>,
    _headers: HeaderMap,
    Query(query): Query<SdkWorkListQuery>,
    context: Option<Extension<PluginsAppRequestContext>>,
) -> Response
where
    R: PluginsRepository + Send + Sync,
{
    response::finish_api_json(
        &ctx,
        async {
            let tenant_id =
                resolve_request_tenant_id(&ctx, context.as_ref(), state.default_tenant_id);
            let (organization_id, user_id) = resolve_request_scope(context.as_ref());
            ok_json(
                handlers::list_plugins(
                    state.service.as_ref(),
                    tenant_id,
                    organization_id,
                    user_id,
                    &query,
                )
                .await?,
            )
        }
        .await,
    )
}

async fn retrieve_plugin_handler<R>(
    ctx: WebRequestContext,
    State(state): State<AppState<R>>,
    _headers: HeaderMap,
    axum::extract::Path(plugin_key): axum::extract::Path<String>,
    context: Option<Extension<PluginsAppRequestContext>>,
) -> Response
where
    R: PluginsRepository + Send + Sync,
{
    response::finish_api_json(
        &ctx,
        async {
            let tenant_id =
                resolve_request_tenant_id(&ctx, context.as_ref(), state.default_tenant_id);
            let (organization_id, user_id) = resolve_request_scope(context.as_ref());
            ok_json(
                handlers::retrieve_plugin(
                    state.service.as_ref(),
                    tenant_id,
                    organization_id,
                    user_id,
                    plugin_key.as_str(),
                )
                .await?,
            )
        }
        .await,
    )
}

async fn list_categories_handler<R>(
    ctx: WebRequestContext,
    State(state): State<AppState<R>>,
    _headers: HeaderMap,
    Query(query): Query<SdkWorkListQuery>,
    context: Option<Extension<PluginsAppRequestContext>>,
) -> Response
where
    R: PluginsRepository + Send + Sync,
{
    response::finish_api_json(
        &ctx,
        async {
            let tenant_id =
                resolve_request_tenant_id(&ctx, context.as_ref(), state.default_tenant_id);
            ok_json(handlers::list_categories(state.service.as_ref(), tenant_id, &query).await?)
        }
        .await,
    )
}

/// Default tenant for the marketplace surface when no verified context
/// provides one; overridable through `SDKWORK_PLUGINS_TENANT_ID`.
pub fn default_marketplace_tenant_id() -> u64 {
    std::env::var("SDKWORK_PLUGINS_TENANT_ID")
        .ok()
        .and_then(|value| value.parse::<u64>().ok())
        .unwrap_or(100_001)
}

/// Assembly entrypoint required by the plugins export contract: mounts the
/// full health + business router for the marketplace surface.
pub fn build_router<R>(service: Arc<PluginsService<R>>) -> Router
where
    R: PluginsRepository + Clone + Send + Sync + 'static,
{
    router(AppState {
        service,
        default_tenant_id: default_marketplace_tenant_id(),
        readiness: None,
    })
}

pub fn build_router_with_tenant<R>(
    service: Arc<PluginsService<R>>,
    default_tenant_id: u64,
) -> Router
where
    R: PluginsRepository + Clone + Send + Sync + 'static,
{
    router(AppState {
        service,
        default_tenant_id,
        readiness: None,
    })
}

pub fn build_router_with_readiness<R>(
    service: Arc<PluginsService<R>>,
    default_tenant_id: u64,
    pool: PgPool,
) -> Router
where
    R: PluginsRepository + Clone + Send + Sync + 'static,
{
    router(AppState {
        service,
        default_tenant_id,
        readiness: Some(DbReadinessCheck::new(pool)),
    })
}

pub async fn build_router_with_web_framework_from_env<R>(
    service: Arc<PluginsService<R>>,
    default_tenant_id: u64,
    pool: PgPool,
) -> Router
where
    R: PluginsRepository + Clone + Send + Sync + 'static,
{
    wrap_router_with_web_framework_from_env(build_router_with_readiness(
        service,
        default_tenant_id,
        pool,
    ))
    .await
}

pub fn gateway_route_manifest() -> HttpRouteManifest {
    app_route_manifest()
}

pub async fn gateway_mount_business<R>(
    service: Arc<PluginsService<R>>,
    default_tenant_id: u64,
) -> Router
where
    R: PluginsRepository + Clone + Send + Sync + 'static,
{
    wrap_router_with_web_framework_from_env(business_router(AppState {
        service,
        default_tenant_id,
        readiness: None,
    }))
    .await
}

pub async fn gateway_mount<R>(
    service: Arc<PluginsService<R>>,
    default_tenant_id: u64,
    pool: PgPool,
) -> Router
where
    R: PluginsRepository + Clone + Send + Sync + 'static,
{
    build_router_with_web_framework_from_env(service, default_tenant_id, pool).await
}
