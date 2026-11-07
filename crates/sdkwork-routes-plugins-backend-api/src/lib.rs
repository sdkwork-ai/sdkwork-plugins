//! Admin HTTP surface for the SDKWork Plugins capability
//! (`/backend/v3/api/plugin_categories`, `/backend/v3/api/plugins`).
//!
//! Success bodies use the `SdkWorkApiResponse` envelope: lists return
//! `data.items` + `data.pageInfo`, creates return HTTP 201 with `data.item`,
//! upserts/updates return 200 with `data.item`, and deletes return HTTP 204
//! with no body.

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
    routing::{delete, get, post, put},
    Json, Router,
};
use sdkwork_intelligence_plugins_service::{PluginsRepository, PluginsService};
use sdkwork_web_core::{HttpRouteManifest, WebRequestContext};
use sqlx::PgPool;

pub use handlers::{
    create_plugin, default_category_record, default_plugin_record, delete_plugin, list_categories,
    list_plugins, update_plugin, upsert_category,
};
pub use sdkwork_intelligence_plugins_service::SharedPluginsService;
pub use health::DbReadinessCheck;
pub use http_route_manifest::backend_route_manifest;
pub use http_support::{resolve_tenant_id, TENANT_HEADER};
pub use list_query::SdkWorkListQuery;
pub use ports::PluginsBackendRequestContext;
pub use response::{
    finish_api_json, finish_created_api_json, finish_no_content, ok_json, ApiProblem, ApiResult,
};
pub use web_bootstrap::{
    plugins_backend_public_path_prefixes, wrap_router_with_web_framework,
    wrap_router_with_web_framework_from_env, PluginsBackendContextInjector,
};

#[derive(Clone)]
pub struct BackendState<R: PluginsRepository> {
    pub service: SharedPluginsService<R>,
    pub default_tenant_id: u64,
    pub readiness: Option<DbReadinessCheck>,
}

fn business_routes<R>() -> Router<BackendState<R>>
where
    R: PluginsRepository + Clone + Send + Sync + 'static,
{
    Router::new()
        .route(paths::ADMIN_CATEGORIES_LIST, get(list_categories_handler))
        .route(paths::ADMIN_CATEGORY_UPSERT, post(upsert_category_handler))
        .route(paths::ADMIN_PLUGINS_LIST, get(list_plugins_handler))
        .route(paths::ADMIN_PLUGIN_CREATE, post(create_plugin_handler))
        .route(paths::ADMIN_PLUGIN_UPDATE, put(update_plugin_handler))
        .route(paths::ADMIN_PLUGIN_DELETE, delete(delete_plugin_handler))
}

pub fn business_router<R>(state: BackendState<R>) -> Router
where
    R: PluginsRepository + Clone + Send + Sync + 'static,
{
    business_routes::<R>().with_state(state)
}

pub fn router<R>(state: BackendState<R>) -> Router
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
    State(state): State<BackendState<R>>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)>
where
    R: PluginsRepository + Send + Sync,
{
    health::readyz_with_state(state.readiness.clone()).await
}

async fn healthz_handler<R>(
    State(state): State<BackendState<R>>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)>
where
    R: PluginsRepository + Send + Sync,
{
    health::healthz_with_state(state.readiness.clone()).await
}

fn resolve_request_tenant_id(
    ctx: &WebRequestContext,
    context: Option<&Extension<PluginsBackendRequestContext>>,
    default_tenant_id: u64,
) -> u64 {
    if let Some(extension) = context {
        return extension.0.tenant_id;
    }
    http_support::resolve_tenant_id_from_context(ctx, default_tenant_id)
}

async fn list_categories_handler<R>(
    ctx: WebRequestContext,
    State(state): State<BackendState<R>>,
    _headers: HeaderMap,
    Query(query): Query<list_query::SdkWorkListQuery>,
    context: Option<Extension<PluginsBackendRequestContext>>,
) -> Response
where
    R: PluginsRepository + Send + Sync,
{
    response::finish_api_json(&ctx, async {
        let tenant_id = resolve_request_tenant_id(&ctx, context.as_ref(), state.default_tenant_id);
        ok_json(handlers::list_categories(state.service.as_ref(), tenant_id, &query).await?)
    }.await)
}

