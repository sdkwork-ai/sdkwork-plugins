import type { PluginMarketplaceCommit } from './plugin-marketplace-commit';
import type { PluginMarketplaceRelease } from './plugin-marketplace-release';

/** Curated registry metadata. catalogUrl is the registry-authoritative identity; install is display-only. */
export interface PluginMarketplaceMetadata {
  provider: string;
  catalogUrl: string;
  pageUrl?: string | null;
  owner?: string | null;
  npmPackage?: string | null;
  tarballUrl?: string | null;
  repositoryUrl?: string | null;
  repositoryPath?: string | null;
  repositoryRef?: string | null;
  version?: string | null;
  /** Display-only legacy CLI text. */
  install?: string | null;
  categories?: string[];
  added?: string | null;
  stars?: string | null;
  starsCheckedAt?: string | null;
  downloads?: string | null;
  downloadsStart?: string | null;
  downloadsEnd?: string | null;
  downloadsCheckedAt?: string | null;
  githubReleaseDownloads?: string | null;
  releaseManifest?: Record<string, unknown>;
  release?: PluginMarketplaceRelease | null;
  recentCommits?: PluginMarketplaceCommit[];
  updatesCheckedAt?: string | null;
  iconUrl?: string | null;
  screenshots?: string[];
  capabilities?: string[];
  capabilityRedLines?: string[];
  capabilityCheckedAt?: string | null;
  deprecated?: boolean;
  replacement?: string | null;
  previousNpm?: string[];
  catalogRevision?: string | null;
  raw?: Record<string, unknown>;
}
