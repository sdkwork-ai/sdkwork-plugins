import test from 'node:test';
import assert from 'node:assert/strict';

import { generateCatalogAssets, normalizeCatalog, renderSeedSql } from './import_dsh_market_catalog.mjs';

function document(plugins, categories = { tools: { en: 'Tools', zh: '工具' }, ui: { en: 'UI', zh: '界面' } }) {
  return { url: 'https://awesome-dsh-plugin.com', updated: '2026-11-24', categories, plugins };
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
  const [entry] = catalog.entries;

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

test('writes the locale display sets and the snapshot from one run', async () => {
  const { mkdtemp } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { readFile } = await import('node:fs/promises');
  const root = await mkdtemp(join(tmpdir(), 'dsh-market-catalog-'));
  const { snapshot } = await generateCatalogAssets(document([DEMO]), root);
  assert.equal(snapshot.source.entryCount, 1);
  const zh = await readFile(join(root, 'database/seeds/locales/zh-CN/002_plugin_catalog_display.sql'), 'utf8');
  assert.match(zh, /'示例'/);
  const en = await readFile(join(root, 'database/seeds/locales/en-US/002_plugin_catalog_display.sql'), 'utf8');
  assert.match(en, /'Demo'/);
  const categories = await readFile(join(root, 'database/seeds/locales/zh-CN/001_plugin_categories_display.sql'), 'utf8');
  assert.match(categories, /'工具'/);
});

test('rejects entries without a canonical registry URL', () => {
  assert.throws(
    () => normalizeCatalog({ plugins: [{ name: 'missing-url' }] }),
    /has no url/,
  );
});
