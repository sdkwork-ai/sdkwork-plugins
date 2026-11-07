//! API assembly for sdkwork-plugins.
//! Application bootstrap lives in `bootstrap.rs`; route inventory is in `assembly-manifest.json`.
//! SDKWORK-ASSEMBLY-LIB-CUSTOM: exports beyond the canonical materializer template.

mod bootstrap;
mod generated;

pub use bootstrap::{
    assemble_api_router, assemble_api_router_with_pool, assemble_app_api_contribution,
    assemble_backend_api_contribution, bootstrap_database_from_env, web_module,
    web_module_with_pool, ApiAssembly,
};

/// Total HTTP operations declared by this assembly's route manifests
/// (6 backend-api admin operations + 3 app-api marketplace operations).
pub fn assembly_route_count() -> usize {
    generated::ROUTE_COUNT
}
