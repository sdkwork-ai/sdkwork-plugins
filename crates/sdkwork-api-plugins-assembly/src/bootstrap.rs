//! Gateway bootstrap for sdkwork-plugins.
//! Multi-surface merges mount shared infrastructure routes once at the assembly layer.
//!
//! The assembly exports the indivisible `ApiAssemblyContribution` contract
//! (API_ASSEMBLY_SPEC.md section 4); the platform cloud gateway composes the
//! contribution with its process-shared PostgreSQL pool.

use sdkwork_web_bootstrap::WebModule;
use std::sync::Arc;

use axum::Router;
use sdkwork_database_sqlx::DatabasePool;
use sdkwork_intelligence_plugins_repository_sqlx::SqlxPluginsRepository;
use sdkwork_intelligence_plugins_service::PluginsService;
use sdkwork_plugins_database_host::bootstrap_plugins_database;
use sdkwork_routes_plugins_app_api::DbReadinessCheck;
use sdkwork_web_bootstrap::ApiAssemblyContribution;
use sdkwork_web_core::HttpRouteManifest;
use sqlx::PgPool;

/// Indivisible host-neutral API assembly contribution (web-bootstrap contract).
pub type ApiAssembly = ApiAssemblyContribution;

struct PluginsRuntime {
    service: Arc<PluginsService<SqlxPluginsRepository>>,
    default_tenant_id: u64,
    pool: PgPool,
}

impl PluginsRuntime {
    async fn bootstrap_from_database(pool: DatabasePool) -> Result<Self, String> {
        let host = bootstrap_plugins_database(pool).await?;
        let pg_pool = host
            .postgres_pool()
            .ok_or_else(|| "plugins runtime requires postgres database pool".to_string())?
            .clone();
        let id_generator = host.id_generator();
        let repository = SqlxPluginsRepository::new(pg_pool.clone(), id_generator);
        let service = Arc::new(PluginsService::new(repository));
        let default_tenant_id = resolve_default_tenant_id();
        Ok(Self {
            service,
            default_tenant_id,
            pool: pg_pool,
        })
    }

    async fn bootstrap_from_env() -> Result<Self, String> {
        let host = sdkwork_plugins_database_host::bootstrap_plugins_database_from_env().await?;
        let pg_pool = host
            .postgres_pool()
            .ok_or_else(|| "plugins runtime requires postgres database pool".to_string())?
            .clone();
        let id_generator = host.id_generator();
        let repository = SqlxPluginsRepository::new(pg_pool.clone(), id_generator);
        let service = Arc::new(PluginsService::new(repository));
        let default_tenant_id = resolve_default_tenant_id();
        Ok(Self {
            service,
            default_tenant_id,
            pool: pg_pool,
        })
    }
}

fn resolve_default_tenant_id() -> u64 {
    std::env::var("SDKWORK_PLUGINS_TENANT_ID")
        .ok()
        .and_then(|value| value.parse::<u64>().ok())
        .unwrap_or(100_001)
}

fn combined_route_manifest() -> HttpRouteManifest {
    let routes = sdkwork_routes_plugins_app_api::gateway_route_manifest()
        .routes()
        .iter()
        .chain(sdkwork_routes_plugins_backend_api::gateway_route_manifest().routes())
        .copied()
        .collect();
    HttpRouteManifest::from_owned_routes(routes)
}

async fn assemble_api_router_from_runtime(runtime: PluginsRuntime) -> Result<ApiAssembly, String> {
    let service = runtime.service.clone();
    let tenant_id = runtime.default_tenant_id;
    let pool = runtime.pool.clone();

    let app_router = sdkwork_routes_plugins_app_api::business_router(
        sdkwork_routes_plugins_app_api::AppState {
            service: service.clone(),
            default_tenant_id: tenant_id,
            readiness: None,
        },
    );
    let backend_router = sdkwork_routes_plugins_backend_api::business_router(
        sdkwork_routes_plugins_backend_api::BackendState {
            service,
            default_tenant_id: tenant_id,
            readiness: None,
        },
    );
    let router = Router::new().merge(app_router).merge(backend_router);
    ApiAssemblyContribution::from_manifest(
        "sdkwork-plugins",
        "SDKWork Plugins API",
        router,
        combined_route_manifest(),
        vec![
            Arc::new(sdkwork_routes_plugins_app_api::PluginsAppContextInjector),
            Arc::new(sdkwork_routes_plugins_backend_api::PluginsBackendContextInjector),
        ],
        Arc::new(DbReadinessCheck::new(pool)),
    )
}

