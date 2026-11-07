use axum::http::HeaderMap;
use sdkwork_web_core::WebRequestContext;

/// Legacy constant retained for docs/tests. Dual-token app/backend surfaces
/// must not accept this header (`API_SPEC.md` section 10.2); tenant comes from
/// the verified `WebRequestContext`.
pub const TENANT_HEADER: &str = "x-sdkwork-tenant-id";

/// Resolve tenant for plugins handlers. Prefer the verified request context;
/// never trust client identity projection headers.
pub fn resolve_tenant_id_from_context(ctx: &WebRequestContext, default_tenant_id: u64) -> u64 {
    ctx.tenant_id()
        .and_then(|value| value.parse().ok())
        .unwrap_or(default_tenant_id)
}

/// @deprecated Prefer [`resolve_tenant_id_from_context`]. Header-based tenant
/// resolution is forbidden for dual-token surfaces; this always returns the
/// assembly default.
pub fn resolve_tenant_id(_headers: &HeaderMap, default_tenant_id: u64) -> u64 {
    default_tenant_id
}