async fn upsert_category_handler<R>(
    ctx: WebRequestContext,
    State(state): State<BackendState<R>>,
    _headers: HeaderMap,
    context: Option<Extension<PluginsBackendRequestContext>>,
    Json(body): Json<sdkwork_intelligence_plugins_service::UpsertPluginCategoryCommand>,
) -> Response
where
    R: PluginsRepository + Send + Sync,
{
    response::finish_api_json(&ctx, async {
        let tenant_id = resolve_request_tenant_id(&ctx, context.as_ref(), state.default_tenant_id);
        let operator_id = context
            .as_ref()
            .and_then(|value| value.0.operator_id)
            .unwrap_or(0);
        ok_json(
            upsert_category(state.service.as_ref(), tenant_id, operator_id, body).await?,
        )
    }.await)
}

async fn list_plugins_handler<R>(
    ctx: WebRequestContext,
    State(state): State<BackendState<R>>,
    _headers: HeaderMap,
    Query(query): Query<list_query::SdkWorkListQuery>,
    context: Option<Extension<PluginsBackendRequestContext>>,
) -> Response
where
    R: PluginsRepository + Send + Sync,
{
    response::finish_api_json(&ctx, async {
        let tenant_id = resolve_request_tenant_id(&ctx, context.as_ref(), state.default_tenant_id);
        ok_json(handlers::list_plugins(state.service.as_ref(), tenant_id, &query).await?)
    }.await)
}

async fn create_plugin_handler<R>(
    ctx: WebRequestContext,
    State(state): State<BackendState<R>>,
    _headers: HeaderMap,
    context: Option<Extension<PluginsBackendRequestContext>>,
    Json(body): Json<sdkwork_intelligence_plugins_service::CreatePluginCommand>,
) -> Response
where
    R: PluginsRepository + Send + Sync,
{
    response::finish_created_api_json(&ctx, async {
        let tenant_id = resolve_request_tenant_id(&ctx, context.as_ref(), state.default_tenant_id);
        let operator_id = context
            .as_ref()
            .and_then(|value| value.0.operator_id)
            .unwrap_or(0);
        ok_json(
            handlers::create_plugin(state.service.as_ref(), tenant_id, operator_id, body).await?,
        )
    }.await)
}

async fn update_plugin_handler<R>(
    ctx: WebRequestContext,
    State(state): State<BackendState<R>>,
    _headers: HeaderMap,
    axum::extract::Path(plugin_key): axum::extract::Path<String>,
    context: Option<Extension<PluginsBackendRequestContext>>,
    Json(body): Json<sdkwork_intelligence_plugins_service::UpdatePluginCommand>,
) -> Response
where
    R: PluginsRepository + Send + Sync,
{
    response::finish_api_json(&ctx, async {
        let tenant_id = resolve_request_tenant_id(&ctx, context.as_ref(), state.default_tenant_id);
        let operator_id = context
            .as_ref()
            .and_then(|value| value.0.operator_id)
            .unwrap_or(0);
        ok_json(
            handlers::update_plugin(
                state.service.as_ref(),
                tenant_id,
                operator_id,
                plugin_key.as_str(),
                body,
            )
            .await?,
        )
    }.await)
}

async fn delete_plugin_handler<R>(
    ctx: WebRequestContext,
    State(state): State<BackendState<R>>,
    _headers: HeaderMap,
    axum::extract::Path(plugin_key): axum::extract::Path<String>,
    context: Option<Extension<PluginsBackendRequestContext>>,
) -> Response
where
    R: PluginsRepository + Send + Sync,
{
    response::finish_no_content(&ctx, async {
        let tenant_id = resolve_request_tenant_id(&ctx, context.as_ref(), state.default_tenant_id);
        handlers::delete_plugin(state.service.as_ref(), tenant_id, plugin_key.as_str()).await?;
        Ok(())
    }.await)
}

pub fn build_router<R>(service: Arc<PluginsService<R>>, default_tenant_id: u64) -> Router
where
    R: PluginsRepository + Clone + Send + Sync + 'static,
{
    router(BackendState {
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
    router(BackendState {
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
    backend_route_manifest()
}

pub async fn gateway_mount_business<R>(
    service: Arc<PluginsService<R>>,
    default_tenant_id: u64,
) -> Router
where
    R: PluginsRepository + Clone + Send + Sync + 'static,
{
    wrap_router_with_web_framework_from_env(business_router(BackendState {
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
