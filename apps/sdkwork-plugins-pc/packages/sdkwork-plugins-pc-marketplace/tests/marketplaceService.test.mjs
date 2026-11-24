import assert from 'node:assert/strict';
import test from 'node:test';
import {
  loadMarketplaceCatalog,
  marketplacePluginInstallAvailable,
  marketplacePluginTarget,
  marketplacePluginVersion,
  mergeMarketplaceCatalog,
} from '../src/services/marketplaceService.ts';

const TARGET_SHAPE = { packageName: null, packageVersion: null, isDefault: false };

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

test('the server install target wins over artifacts and curated metadata', () => {
  const plugin = {
    installTarget: { kind: 'registry', spec: '@example/demo@1.2.3', packageName: '@example/demo', packageVersion: '1.2.3', isDefault: true },
    installTargets: [{ kind: 'git', spec: 'git+https://github.com/other/plugin.git', isDefault: true }],
    source: { kind: 'git', repositoryUrl: 'https://github.com/artifact/plugin', repositoryPath: 'packages/plugin' },
    marketplaceMetadata: { provider: 'dsh-market', npmPackage: '@legacy/demo', version: '0.1.0' },
  };

  assert.deepEqual(marketplacePluginTarget(plugin), {
    kind: 'registry',
    spec: '@example/demo@1.2.3',
    packageName: '@example/demo',
    packageVersion: '1.2.3',
    isDefault: true,
  });
  assert.equal(marketplacePluginInstallAvailable(plugin, true), true);
  assert.equal(marketplacePluginInstallAvailable(plugin, false), false);
});

test('the default entry of installTargets wins over the first entry', () => {
  const plugin = {
    installTargets: [
      { kind: 'git', spec: 'git+https://github.com/example/demo.git' },
      { kind: 'registry', spec: '@example/demo@2.0.0', packageName: '@example/demo', packageVersion: '2.0.0', isDefault: true },
    ],
  };

  assert.equal(marketplacePluginTarget(plugin).kind, 'registry');
  assert.equal(marketplacePluginTarget(plugin).spec, '@example/demo@2.0.0');
});

test('accepts an https repository outside github.com', () => {
  const plugin = {
    marketplaceMetadata: {
      provider: 'dsh-market',
      catalogUrl: 'https://git.example.com/team/demo',
      repositoryUrl: 'https://git.example.com/team/demo',
      repositoryRef: 'v1',
    },
  };

  assert.deepEqual(marketplacePluginTarget(plugin), {
    kind: 'git',
    spec: 'git+https://git.example.com/team/demo.git#v1',
    packageName: null,
    packageVersion: null,
    isDefault: false,
  });
  assert.equal(marketplacePluginInstallAvailable(plugin, true), true);
});

test('falls back to legacy curated metadata targets', () => {
  const pinned = marketplacePluginTarget({ marketplaceMetadata: { provider: 'dsh-market', npmPackage: '@example/plugin', version: '1.0.0' } });
  assert.equal(pinned.kind, 'registry');
  assert.equal(pinned.spec, '@example/plugin@1.0.0');
  assert.equal(pinned.packageVersion, '1.0.0');

  const unpinned = marketplacePluginTarget({ marketplaceMetadata: { provider: 'dsh-market', npm: 'example-plugin' } });
  assert.equal(unpinned.kind, 'registry');
  assert.equal(unpinned.spec, 'example-plugin');

  const archive = marketplacePluginTarget({ marketplaceMetadata: { provider: 'dsh-market', tarballUrl: 'https://cdn.example.com/plugins/demo.tgz', version: '3.1.0' } });
  assert.deepEqual(archive, { kind: 'archive', spec: 'archive+https://cdn.example.com/plugins/demo.tgz', packageName: null, packageVersion: '3.1.0', isDefault: false });

  const normalizedRemote = marketplacePluginTarget({ marketplaceMetadata: { provider: 'dsh-market', repositoryUrl: 'https://github.com/example/demo.git/' } });
  assert.equal(normalizedRemote.spec, 'git+https://github.com/example/demo.git');

  const githubTree = marketplacePluginTarget({
    marketplaceMetadata: {
      provider: 'dsh-market',
      catalogUrl: 'https://github.com/example/demo/tree/main/packages/plugin',
      repositoryUrl: 'https://github.com/example/demo',
      repositoryRef: 'main',
      repositoryPath: 'packages/plugin',
    },
  });
  assert.equal(githubTree.spec, 'git+https://github.com/example/demo.git#main&path:/packages/plugin');
});

test('ignores display-only install text and untrusted metadata', () => {
  assert.equal(marketplacePluginTarget({ marketplaceMetadata: { provider: 'dsh-market', install: 'dsh plugin add example' } }), undefined);
  assert.equal(marketplacePluginTarget({ marketplaceMetadata: { provider: 'other-market', npm: '@example/plugin' } }), undefined);
  assert.equal(marketplacePluginTarget({ marketplaceMetadata: { provider: 'dsh-market', repositoryUrl: 'http://example.com/demo' } }), undefined);
});

test('reports no target when the record carries no install source', () => {
  assert.equal(marketplacePluginTarget({ source: undefined }), undefined);
  assert.equal(marketplacePluginTarget({ source: null }), undefined);
  assert.equal(marketplacePluginInstallAvailable({ source: undefined }, true), false);
  assert.equal(marketplacePluginInstallAvailable({ source: null }, true), false);
  assert.equal(marketplacePluginInstallAvailable({ source: undefined }, false), false);
  assert.equal(marketplacePluginTarget({ installTarget: { kind: 'ftp', spec: 'ftp://example.com/plugin.tgz' } }), undefined);
  assert.equal(marketplacePluginTarget({ installTargets: [] }), undefined);
});

test('derives targets from git and drive artifacts', () => {
  const git = marketplacePluginTarget({
    source: { kind: 'git', repositoryUrl: 'https://github.com/example/monorepo', repositoryPath: 'packages/demo', gitRef: 'v2.0.0' },
  });
  assert.deepEqual(git, {
    kind: 'git',
    spec: 'git+https://github.com/example/monorepo.git#v2.0.0&path:/packages/demo',
    packageName: null,
    packageVersion: null,
    isDefault: false,
  });

  const drive = marketplacePluginTarget({ source: { kind: 'drive_file', driveUri: 'drive://demo/plugin.tgz', checksumSha256: 'abc' } });
  assert.equal(drive.kind, 'drive');
  assert.equal(drive.spec, 'drive://demo/plugin.tgz');

  // An artifact whose spec cannot be composed is still installable: the Host
  // receives the whole record and resolves the artifact itself.
  assert.equal(marketplacePluginInstallAvailable({ source: { kind: 'git' } }, true), true);
});

test('exposes the version the catalog offers', () => {
  assert.equal(marketplacePluginVersion({ installTarget: { kind: 'registry', spec: '@example/demo@1.2.3', packageVersion: '1.2.3' } }), '1.2.3');
  assert.equal(marketplacePluginVersion({ registryVersion: '2.0.0' }), '2.0.0');
  assert.equal(marketplacePluginVersion({ marketplaceMetadata: { provider: 'dsh-market', version: '0.9.0' } }), '0.9.0');
  assert.equal(marketplacePluginVersion({ source: undefined }), undefined);
});

test('normalized targets always carry the full target shape', () => {
  assert.deepEqual(marketplacePluginTarget({ installTarget: { kind: 'path', spec: '/opt/plugins/demo' } }), {
    kind: 'path',
    spec: '/opt/plugins/demo',
    ...TARGET_SHAPE,
  });
});
