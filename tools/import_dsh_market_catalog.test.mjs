import test from 'node:test';
import assert from 'node:assert/strict';

import { generateCatalogAssets, installTargetsFor, KNOWN_ENTRY_KEYS, normalizeCatalog, renderSeedSql } from './import_dsh_market_catalog.mjs';
import { OFFICIAL_BUNDLES, officialCatalogUrl } from './dsh_market_official_catalog.mjs';

function document(plugins, categories = { tools: { en: 'Tools', zh: '工具' }, ui: { en: 'UI', zh: '界面' } }) {
  return { url: 'https://awesome-dsh-plugin.com', updated: '2026-11-24', categories, plugins };
}

function marketEntry(catalog) {
  return catalog.entries.find(entry => entry.catalogProvider === 'dsh-market');
}

const DEMO = {
  name: 'Demo package',
  owner: 'sdkwork',
  url: 'https://github.com/sdkwork/demo/tree/main/packages/plugin',
  page: 'https://awesome-dsh-plugin.com/p/sdkwork/demo/',
  category: ['tools', 'ui'],
  description: { en: 'Demo', zh: '示例' },
  npm: '@sdkwork/demo',
  version: '1.2.3',
  downloads: 42,
  capabilities: ['fs-read'],
  capabilityRedLines: ['reads credentials AND has network access'],
  screenshots: ['https://example.com/1.png', 'https://example.com/2.png'],
  icon: 'https://example.com/icon.png',
  install: 'dsh plugin add @sdkwork/demo',
  added: '2026-10-17',
};

test('projects every registry field and the install target dsh-market uses', () => {
  const catalog = normalizeCatalog(document([DEMO]));
  const entry = marketEntry(catalog);

  assert.equal(entry.pluginKey, 'dsh-sdkwork-demo-packages-plugin');
  assert.equal(entry.catalogUrl, DEMO.url);
  assert.equal(entry.catalogPageUrl, DEMO.page);
  assert.equal(entry.ownerLogin, 'sdkwork');
  assert.equal(entry.npmPackage, '@sdkwork/demo');
  assert.equal(entry.registryVersion, '1.2.3');
  assert.equal(entry.repositoryUrl, 'https://github.com/sdkwork/demo');
  assert.equal(entry.repositoryPath, 'packages/plugin');
  assert.equal(entry.repositoryRef, 'main');
  assert.equal(entry.addedOn, '2026-10-17');
  assert.equal(entry.downloadsCount, 42);
  assert.equal(entry.categoryCode, 'tools');
  assert.deepEqual(entry.metadata.description, undefined);
  assert.equal(entry.descriptionLocales['zh-CN'], '示例');
  assert.deepEqual(entry.tags, ['tools', 'ui']);
  // Nothing is dropped: the only residual `raw` keys are the ones this
  // registry revision does not publish.
  assert.deepEqual(entry.metadata.raw, {});

  assert.deepEqual(entry.installTargets.map(target => [target.kind, target.spec, target.isDefault]), [
    ['registry', '@sdkwork/demo@1.2.3', true],
    ['git', 'git+https://github.com/sdkwork/demo.git#main&path:/packages/plugin', false],
  ]);
  assert.deepEqual(entry.media.map(row => [row.kind, row.url, row.sortOrder]), [
    ['icon', 'https://example.com/icon.png', 0],
    ['screenshot', 'https://example.com/1.png', 1],
    ['screenshot', 'https://example.com/2.png', 2],
  ]);
  assert.deepEqual(entry.capabilities.map(row => [row.kind, row.code]), [
    ['capability', 'fs-read'],
    ['red_line', 'reads credentials AND has network access'],
  ]);
});

test('installs a release archive only when it belongs to the curated repository', () => {
  const catalog = normalizeCatalog(document([
    {
      ...DEMO,
      npm: null,
      version: null,
      url: 'https://github.com/sdkwork/demo',
      tarball: 'https://github.com/sdkwork/demo/releases/latest/download/demo.tgz',
    },
    {
      ...DEMO,
      name: 'Foreign',
      url: 'https://github.com/sdkwork/foreign',
      npm: null,
      version: null,
      tarball: 'https://github.com/other/plugin/releases/download/v1/plugin.tgz',
    },
  ]));
  const [own, foreign] = catalog.entries;
  assert.deepEqual(own.installTargets.map(target => target.kind), ['archive', 'git']);
  assert.equal(own.installTargets[0].spec, 'archive+https://github.com/sdkwork/demo/releases/latest/download/demo.tgz');
  assert.deepEqual(foreign.installTargets.map(target => target.kind), ['git']);
});

