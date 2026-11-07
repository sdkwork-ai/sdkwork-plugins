export interface PluginRecord {
  /** Snowflake entity id serialized as a decimal string (API_SPEC §13.6). */
  id: string;
  uuid: string;
  pluginKey: string;
  name: string;
  description?: string | null;
  categoryId?: string | null;
  categoryCode?: string | null;
  versionLabel: string;
  provider?: string | null;
  implementationType: 'sdkwork-native' | 'rig-rust' | 'openai-agents' | 'langchain' | 'langgraph' | 'crewai' | 'autogen' | 'semantic-kernel' | 'custom';
  visibility: 'private' | 'organization' | 'tenant' | 'public';
  /** Plugin manifest as an arbitrary JSON object. */
  manifest: Record<string, unknown>;
  installStatus: 'available' | 'installed' | 'disabled';
  tags: string[];
  /** IAM role codes allowed to see and use this plugin. An empty list means every role (the default). */
  allowedRoleCodes: string[];
  /** Entity lifecycle status derived from the stored lifecycleStatus code. */
  status: 'draft' | 'active' | 'disabled' | 'archived' | 'deleted';
  version: string;
  createdAt: string;
  updatedAt: string;
}
