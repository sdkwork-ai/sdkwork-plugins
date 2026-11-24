import type { PluginArtifactSource } from './plugin-artifact-source';
import type { PluginMarketplaceMetadata } from './plugin-marketplace-metadata';

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
  source?: PluginArtifactSource;
  marketplaceMetadata?: PluginMarketplaceMetadata;
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
