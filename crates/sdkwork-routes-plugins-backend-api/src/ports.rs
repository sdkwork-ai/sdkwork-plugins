#[derive(Debug, Clone)]
pub struct PluginsBackendRequestContext {
    pub tenant_id: u64,
    pub operator_id: Option<u64>,
}
