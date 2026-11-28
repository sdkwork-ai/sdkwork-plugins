import type { SdkworkPluginsAppClient } from '@sdkwork/plugins-app-sdk';
import type { PluginCategoryRecord, PluginRecord } from '@sdkwork/plugins-app-sdk';
import type { MarketplaceInstallTarget, MarketplaceInstallTargetKind } from '../types.ts';

export interface MarketplaceCatalog {
  categories: PluginCategoryRecord[];
  featuredPlugins: PluginRecord[];
  popularPlugins: PluginRecord[];
  hasMore: boolean;
}

export function mergeMarketplaceCatalog(
  current: MarketplaceCatalog,
  next: MarketplaceCatalog,
  page: number,
): MarketplaceCatalog {
  const existingPluginKeys = new Set(current.popularPlugins.map(plugin => plugin.pluginKey));
  const popularPlugins = page === 1
    ? next.popularPlugins
    : [
        ...current.popularPlugins,
        ...next.popularPlugins.filter(plugin => {
          if (existingPluginKeys.has(plugin.pluginKey)) return false;
          existingPluginKeys.add(plugin.pluginKey);
          return true;
        }),
      ];

  return {
    categories: next.categories,
    featuredPlugins: page === 1 ? next.featuredPlugins : current.featuredPlugins,
    popularPlugins,
    hasMore: next.hasMore,
  };
}

export interface MarketplaceAppClient {
  plugins: Pick<SdkworkPluginsAppClient['plugins'], 'list' | 'listCategories'>;
}

/**
 * The catalog fields install handling reads. The generated SDK type does not
 * expose the server install projection until the SDK is regenerated, so the
 * server fields are read through this narrow shape instead of `any`.
 */
export interface MarketplaceInstallRecord {
  /** `null` is a real wire value for a record without package content. */
  source?: PluginRecord['source'] | null;
  /** Server-authoritative install target for this record. */
  installTarget?: unknown;
  /** Ranked install targets; the default target wins. */
  installTargets?: unknown;
  /** Registry version of the catalog entry, when the record carries one. */
  registryVersion?: unknown;
  marketplaceMetadata?: unknown;
}

const INSTALL_TARGET_KINDS: readonly MarketplaceInstallTargetKind[] = ['registry', 'archive', 'git', 'path', 'drive'];
/**
 * Cards the featured shelf asks for. The page's featured grid is two columns, so
 * four fills two rows; the shelf is a fixed showcase rather than a paginated
 * list, and the catalog seed places the same number of entries.
 */
