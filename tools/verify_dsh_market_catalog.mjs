#!/usr/bin/env node

/**
 * Verify that the checked-in dsh-market catalog seed is complete with respect
 * to the registry it was generated from.
 *
 * The check reads the generated seed payload, the locale display sets, and the
 * recorded snapshot, then compares them against a `plugins.json` document:
 * every published entry must be present, every field must be carried, every
 * entry must have exactly one default install target, and the identity must be
 * stable and unique. Run it after regenerating the seed and in CI next to the
 * importer unit tests.
 *
 * Usage:
 *   node tools/verify_dsh_market_catalog.mjs --input plugins.json
 *   node tools/verify_dsh_market_catalog.mjs            # fetch the live catalog
 */

import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { DEFAULT_CATALOG_URL, SNAPSHOT } from './import_dsh_market_catalog.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CATALOG_SEED = 'database/seeds/common/003_dsh_market_catalog.sql';

function fail(message) {
  throw new Error(message);
}

function payloadOf(sql) {
  const marker = 'FROM jsonb_array_elements(';
  const from = sql.indexOf(marker);
  if (from === -1) fail('catalog seed carries no payload');
  const start = sql.indexOf("'", from + marker.length);
  const end = sql.indexOf("'::jsonb", start);
  if (start === -1 || end === -1) fail('catalog seed payload literal is malformed');
  return JSON.parse(sql.slice(start + 1, end).replaceAll("''", "'"));
}

function optionalString(value) {
  return typeof value === 'string' && value.trim() !== '' ? value.trim().replaceAll('\u0000', '') : null;
}

function list(value) {
  if (Array.isArray(value)) return value.map(optionalString).filter(Boolean);
  const item = optionalString(value);
  return item === null ? [] : [item];
}

function same(left, right) {
  return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
}

/**
 * Compare the seeded catalog with the registry document.
 * @param registry parsed `plugins.json`.
 * @param seed parsed seed payload.
 * @param localeSeeds the display SQL of each active locale.
 * @returns the measured counts.
 */
