export interface CreatePluginCommand {
  pluginKey: string;
  name: string;
  description?: string;
  categoryId?: string;
  categoryCode?: string;
  versionLabel?: string;
  provider?: string;
  implementationType: 'sdkwork-native' | 'rig-rust' | 'openai-agents' | 'langchain' | 'langgraph' | 'crewai' | 'autogen' | 'semantic-kernel' | 'custom';
  visibility?: 'private' | 'organization' | 'tenant' | 'public';
  /** Plugin manifest as an arbitrary JSON object. */
  manifest?: Record<string, unknown>;
  tags?: string[];
  /** IAM role codes allowed to see and use this plugin. An empty list means every role (the default). */
  allowedRoleCodes?: string[];
}