test('accepts only own-repository HTTPS GitHub Release tgz and tar.gz archives', () => {
  const base = { ...DEMO, npm: null, version: null, url: 'https://github.com/sdkwork/demo' };
  const accepted = [
    'https://github.com/sdkwork/demo/releases/latest/download/demo.tgz',
    'https://github.com/sdkwork/demo/releases/download/v1.2.3/demo.tar.gz',
  ];
  for (const tarball of accepted) {
    const targets = installTargetsFor({ ...base, tarball }, new Set());
    assert.deepEqual(targets.map(target => target.kind), ['archive', 'git']);
  }
  const rejected = [
    'https://github.com/sdkwork/demo/releases/latest/download/demo.zip',
    'https://github.com/sdkwork/demo/releases/latest/download/demo.tgz?download=1',
    'https://github.com/sdkwork/demo/releases/latest/download/demo.tgz#asset',
    'http://github.com/sdkwork/demo/releases/latest/download/demo.tgz',
    'https://github.com/sdkwork/demo-other/releases/latest/download/demo.tgz',
    'https://github.com/other/demo/releases/latest/download/demo.tgz',
    'https://github.com/sdkwork/demo/archive/refs/tags/v1/demo.tgz',
    'https://codeload.github.com/sdkwork/demo/tar.gz/refs/tags/v1',
  ];
  for (const tarball of rejected) {
    const targets = installTargetsFor({ ...base, tarball }, new Set());
    assert.deepEqual(targets.map(target => target.kind), ['git'], tarball);
  }
});

test('keeps registry, archive, git precedence and ignores display-only install text', () => {
  const targets = installTargetsFor({
    ...DEMO,
    npm: '@sdkwork/demo',
    tarball: 'https://github.com/sdkwork/demo/releases/latest/download/demo.tgz',
    install: 'dsh plugin add https://attacker.invalid/plugin.tgz',
  }, new Set());
  assert.deepEqual(targets.map(target => [target.kind, target.isDefault]), [
    ['registry', true], ['archive', false], ['git', false],
  ]);
  assert.equal(targets[0].spec, '@sdkwork/demo@1.2.3');
  assert.equal(targets[1].spec, 'archive+https://github.com/sdkwork/demo/releases/latest/download/demo.tgz');
  assert.equal(targets[2].spec, 'git+https://github.com/sdkwork/demo.git#main&path:/packages/plugin');
  assert.ok(targets.every(target => !target.spec.includes('attacker.invalid') && !target.spec.startsWith('github:')));
  assert.deepEqual(installTargetsFor({ ...DEMO, npm: '@SDKWork/Demo' }, new Set()).map(target => target.kind), ['git']);
});

test('rejects malformed GitHub repository and tree targets', () => {
  const urls = [
    'http://github.com/sdkwork/demo',
    'https://gitlab.com/sdkwork/demo',
    'https://github.com/sdkwork/demo/tree/main',
    'https://github.com/sdkwork/demo/tree/main/packages/../plugin',
    'https://github.com/sdkwork/demo/tree/main/packages//plugin',
    'https://github.com/sdkwork/demo?tab=readme',
    'https://user@github.com/sdkwork/demo',
  ];
  for (const url of urls) {
    assert.deepEqual(installTargetsFor({ ...DEMO, npm: null, url }, new Set()), [], url);
  }
});