export const FEATURED_PAGE_SIZE = 4;
const REGISTRY_PACKAGE_NAME = /^(?:@[a-z0-9][a-z0-9._~-]*\/)?[a-z0-9][a-z0-9._~-]*$/iu;
const EXACT_VERSION = /^\d+\.\d+\.\d+(?:-[0-9a-z][0-9a-z.-]*)?$/iu;
const ARCHIVE_PATH = /\.(?:tgz|tar\.gz|zip)$/iu;
const UNSAFE_GIT_REFERENCE = /[#&:\\\s]/u;
const UNSAFE_GIT_DIRECTORY = /[#&?\\\s]/u;

export async function loadMarketplaceCatalog(
  client: MarketplaceAppClient,
  options: {
    search?: string;
    categoryCode?: string;
    signal?: AbortSignal;
    popularPage?: number;
    includeFeatured?: boolean;
  } = {},
): Promise<MarketplaceCatalog> {
  const { search = '', categoryCode, signal, popularPage = 1, includeFeatured = false } = options;
  const query = search.trim() || undefined;
  const sharedFilters = { q: query, categoryCode };
  const [categories, featuredPage, popularPageResult] = await Promise.all([
    client.plugins.listCategories({ page: 1, pageSize: 200 }, { signal }),
    includeFeatured
      ? client.plugins.list({
        page: 1,
        pageSize: FEATURED_PAGE_SIZE,
        ...sharedFilters,
        featuredOnly: true,
      }, { signal })
      : Promise.resolve({ items: [] as PluginRecord[] }),
    client.plugins.list({
      page: popularPage,
      pageSize: 48,
      ...sharedFilters,
      sort: 'usage_count_desc',
    }, { signal }),
  ]);
  return {
    categories: categories.items,
    featuredPlugins: featuredPage.items,
    popularPlugins: popularPageResult.items,
    hasMore: popularPageResult.pageInfo.hasMore ?? popularPage < (popularPageResult.pageInfo.totalPages ?? popularPage),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function text(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
}

/** Parse an https URL without credentials; query and fragment are inspected by callers. */
function httpsUrl(value: string): URL | undefined {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.username === '' && url.password === '' ? url : undefined;
  } catch {
    return undefined;
  }
}

function installTargetKind(value: unknown): MarketplaceInstallTargetKind | undefined {
  return INSTALL_TARGET_KINDS.find(kind => kind === value);
}

/**
 * Compose the git install spec (`git+<repository>.git#<ref>&path:/<directory>`)
 * the server install plan produces for the same repository.
 */
function gitInstallSpec(repository: string, reference?: string, directory?: string): string | undefined {
  const url = httpsUrl(repository);
  if (url === undefined || url.search !== '' || url.hash !== '') return undefined;
  const path = url.pathname.replace(/\/+$/u, '').replace(/\.git$/iu, '').replace(/\/+$/u, '');
  if (path.split('/').filter(segment => segment !== '').length === 0) return undefined;
  const ref = text(reference);
  if (ref !== undefined && UNSAFE_GIT_REFERENCE.test(ref)) return undefined;
  const rawDirectory = text(directory);
  const rawPath = rawDirectory === undefined || rawDirectory === '.' ? undefined : rawDirectory.replace(/^\/+|\/+$/gu, '');
  if (rawPath !== undefined && (rawPath === '' || UNSAFE_GIT_DIRECTORY.test(rawPath) || rawPath.split('/').includes('..'))) {
    return undefined;
  }
  const parameters: string[] = [];
  if (ref !== undefined) parameters.push(ref);
  else if (rawPath !== undefined) parameters.push('HEAD');
  if (rawPath !== undefined) parameters.push(`path:/${rawPath}`);
  return `git+${url.origin}${path}.git${parameters.length === 0 ? '' : `#${parameters.join('&')}`}`;
}

/** Build a target with the full shape so every producer returns the same fields. */
function installTarget(
  kind: MarketplaceInstallTargetKind,
  spec: string,
  options: { packageName?: string | null; packageVersion?: string | null; isDefault?: boolean } = {},
): MarketplaceInstallTarget {
  return {
    kind,
    spec,
    packageName: options.packageName ?? null,
    packageVersion: options.packageVersion ?? null,
    isDefault: options.isDefault === true,
  };
}

/** Normalize one server install target; a target without a known kind or spec is ignored. */
function normalizeInstallTarget(value: unknown): MarketplaceInstallTarget | undefined {
  if (!isRecord(value)) return undefined;
  const kind = installTargetKind(value.kind);
  const spec = text(value.spec);
  if (kind === undefined || spec === undefined) return undefined;
  return installTarget(kind, spec, {
    packageName: text(value.packageName),
    packageVersion: text(value.packageVersion),
    isDefault: value.isDefault === true,
  });
}

function serverInstallTarget(plugin: MarketplaceInstallRecord): MarketplaceInstallTarget | undefined {
  const direct = normalizeInstallTarget(plugin.installTarget);
  if (direct !== undefined) return direct;
  if (!Array.isArray(plugin.installTargets)) return undefined;
  const targets = plugin.installTargets
    .map(normalizeInstallTarget)
    .filter((target): target is MarketplaceInstallTarget => target !== undefined);
  return targets.find(target => target.isDefault === true) ?? targets[0];
}

function artifactInstallTarget(source: PluginRecord['source'] | null): MarketplaceInstallTarget | undefined {
  if (source == null) return undefined;
  switch (source.kind) {
    case 'git': {
      const spec = gitInstallSpec(source.repositoryUrl, source.gitRef ?? undefined, source.repositoryPath);
      return spec === undefined ? undefined : installTarget('git', spec);
    }
    case 'drive_file':
    case 'drive_directory': {
      const spec = text(source.driveUri);
      return spec === undefined ? undefined : installTarget('drive', spec);
    }
    default:
      return undefined;
  }
}

function legacyRegistryTarget(metadata: Record<string, unknown>): MarketplaceInstallTarget | undefined {
  const name = text(metadata.npmPackage) ?? text(metadata.npm);
  if (name === undefined || !REGISTRY_PACKAGE_NAME.test(name)) return undefined;
  const version = text(metadata.version);
  const pinned = version !== undefined && EXACT_VERSION.test(version) ? version : undefined;
  return installTarget('registry', pinned === undefined ? name : `${name}@${pinned}`, { packageName: name, packageVersion: pinned });
}

function legacyArchiveTarget(metadata: Record<string, unknown>): MarketplaceInstallTarget | undefined {
  const tarball = text(metadata.tarballUrl) ?? text(metadata.tarball);
  if (tarball === undefined) return undefined;
  const url = httpsUrl(tarball);
  if (url === undefined || !ARCHIVE_PATH.test(url.pathname)) return undefined;
  return installTarget('archive', `archive+${tarball}`, { packageVersion: text(metadata.version) });
}

/** Any https repository is installable, not only github.com; a github tree URL carries ref and directory. */
function legacyGitTarget(metadata: Record<string, unknown>): MarketplaceInstallTarget | undefined {
  const repository = text(metadata.repositoryUrl) ?? text(metadata.url) ?? text(metadata.catalogUrl) ?? text(metadata.pageUrl);
  if (repository === undefined) return undefined;
  const url = httpsUrl(repository);
  if (url === undefined || url.search !== '' || url.hash !== '') return undefined;
  let base = repository;
  let reference = text(metadata.repositoryRef);
  let directory = text(metadata.repositoryPath);
  const segments = url.pathname.split('/').filter(segment => segment !== '');
  const [owner, name] = segments;
  if (url.hostname.toLowerCase() === 'github.com' && owner !== undefined && name !== undefined) {
    base = `${url.origin}/${owner}/${name.replace(/\.git$/iu, '')}`;
    if (segments[2] === 'tree' && segments.length >= 4) {
      reference ??= segments[3];
      if (segments.length > 4) directory ??= segments.slice(4).join('/');
    }
  }
  const spec = gitInstallSpec(base, reference, directory);
  return spec === undefined ? undefined : installTarget('git', spec);
}

function legacyInstallTarget(plugin: MarketplaceInstallRecord): MarketplaceInstallTarget | undefined {
  const metadata = plugin.marketplaceMetadata;
  // Only curated dsh-market metadata is trusted as an install source; `install`
  // stays display-only text, exactly as the server install plan treats it.
  if (!isRecord(metadata) || metadata.provider !== 'dsh-market') return undefined;
  return legacyRegistryTarget(metadata) ?? legacyArchiveTarget(metadata) ?? legacyGitTarget(metadata);
}

/**
 * Resolve the install target the Host should execute for one catalog record.
 * The server projection wins, then a record artifact, then curated metadata.
 */
export function marketplacePluginTarget(plugin: MarketplaceInstallRecord): MarketplaceInstallTarget | undefined {
  return serverInstallTarget(plugin) ?? artifactInstallTarget(plugin.source) ?? legacyInstallTarget(plugin);
}

/** Whether the record can be installed right now; `canInstall` is the Host capability gate. */
export function marketplacePluginInstallAvailable(plugin: MarketplaceInstallRecord, canInstall: boolean): boolean {
  if (!canInstall) return false;
  return plugin.source != null || marketplacePluginTarget(plugin) !== undefined;
}

/** Version the catalog currently offers for the record, when one is known. */
export function marketplacePluginVersion(plugin: MarketplaceInstallRecord): string | undefined {
  const target = marketplacePluginTarget(plugin);
  if (target?.packageVersion != null) return target.packageVersion;
  const registryVersion = text(plugin.registryVersion);
  if (registryVersion !== undefined) return registryVersion;
  const metadata = plugin.marketplaceMetadata;
  return isRecord(metadata) ? text(metadata.version) : undefined;
}
