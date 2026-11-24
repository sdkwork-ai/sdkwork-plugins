import type { SdkworkPluginsAppClient } from '@sdkwork/plugins-app-sdk';
import type { PluginCategoryRecord, PluginRecord } from '@sdkwork/plugins-app-sdk';

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
      ? client.plugins.list({ page: 1, pageSize: 2, ...sharedFilters, featuredOnly: true }, { signal })
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

export function marketplacePluginInstallAvailable(
  plugin: Pick<PluginRecord, 'source'>,
  canInstall: boolean,
): boolean {
  return canInstall && plugin.source !== undefined;
}
