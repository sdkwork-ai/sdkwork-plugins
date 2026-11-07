#[derive(Debug, Clone)]
pub struct PluginsAppRequestContext {
    pub tenant_id: u64,
    pub actor_id: Option<u64>,
    pub organization_id: Option<u64>,
    pub session_id: Option<String>,
}
