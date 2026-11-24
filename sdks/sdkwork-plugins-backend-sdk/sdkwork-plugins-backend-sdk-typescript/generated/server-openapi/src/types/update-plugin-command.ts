import type { PluginArtifactSource } from './plugin-artifact-source';

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
  source?: PluginArtifactSource;
  /** Localized display names keyed by BCP-47 locale. */
  nameLocales?: Record<string, string>;
  /** Localized descriptions keyed by BCP-47 locale. */
  descriptionLocales?: Record<string, string>;
  /** Plugin icon URL resolved through SDKWork media. */
  iconUrl?: string | null;
  /** Whether the plugin is eligible for featured placement. */
  featured?: boolean;
  /** Lower values appear first among featured plugins. */
  featuredOrder?: number;
  /** Localized featured-card titles keyed by BCP-47 locale. */
  featuredTitleLocales?: Record<string, string>;
  /** Localized featured-card descriptions keyed by BCP-47 locale. */
  featuredDescriptionLocales?: Record<string, string>;
  /** Featured-card image URL resolved through SDKWork media. */
  featuredImageUrl?: string | null;
}