export function verifyCatalog(registry, seed, localeSeeds, updates = undefined) {
  if (!Array.isArray(registry.plugins)) fail('registry has no plugins array');
  if (seed.length !== registry.plugins.length) {
    fail(`seed holds ${seed.length} entries, registry publishes ${registry.plugins.length}`);
  }
  const byUrl = new Map();
  const keys = new Set();
  const ids = new Set();
  const uuids = new Set();
  const targetIds = new Set();
  const mediaIds = new Set();
  const capabilityIds = new Set();
  let defaultTargets = 0;
  let targets = 0;
  let media = 0;
  let capabilities = 0;

  for (const item of seed) {
    for (const [field, value] of [['plugin key', item.pluginKey], ['id', item.id], ['uuid', item.uuid]]) {
      if (typeof value !== 'string' && typeof value !== 'number') fail(`entry ${item.pluginKey} has no ${field}`);
    }
    if (keys.has(item.pluginKey)) fail(`duplicate plugin key ${item.pluginKey}`);
    if (ids.has(item.id)) fail(`duplicate id ${item.id}`);
    if (uuids.has(item.uuid)) fail(`duplicate uuid ${item.uuid}`);
    keys.add(item.pluginKey);
    ids.add(item.id);
    uuids.add(item.uuid);
    if (item.uuid.length > 128) fail(`plugin uuid ${item.uuid} exceeds the widened column`);
    if (item.pluginKey.length > 128) fail(`plugin key ${item.pluginKey} exceeds the column`);
    if (typeof item.catalogUrl !== 'string' || item.catalogUrl === '') fail(`entry ${item.pluginKey} has no catalog URL`);
    if (byUrl.has(item.catalogUrl)) fail(`duplicate catalog URL ${item.catalogUrl}`);
    byUrl.set(item.catalogUrl, item);

    const defaults = item.installTargets.filter(target => target.isDefault === true);
    if (item.installTargets.length === 0) fail(`entry ${item.pluginKey} publishes no install target`);
    if (defaults.length !== 1) fail(`entry ${item.pluginKey} publishes ${defaults.length} default install targets`);
    if (item.installTargets[0] !== defaults[0]) fail(`entry ${item.pluginKey} default target is not first`);
    defaultTargets += 1;
    targets += item.installTargets.length;
    for (const target of item.installTargets) {
      if (targetIds.has(target.id)) fail(`duplicate install target id ${target.id}`);
      targetIds.add(target.id);
      if (!['registry', 'archive', 'git', 'path', 'drive'].includes(target.kind)) fail(`unknown target kind ${target.kind}`);
      if (typeof target.spec !== 'string' || target.spec === '') fail(`entry ${item.pluginKey} has an empty target spec`);
      if (target.kind === 'registry' && !/^(?:@[^/]+\/)?[^@]+(?:@[^@]+)?$/u.test(target.spec)) fail(`registry spec ${target.spec}`);
      if (target.kind === 'archive' && !target.spec.startsWith('archive+https://')) fail(`archive spec ${target.spec}`);
      if (target.kind === 'git' && !target.spec.startsWith('git+https://')) fail(`git spec ${target.spec}`);
    }
    for (const row of item.media) {
      if (mediaIds.has(row.id)) fail(`duplicate media id ${row.id}`);
      mediaIds.add(row.id);
      if (!['icon', 'screenshot', 'featured', 'cover'].includes(row.kind)) fail(`unknown media kind ${row.kind}`);
      if (typeof row.url !== 'string' || row.url === '') fail(`entry ${item.pluginKey} has an empty media URL`);
      media += 1;
    }
    for (const row of item.capabilities) {
      if (capabilityIds.has(row.id)) fail(`duplicate capability id ${row.id}`);
      capabilityIds.add(row.id);
      if (!['capability', 'red_line'].includes(row.kind)) fail(`unknown disclosure kind ${row.kind}`);
      if (typeof row.code !== 'string' || row.code === '') fail(`entry ${item.pluginKey} has an empty capability code`);
      capabilities += 1;
    }
  }

  for (const entry of registry.plugins) {
    const url = optionalString(entry.url);
    const item = byUrl.get(url);
    if (item === undefined) fail(`registry entry ${url} is missing from the seed`);    const description = entry.description && typeof entry.description === 'object' ? entry.description : {};
    const expected = {
      ownerLogin: optionalString(entry.owner),
      catalogPageUrl: optionalString(entry.page),
      npmPackage: optionalString(entry.npm),
      tarballUrl: optionalString(entry.tarball),
      registryVersion: optionalString(entry.version),
      addedOn: optionalString(entry.added)?.slice(0, 10) ?? null,
      downloadsCount: typeof entry.downloads === 'number' ? entry.downloads : 0,
      starsCount: typeof entry.stars === 'number' ? entry.stars : 0,
      iconUrl: optionalString(entry.icon),
    };
    for (const [field, value] of Object.entries(expected)) {
      if (!same(item[field], value)) fail(`${url}: ${field} is ${JSON.stringify(item[field])}, registry says ${JSON.stringify(value)}`);
    }
    if (!same(item.descriptionLocales?.['zh-CN'] ?? null, optionalString(description.zh))) fail(`${url}: zh description lost`);
    if (!same(item.descriptionLocales?.['en-US'] ?? null, optionalString(description.en))) fail(`${url}: en description lost`);
    const categories = list(entry.category);
    if (!same(item.tags, categories)) fail(`${url}: categories lost`);
    const screenshots = list(entry.screenshots);
    const seededScreenshots = item.media.filter(row => row.kind === 'screenshot').map(row => row.url);
    if (!same(seededScreenshots, screenshots)) fail(`${url}: screenshots lost`);
    const capabilitiesOfEntry = list(entry.capabilities);
    const seededCapabilities = item.capabilities.filter(row => row.kind === 'capability').map(row => row.code);
    if (!same(seededCapabilities, capabilitiesOfEntry)) fail(`${url}: capabilities lost`);
    const redLines = list(entry.capabilityRedLines);
    const seededRedLines = item.capabilities.filter(row => row.kind === 'red_line').map(row => row.code);
    if (!same(seededRedLines, redLines)) fail(`${url}: capability red lines lost`);
    // The display-only install text is carried but never used as a target.
    if (optionalString(entry.install) !== null && item.marketplaceMetadata?.install !== optionalString(entry.install)) {
      fail(`${url}: display install text lost`);
    }
    if (updates !== undefined) {
      const changelog = updates.updates?.[item.repositoryUrl] ?? updates.updates?.[url];
      const release = changelog?.release;
      const seededRelease = item.marketplaceMetadata?.release ?? null;
      // The seed drops U+0000 because PostgreSQL text and jsonb reject it.
      const sanitized = value => (typeof value === 'string' ? value.replaceAll('\u0000', '') : value);
      const tag = sanitized(optionalString(release?.tag));
      if (tag !== (seededRelease?.tag ?? null)) fail(`${url}: release tag ${JSON.stringify(tag)} lost`);
      if (sanitized(optionalString(release?.url)) !== (seededRelease?.url ?? null)) fail(`${url}: release URL lost`);
      if (sanitized(optionalString(release?.body)) !== (seededRelease?.body ?? null)) fail(`${url}: release notes lost`);
      const commits = Array.isArray(changelog?.commits) ? changelog.commits.slice(0, 10).length : 0;
      if ((item.marketplaceMetadata?.recentCommits?.length ?? 0) !== commits) fail(`${url}: recent commits lost`);
      if (sanitized(optionalString(changelog?.checkedAt)) !== (item.marketplaceMetadata?.updatesCheckedAt ?? null)) {
        fail(`${url}: changelog check date lost`);
      }
    }
  }

  const categories = [...new Set(seed.flatMap(item => item.tags))].sort();
  for (const locale of Object.keys(localeSeeds)) {
    for (const code of categories) {
      if (!localeSeeds[locale].includes(`'${code}'`)) fail(`locale ${locale} has no label for category ${code}`);
    }
  }
  return {
    entries: seed.length,
    categories: categories.length,
    installTargets: targets,
    defaultTargets,
    media,
    capabilities,
    changelogEntries: seed.filter(item => (item.marketplaceMetadata?.release?.tag ?? null) !== null
      || (item.marketplaceMetadata?.recentCommits?.length ?? 0) > 0).length,
    locales: Object.keys(localeSeeds),
  };
}

