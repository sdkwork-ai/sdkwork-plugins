import assert from 'node:assert/strict';
import test from 'node:test';
import { loadMarketplaceCatalog, marketplacePluginInstallAvailable, mergeMarketplaceCatalog } from '../src/services/marketplaceService.ts';

test('loads featured cards separately from the usage-ranked catalog page', async () => {
  const calls = [];
  const client = {
    plugins: {
      async listCategories(params, options) {
        calls.push({ method: 'categories', params, options });
        return { items: [{ categoryCode: 'productivity' }], pageInfo: { mode: 'offset' } };
      },
      async list(params, options) {
        calls.push({ method: 'plugins', params, options });
        return params.featuredOnly
          ? { items: [{ pluginKey: 'assistant.featured', featured: true }], pageInfo: { mode: 'offset' } }
          : { items: [{ pluginKey: 'assistant.calendar', usageCount: '40' }], pageInfo: { mode: 'offset', hasMore: true } };
      },
    },
  };
  const controller = new AbortController();

  const result = await loadMarketplaceCatalog(client, {
    search: '  calendar  ',
    categoryCode: 'productivity',
    signal: controller.signal,
    includeFeatured: true,
  });

  assert.deepEqual(result.categories, [{ categoryCode: 'productivity' }]);
  assert.deepEqual(result.featuredPlugins, [{ pluginKey: 'assistant.featured', featured: true }]);
  assert.deepEqual(result.popularPlugins, [{ pluginKey: 'assistant.calendar', usageCount: '40' }]);
  assert.equal(result.hasMore, true);
  assert.deepEqual(calls, [
    { method: 'categories', params: { page: 1, pageSize: 200 }, options: { signal: controller.signal } },
    { method: 'plugins', params: { page: 1, pageSize: 2, q: 'calendar', categoryCode: 'productivity', featuredOnly: true }, options: { signal: controller.signal } },
    { method: 'plugins', params: { page: 1, pageSize: 48, q: 'calendar', categoryCode: 'productivity', sort: 'usage_count_desc' }, options: { signal: controller.signal } },
  ]);
});

test('paginates popular rows without requesting featured cards again', async () => {
  const calls = [];
  const client = {
    plugins: {
      async listCategories() {
        return { items: [], pageInfo: { mode: 'offset' } };
      },
      async list(params) {
        calls.push(params);
        return { items: [{ pluginKey: `plugin-${params.page}` }], pageInfo: { mode: 'offset', totalPages: 3 } };
      },
    },
  };

  const result = await loadMarketplaceCatalog(client, { popularPage: 2, categoryCode: 'productivity' });

  assert.deepEqual(result.featuredPlugins, []);
  assert.deepEqual(result.popularPlugins, [{ pluginKey: 'plugin-2' }]);
  assert.equal(result.hasMore, true);
  assert.deepEqual(calls, [{ page: 2, pageSize: 48, q: undefined, categoryCode: 'productivity', sort: 'usage_count_desc' }]);
});

test('keeps featured cards separate while appending paged popular rows', () => {
  const firstPage = {
    categories: [{ categoryCode: 'productivity' }],
    featuredPlugins: [{ pluginKey: 'featured-one' }, { pluginKey: 'featured-two' }],
    popularPlugins: [{ pluginKey: 'popular-one' }, { pluginKey: 'popular-two' }],
    hasMore: true,
  };
  const secondPage = {
    categories: firstPage.categories,
    featuredPlugins: [],
    popularPlugins: [{ pluginKey: 'popular-two' }, { pluginKey: 'popular-three' }],
    hasMore: false,
  };

  const initial = mergeMarketplaceCatalog({ categories: [], featuredPlugins: [], popularPlugins: [], hasMore: false }, firstPage, 1);
  const expanded = mergeMarketplaceCatalog(initial, secondPage, 2);

  assert.deepEqual(initial.featuredPlugins.map(plugin => plugin.pluginKey), ['featured-one', 'featured-two']);
  assert.deepEqual(initial.popularPlugins.map(plugin => plugin.pluginKey), ['popular-one', 'popular-two']);
  assert.deepEqual(expanded.featuredPlugins, initial.featuredPlugins);
  assert.deepEqual(expanded.popularPlugins.map(plugin => plugin.pluginKey), ['popular-one', 'popular-two', 'popular-three']);
  assert.equal(expanded.hasMore, false);
});

test('does not offer a connect action without a configured artifact source', () => {
  assert.equal(marketplacePluginInstallAvailable({ source: undefined }, true), false);
  assert.equal(marketplacePluginInstallAvailable({ source: { kind: 'git' } }, true), true);
  assert.equal(marketplacePluginInstallAvailable({ source: { kind: 'git' } }, false), false);
});