pub async fn assemble_api_router() -> Result<ApiAssembly, String> {
    let runtime = PluginsRuntime::bootstrap_from_env().await?;
    assemble_api_router_from_runtime(runtime).await
}

/// Assemble the plugins contribution against a caller-provided database pool
/// so the platform cloud gateway can share its process-wide PostgreSQL pool.
pub async fn assemble_api_router_with_pool(pool: DatabasePool) -> Result<ApiAssembly, String> {
    let runtime = PluginsRuntime::bootstrap_from_database(pool).await?;
    assemble_api_router_from_runtime(runtime).await
}

/// Runs the plugins-owned database lifecycle without constructing HTTP routes.
pub async fn bootstrap_database_from_env() -> Result<(), String> {
    sdkwork_plugins_database_host::bootstrap_plugins_database_from_env()
        .await
        .map(|_| ())
}

/// Builds the plugins App API as a composing-owner contribution. The returned
/// router carries only business routes; the composing gateway supplies the
/// web framework layer, domain context injection, and readiness aggregation.
pub async fn assemble_app_api_contribution() -> Result<ApiAssemblyContribution, String> {
    let runtime = PluginsRuntime::bootstrap_from_env().await?;
    let service = runtime.service.clone();
    let tenant_id = runtime.default_tenant_id;
    let pool = runtime.pool.clone();

    let route_manifest = sdkwork_routes_plugins_app_api::app_route_manifest();
    let router = sdkwork_routes_plugins_app_api::business_router(
        sdkwork_routes_plugins_app_api::AppState {
            service,
            default_tenant_id: tenant_id,
            readiness: None,
        },
    );
    ApiAssemblyContribution::from_manifest(
        "sdkwork-plugins",
        "SDKWork Plugins App API",
        router,
        route_manifest,
        vec![Arc::new(sdkwork_routes_plugins_app_api::PluginsAppContextInjector)],
        Arc::new(DbReadinessCheck::new(pool)),
    )
}

/// Builds the plugins Backend API as a composing-owner contribution.
pub async fn assemble_backend_api_contribution() -> Result<ApiAssemblyContribution, String> {
    let runtime = PluginsRuntime::bootstrap_from_env().await?;
    let service = runtime.service.clone();
    let tenant_id = runtime.default_tenant_id;
    let pool = runtime.pool.clone();

    let route_manifest = sdkwork_routes_plugins_backend_api::backend_route_manifest();
    let router = sdkwork_routes_plugins_backend_api::business_router(
        sdkwork_routes_plugins_backend_api::BackendState {
            service,
            default_tenant_id: tenant_id,
            readiness: None,
        },
    );
    ApiAssemblyContribution::from_manifest(
        "sdkwork-plugins",
        "SDKWork Plugins Backend API",
        router,
        route_manifest,
        vec![Arc::new(
            sdkwork_routes_plugins_backend_api::PluginsBackendContextInjector,
        )],
        Arc::new(DbReadinessCheck::new(pool)),
    )
}

/// Canonical Web Module definition for this application
/// (API_ASSEMBLY_SPEC §4.1.1): the complete HTTP surface — every route,
/// manifest, and OpenAPI document of this owner — as one installable module.
pub async fn web_module() -> Result<WebModule, String> {
    Ok(WebModule::from_contribution(assemble_api_router().await?))
}

/// Same as [`web_module`] but composed on a process-shared database pool
/// (platform gateways, API_ASSEMBLY_SPEC §4.1.1).
pub async fn web_module_with_pool(pool: DatabasePool) -> Result<WebModule, String> {
    Ok(WebModule::from_contribution(
        assemble_api_router_with_pool(pool).await?,
    ))
}