test('projects the additional release metadata once instead of duplicating it in raw', () => {
  const entry = marketEntry(normalizeCatalog(document([{
    ...DEMO,
    deprecated: true,
    replacement: 'https://github.com/sdkwork/replacement',
    previousNpm: ['@sdkwork/old-demo'],
    githubReleaseDownloads: 321,
    releaseManifest: { assets: [{ name: 'demo.tgz', digest: 'sha256:abc' }] },
  }])));
  for (const key of ['deprecated', 'replacement', 'previousNpm', 'githubReleaseDownloads', 'releaseManifest']) {
    assert.ok(KNOWN_ENTRY_KEYS.has(key), key);
  }
  assert.equal(entry.metadata.deprecated, true);
  assert.equal(entry.metadata.replacement, 'https://github.com/sdkwork/replacement');
  assert.deepEqual(entry.metadata.previousNpm, ['@sdkwork/old-demo']);
  assert.equal(entry.metadata.githubReleaseDownloads, 321);
  assert.deepEqual(entry.metadata.releaseManifest, { assets: [{ name: 'demo.tgz', digest: 'sha256:abc' }] });
  assert.equal(entry.isDeprecated, true);
  assert.deepEqual(entry.metadata.raw, {});
});

test('emits the Official category and all 19 authoritative bundles first', () => {
  const catalog = normalizeCatalog(document([DEMO]));
  const [official] = catalog.categories;
  assert.equal(official.code, 'official');
  assert.equal(official.sortOrder, 0);
  assert.equal(official.taxonomySource, 'sdkwork');
  assert.deepEqual(official.labels, { 'zh-CN': '官方插件', 'en-US': 'Official plugins' });
  assert.ok(catalog.categories.slice(1).every(category => category.sortOrder > official.sortOrder));
  const entries = catalog.entries.filter(entry => entry.catalogProvider === 'sdkwork');
  assert.equal(entries.length, 19);
  assert.deepEqual(entries.map(entry => entry.npmPackage), OFFICIAL_BUNDLES.map(bundle => bundle.packageName));
  for (const [index, entry] of entries.entries()) {
    const bundle = OFFICIAL_BUNDLES[index];
    assert.equal(entry.categoryCode, 'official');
    assert.equal(entry.categoryId, official.id);
    assert.equal(entry.catalogUrl, officialCatalogUrl(bundle));
    assert.equal(entry.registryVersion, bundle.version);
    assert.equal(entry.nameLocales['zh-CN'], bundle.title['zh-CN']);
    assert.equal(entry.descriptionLocales['en-US'], bundle.description['en-US']);
    assert.deepEqual(entry.installTargets.map(target => target.spec), [
      `${bundle.packageName}@${bundle.version}`,
      `git+https://github.com/deepseek-ai/deepseek-harness.git#main&path:/${bundle.packagePath}`,
    ]);
    assert.equal(entry.installTargets[0].isDefault, true);
  }
});

test('deduplicates later dsh-market Official rows by catalog URL or npm identity', () => {
  const bundle = OFFICIAL_BUNDLES[0];
  const catalog = normalizeCatalog(document([
    DEMO,
    { ...DEMO, name: 'Official duplicate', url: officialCatalogUrl(bundle), npm: bundle.packageName, category: ['tools'] },
    { ...DEMO, name: 'npm duplicate', url: 'https://github.com/other/mirror', npm: bundle.packageName, category: ['ui'] },
  ]));
  assert.equal(catalog.entries.filter(entry => entry.catalogProvider === 'dsh-market').length, 1);
  assert.equal(catalog.entries.filter(entry => entry.npmPackage === bundle.packageName).length, 1);
  assert.equal(catalog.entries.filter(entry => entry.catalogUrl === officialCatalogUrl(bundle)).length, 1);
  assert.equal(catalog.entries.find(entry => entry.npmPackage === bundle.packageName).catalogProvider, 'sdkwork');
});

test('derives stable ids and keys that do not depend on catalog order', () => {
  const entries = [
    { ...DEMO, name: 'A', url: 'https://github.com/sdkwork/a' },
    { ...DEMO, name: 'B', url: 'https://github.com/sdkwork/b' },
    { ...DEMO, name: 'C', url: 'https://github.com/sdkwork/c' },
  ];
  const forward = normalizeCatalog(document(entries));
  const reversed = normalizeCatalog(document([...entries].reverse()));
  const byUrl = source => new Map(source.entries.map(entry => [entry.catalogUrl, entry]));
  const left = byUrl(forward);
  const right = byUrl(reversed);
  for (const url of left.keys()) {
    assert.equal(left.get(url).id, right.get(url).id);
    assert.equal(left.get(url).uuid, right.get(url).uuid);
    assert.equal(left.get(url).pluginKey, right.get(url).pluginKey);
  }
});