async function readRegistry(input) {
  if (input) return JSON.parse(await readFile(input, 'utf8'));
  const response = await fetch(DEFAULT_CATALOG_URL);
  if (!response.ok) throw new Error(`catalog request failed: ${response.status}`);
  return response.json();
}

async function readUpdates(input) {
  if (input === undefined) return undefined;
  return JSON.parse(await readFile(input, 'utf8'));
}

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) continue;
    args[token.slice(2)] = argv[index + 1]?.startsWith('--') ? true : argv[++index];
  }
  return args;
}

export async function verifyCatalogAssets(input, root = ROOT, updatesInput = undefined) {
  const registry = await readRegistry(input);
  const updates = await readUpdates(updatesInput);
  const seed = payloadOf(await readFile(join(root, CATALOG_SEED), 'utf8'));
  const localeSeeds = {};
  for (const locale of ['zh-CN', 'en-US']) {
    localeSeeds[locale] = [
      await readFile(join(root, 'database/seeds/locales', locale, '001_plugin_categories_display.sql'), 'utf8'),
      await readFile(join(root, 'database/seeds/locales', locale, '002_plugin_catalog_display.sql'), 'utf8'),
    ].join('\n');
  }
  const snapshot = JSON.parse(await readFile(join(root, SNAPSHOT), 'utf8'));
  const measured = verifyCatalog(registry, seed, localeSeeds, updates);
  if (snapshot.source.entryCount !== measured.entries) fail('snapshot entry count is stale');
  if (snapshot.source.categoryCount !== measured.categories) fail('snapshot category count is stale');
  if (snapshot.source.installTargetCount !== measured.installTargets) fail('snapshot install target count is stale');
  if (snapshot.source.mediaCount !== measured.media) fail('snapshot media count is stale');
  if (snapshot.source.capabilityCount !== measured.capabilities) fail('snapshot capability count is stale');
  if (snapshot.source.changelog.entryCount !== measured.changelogEntries) fail('snapshot changelog count is stale');
  return measured;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = parseArgs(process.argv.slice(2));
  const measured = await verifyCatalogAssets(
    typeof args.input === 'string' ? args.input : undefined,
    ROOT,
    typeof args.updates === 'string' ? args.updates : undefined,
  );
  process.stdout.write(`Verified dsh-market catalog: ${JSON.stringify(measured)}\n`);
}
