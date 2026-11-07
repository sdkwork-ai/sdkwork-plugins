/** Partial update command; omitted fields leave the stored value unchanged. */
export interface UpdatePluginCommand {
  name?: string;
  description?: string;
  categoryId?: string;
  categoryCode?: string;
  versionLabel?: string;
  provider?: string;
  implementationType?: 'sdkwork-native' | 'rig-rust' | 'openai-agents' | 'langchain' | 'langgraph' | 'crewai' | 'autogen' | 'semantic-kernel' | 'custom';
  visibility?: 'private' | 'organization' | 'tenant' | 'public';
  manifest?: Record<string, unknown>;
  installStatus?: 'available' | 'installed' | 'disabled';
  tags?: string[];
  /** Full replacement list; omitted leaves the assignment unchanged. */
  allowedRoleCodes?: string[];
  /** Target entity lifecycle. The deleted state is only reachable through pluginsAdmin.deletePlugin. */
  lifecycleStatus?: 'draft' | 'active' | 'disabled' | 'archived';
}