test('gives every colliding short slug a deterministic suffix', () => {
  // The same package on two branches is one slug; neither branch may win the
  // clean key by catalog position.
  const catalog = normalizeCatalog(document([
    { ...DEMO, name: 'One', url: 'https://github.com/sdkwork/demo/tree/main/packages/plugin' },
    { ...DEMO, name: 'Two', url: 'https://github.com/sdkwork/demo/tree/dev/packages/plugin' },
  ]));
  const [first, second] = catalog.entries;
  assert.notEqual(first.pluginKey, second.pluginKey);
  assert.match(first.pluginKey, /^dsh-sdkwork-demo-packages-plugin-[0-9a-f]{8}$/u);
  assert.match(second.pluginKey, /^dsh-sdkwork-demo-packages-plugin-[0-9a-f]{8}$/u);
});

test('keeps the public identifier inside the widened column and the key inside 128 characters', () => {
  const longUrl = `https://github.com/sdkwork/${'very-long-repository-name-'.repeat(4)}`;
  const [entry] = normalizeCatalog(document([{ ...DEMO, url: longUrl }])).entries;
  assert.ok(entry.uuid.length <= 128, entry.uuid);
  assert.ok(entry.pluginKey.length <= 128, entry.pluginKey);
});

test('renders a transactional seed with one payload and no executable catalog copy', () => {
  const catalog = normalizeCatalog(document([DEMO]));
  const sql = renderSeedSql(catalog);
  assert.match(sql, /BEGIN;/);
  assert.match(sql, /CREATE TEMP TABLE dsh_market_catalog_payload/);
  assert.match(sql, /COMMIT;/);
  assert.equal(sql.match(/INSERT INTO dsh_market_catalog_payload/gu)?.length, 1);
  // The catalog literal is a single-quoted string, not a dollar quote, so the
  // seed validator treats descriptions as data rather than SQL.
  assert.doesNotMatch(sql, /\$dsh_market_catalog\$/);
});

test('renders idempotent URL-based reconciliation with default replacement and stale-child cleanup', () => {
  const sql = renderSeedSql(normalizeCatalog(document([DEMO])));
  assert.match(sql, /ON CONFLICT \(tenant_id, catalog_provider, catalog_url\)/);
  assert.match(sql, /WHERE catalog_url IS NOT NULL AND deleted_at IS NULL/);
  assert.doesNotMatch(sql, /ON CONFLICT \(tenant_id, plugin_key\)/);
  assert.match(sql, /UPDATE ai_plugin_install_target AS target\s+SET is_default = FALSE/);
  assert.match(sql, /DELETE FROM ai_plugin_install_target AS target/);
  assert.match(sql, /DELETE FROM ai_plugin_media AS media/);
  assert.match(sql, /DELETE FROM ai_plugin_capability AS capability/);
  assert.match(sql, /jsonb_array_elements\(catalog\.item->'installTargets'\)/);
  assert.match(sql, /jsonb_array_elements\(catalog\.item->'media'\)/);
  assert.match(sql, /jsonb_array_elements\(catalog\.item->'capabilities'\)/);
  assert.match(sql, /lifecycle_status = 1,\s+deleted_at = NULL/);
});

test('soft-deletes only removed upstream plugins and their children without touching installations', () => {
  const sql = renderSeedSql(normalizeCatalog(document([DEMO])));
  assert.match(sql, /UPDATE ai_plugin AS plugin\s+SET lifecycle_status = 4,[\s\S]*?plugin\.catalog_provider = 'dsh-market'[\s\S]*?NOT EXISTS/);
  assert.match(sql, /plugin\.tenant_id = 100001/);
  assert.doesNotMatch(sql, /DELETE FROM ai_plugin\b/);
  assert.doesNotMatch(sql, /ai_plugin_installation/);
  for (const table of ['ai_plugin_install_target', 'ai_plugin_media', 'ai_plugin_capability']) {
    assert.match(sql, new RegExp(`UPDATE ${table} AS [\\s\\S]*?lifecycle_status = 4`));
  }
  assert.match(sql, /plugin\.marketplace_metadata_json->>'source' = 'sdkwork-official-bundles'/);
});

