import type { PluginArtifactSource } from './plugin-artifact-source';
import type { PluginInstallTarget } from './plugin-install-target';
import type { PluginMarketplaceMetadata } from './plugin-marketplace-metadata';
import type { PluginMedia } from './plugin-media';

export interface PluginRecord {
  /** Snowflake entity id serialized as a decimal string (API_SPEC §13.6). */
  id: string;
  uuid: string;
  /** Organization scope of the record. `0` is the tenant-level sentinel (API_SPEC §13.6). */
  organizationId: string;
  /** Owner of a `private` plugin; catalog reads scope `private` rows to this user id (API_SPEC §13.6). */
  ownerUserId: string;
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
  source?: PluginArtifactSource;
  marketplaceMetadata?: PluginMarketplaceMetadata;
  /** Localized display names keyed by BCP-47 locale. */
  nameLocales: Record<string, string>;
  /** Localized descriptions keyed by BCP-47 locale. */
  descriptionLocales: Record<string, string>;
  /** Plugin icon URL resolved through SDKWork media. */
  iconUrl: string | null;
  /** Usage count used for catalog ranking and display. */
  usageCount: string;
  /** Whether the plugin is eligible for featured placement. */
  featured: boolean;
  /** Lower values appear first among featured plugins. */
  featuredOrder: number;
  /** Localized featured-card titles keyed by BCP-47 locale. */
  featuredTitleLocales: Record<string, string>;
  /** Localized featured-card descriptions keyed by BCP-47 locale. */
  featuredDescriptionLocales: Record<string, string>;
  /** Featured-card image URL resolved through SDKWork media. */
  featuredImageUrl: string | null;
  /** Provider that authored the catalog entry: `sdkwork` for SDKWork-owned rows, `dsh-market` for curated registry imports. */
  catalogProvider: string;
  /** Registry-authoritative identity of a catalog entry. */
  catalogUrl: string | null;
  /** Human-readable registry page for the entry. */
  catalogPageUrl: string | null;
  /** Registry owner login, such as a GitHub account. */
  ownerLogin: string | null;
  npmPackage: string | null;
  tarballUrl: string | null;
  repositoryUrl: string | null;
  repositoryPath: string | null;
  repositoryRef: string | null;
  registryVersion: string | null;
  /** Registry first-publication date (YYYY-MM-DD). */
  addedOn: string | null;
  /** Star count captured by the catalog importer (API_SPEC §13.6). */
  starsCount: string;
  starsCheckedAt: string | null;
  /** Download count captured by the catalog importer (API_SPEC §13.6). */
  downloadsCount: string;
  /** First day of the download-count window (YYYY-MM-DD). */
  downloadsStart: string | null;
  /** Last day of the download-count window (YYYY-MM-DD). */
  downloadsEnd: string | null;
  downloadsCheckedAt: string | null;
  /** Whether the registry marks the entry as deprecated. */
  isDeprecated: boolean;
  /** Successor entry named by a deprecated registry record. */
  replacedByCatalogUrl: string | null;
  /** Catalog snapshot revision the entry was imported from. */
  catalogRevision: string | null;
  /** Stored default install target, when the catalog provides one. */
  installTarget: PluginInstallTarget | null;
  /** Every stored install target, ordered by source priority. */
  installTargets: PluginInstallTarget[];
  /** Media assets, ordered by kind then display order. */
  media: PluginMedia[];
  /** Declared capability codes, in disclosure order. */
  capabilities: string[];
  /** Declared red-line disclosures, in disclosure order. */
  capabilityRedLines: string[];
}