test('preserves recorded changelog when regenerated without an updates document', async () => {
  const { mkdtemp, readFile } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const root = await mkdtemp(join(tmpdir(), 'dsh-market-history-'));
  const updates = {
    url: 'https://awesome-dsh-plugin.com/updates.json',
    updated: '2026-11-24',
    updates: {
      'https://github.com/sdkwork/demo': {
        release: { tag: 'v1.2.3', body: 'Keep this release', publishedAt: '2026-11-09T15:36:26Z' },
        commits: [{ sha: 'a'.repeat(40), message: 'release', date: '2026-11-13T08:44:25Z' }],
        checkedAt: '2026-11-24',
      },
    },
  };
  await generateCatalogAssets(document([DEMO]), root, updates);
  const { snapshot } = await generateCatalogAssets({ ...document([DEMO]), updated: '2026-11-26' }, root);
  assert.equal(snapshot.source.revision, '2026-11-26');
  assert.equal(snapshot.source.changelog.revision, '2026-11-24');
  assert.equal(snapshot.source.changelog.entryCount, 1);
  const sql = await readFile(join(root, 'database/seeds/common/003_dsh_market_catalog.sql'), 'utf8');
  assert.match(sql, /Keep this release/);
});

test('writes the locale display sets and the snapshot from one run', async () => {
  const { mkdtemp } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { readFile } = await import('node:fs/promises');
  const root = await mkdtemp(join(tmpdir(), 'dsh-market-catalog-'));
  const { snapshot } = await generateCatalogAssets(document([DEMO]), root);
  assert.equal(snapshot.source.entryCount, 20);
  assert.equal(snapshot.source.dshMarketEntryCount, 1);
  assert.equal(snapshot.source.officialEntryCount, 19);
  const zh = await readFile(join(root, 'database/seeds/locales/zh-CN/002_plugin_catalog_display.sql'), 'utf8');
  assert.match(zh, /'示例'/);
  const en = await readFile(join(root, 'database/seeds/locales/en-US/002_plugin_catalog_display.sql'), 'utf8');
  assert.match(en, /'Demo'/);
  const categories = await readFile(join(root, 'database/seeds/locales/zh-CN/001_plugin_categories_display.sql'), 'utf8');
  assert.match(categories, /'工具'/);
});

test('carries the release history the market shows for a repository', () => {
  const catalog = normalizeCatalog(document([DEMO]), {
    url: 'https://awesome-dsh-plugin.com',
    updated: '2026-11-24',
    updates: {
      'https://github.com/sdkwork/demo': {
        release: {
          tag: 'v1.2.3',
          name: 'v1.2.3',
          publishedAt: '2026-11-09T15:36:26Z',
          url: 'https://github.com/sdkwork/demo/releases/tag/v1.2.3',
          body: 'Stable install paths',
        },
        commits: [{ sha: 'a'.repeat(40), message: 'chore: release', date: '2026-11-13T08:44:25Z' }],
        checkedAt: '2026-11-24',
      },
    },
  });
  const entry = marketEntry(catalog);
  assert.equal(entry.metadata.release.tag, 'v1.2.3');
  assert.equal(entry.metadata.release.body, 'Stable install paths');
  assert.equal(entry.metadata.recentCommits.length, 1);
  assert.equal(entry.metadata.updatesCheckedAt, '2026-11-24');
  assert.equal(catalog.changelog.entryCount, 1);
});

test('drops the NUL characters PostgreSQL refuses instead of failing the seed', () => {
  const catalog = normalizeCatalog(document([{ ...DEMO, description: { en: 'before\u0000after', zh: '前\u0000后' } }]));
  const sql = renderSeedSql(catalog);
  assert.doesNotMatch(sql, /\u0000/u);
  assert.match(sql, /beforeafter/);
});

test('rejects entries without a canonical registry URL', () => {
  assert.throws(
    () => normalizeCatalog({ plugins: [{ name: 'missing-url' }] }),
    /has no url/,
  );
});
