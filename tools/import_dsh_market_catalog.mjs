#!/usr/bin/env node

/**
 * Import the public dsh-market registry into the SDKWork Plugins initialization
 * data.
 *
 * The registry (https://awesome-dsh-plugin.com/plugins.json) is the catalog
 * authority for the dsh-market marketplace: every entry, its localized copy,
 * taxonomy, popularity window, capability disclosure, media, and the install
 * target dsh-market itself hands to `dsh plugin add`.
 *
 * Output layout (see DATABASE_FRAMEWORK_SPEC.md section 6.4):
 *
 * - `database/seeds/common/003_dsh_market_catalog.sql` — machine fields, the
 *   catalog projection, and the child rows (install targets, media,
 *   capabilities). It carries no active-locale display column.
 * - `database/seeds/locales/{zh-CN,en-US}/001_plugin_categories_display.sql`
 *   and `002_plugin_catalog_display.sql` — the active-locale display columns
 *   and taxonomy labels.
 * - `database/seeds/dsh-market-catalog.snapshot.json` — the source revision,
 *   row counts, and the checksums of the generated files.
 *
 * Identifiers are derived from the registry's unique catalog URL, so a
 * re-import is order-independent and idempotent: the same entry keeps the same
 * `id`, `uuid`, and `plugin_key` across catalog revisions.
 *
 * Usage:
 *   node tools/import_dsh_market_catalog.mjs --input plugins.json
 *   node tools/import_dsh_market_catalog.mjs            # fetch the live catalog
 */

import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  OFFICIAL_BUNDLES,
  OFFICIAL_CATEGORY,
  officialBundleForEntry,
  officialCatalogEntry,
} from './dsh_market_official_catalog.mjs';

export const DEFAULT_CATALOG_URL = 'https://awesome-dsh-plugin.com/plugins.json';
export const DEFAULT_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const CATALOG_SEED = 'database/seeds/common/003_dsh_market_catalog.sql';
export const SNAPSHOT = 'database/seeds/dsh-market-catalog.snapshot.json';
export const ADMIN_TENANT_ID = 100001;

/** Reserved seed id bands, chosen so the three id families can never collide. */
const PLUGIN_ID_BASE = 9330000000000n;
const CATEGORY_ID_BASE = 9320000000000n;
const TARGET_ID_BASE = 9340000000000n;
const MEDIA_ID_BASE = 9350000000000n;
const CAPABILITY_ID_BASE = 9360000000000n;
const ID_SPACE = 1000000000000n;

const NPM_PACKAGE = /^(?:@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/u;
const EXACT_VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u;
const ARCHIVE_PATH = /\.(?:tgz|tar\.gz)$/u;
const GITHUB_NAME = /^[A-Za-z0-9_.-]+$/u;
const GITHUB_PATH = /^[A-Za-z0-9_./-]+$/u;

/**
 * Every field the registry publishes today. A `raw` projection keeps only keys
 * outside this set, so the seed never stores the same entry twice while a
 * future registry field still survives the import.
 */
export const KNOWN_ENTRY_KEYS = new Set([
  'added', 'capabilities', 'capabilityCheckedAt', 'capabilityRedLines', 'category',
  'description', 'deprecated', 'downloads', 'downloadsCheckedAt', 'downloadsEnd', 'downloadsStart',
  'githubReleaseDownloads', 'icon', 'install', 'name', 'npm', 'owner', 'page', 'previousNpm',
  'releaseManifest', 'replacement', 'screenshots', 'stars',
  'starsCheckedAt', 'tarball', 'url', 'version',
]);

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function sqlJson(value) {
  return `'${JSON.stringify(stripNulDeep(value) ?? null).replaceAll("'", "''")}'::jsonb`;
}

/**
 * PostgreSQL `jsonb` and text reject U+0000. Registry release notes carry it
 * occasionally (an escaped NUL inside a commit message), so it is dropped at
 * the SQL boundary instead of failing the whole seed transaction.
 * @param value any JSON value.
 * @returns the value with every string's NUL characters removed.
 */
function stripNulDeep(value) {
  if (typeof value === 'string') return value.replaceAll('\u0000', '');
  if (Array.isArray(value)) return value.map(stripNulDeep);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, stripNulDeep(item)]));
  }
  return value;
}

function sqlText(value) {
  if (value === null || value === undefined) return 'NULL';
  return `'${String(value).replaceAll('\u0000', '').replaceAll("'", "''")}'`;
}

function optionalString(value) {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

function normalizedList(value) {
  if (Array.isArray(value)) return value.map(optionalString).filter(Boolean);
  const item = optionalString(value);
  return item === null ? [] : [item];
}

function boundedInteger(value) {
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) return value;
  if (typeof value === 'string' && /^\d+$/.test(value)) return Math.min(Number(value), Number.MAX_SAFE_INTEGER);
  return null;
}

function isoDate(value) {
  const text = optionalString(value);
  if (text === null) return null;
  const match = /^(\d{4}-\d{2}-\d{2})/u.exec(text);
  return match === null ? null : match[1];
}

function isoInstant(value) {
  const text = optionalString(value);
  if (text === null) return null;
  return Number.isNaN(Date.parse(text)) ? null : text;
}

/**
 * Derive one stable identifier from a stable key.
 * @param base reserved numeric id band.
 * @param key stable identity, normally the catalog URL.
 * @param used ids already allocated for this table.
 * @returns the decimal id string.
 */
function stableId(base, key, used) {
  for (let salt = 0; ; salt += 1) {
    const digest = sha256(salt === 0 ? key : `${key}#${salt}`);
    const id = base + (BigInt(`0x${digest.slice(0, 12)}`) % ID_SPACE);
    if (!used.has(id)) {
      used.add(id);
      return id.toString();
    }
  }
}

function stableUuid(namespace, key) {
  return `${namespace}.${sha256(key).slice(0, 16)}`;
}

function slugFromUrl(catalogUrl) {
  let parsed;
  try {
    parsed = new URL(catalogUrl);
  } catch {
    return 'entry';
  }
  const segments = parsed.pathname.split('/').filter(Boolean).map(segment => segment.replace(/\.git$/iu, ''));
  let parts;
  if (parsed.hostname.toLowerCase() === 'github.com' && segments.length >= 2) {
    // A curated subdirectory is `owner/repo/tree/<ref>/<path>`; the ref is not
    // part of the plugin's identity, so two branches of the same package share
    // one slug and the collision suffix keeps them apart.
    const directory = segments[2] === 'tree' && segments.length > 4 ? segments.slice(4) : [];
    parts = [segments[0], segments[1], ...directory];
  } else {
    parts = [parsed.hostname, ...segments];
  }
  return parts.join('-').toLowerCase().replace(/[^a-z0-9]+/gu, '-').replace(/^-+|-+$/gu, '');
}

function safeRepositoryPath(parts) {
  return parts.length > 0 && parts.every(part => part !== '' && part !== '.' && part !== '..' && GITHUB_PATH.test(part));
}

/**
 * Parse the registry `url` into the Git target dsh-market installs from.
 * A GitHub tree URL carries the curated ref and the package directory.
 * @param catalogUrl the entry's unique catalog URL.
 * @returns repository URL, optional ref, optional directory.
 */
function githubTarget(catalogUrl) {
  const invalid = { repositoryUrl: null, repositoryPath: null, repositoryRef: null };
  // A URL parser folds `.`/`..` segments and empty segments away, so the raw
  // path is validated first; otherwise a traversal path would be silently
  // rewritten into a different install target.
  const rawPath = /^https:\/\/github\.com(\/[^?#]*)/iu.exec(catalogUrl)?.[1];
  if (rawPath === undefined) return invalid;
  const rawSegments = rawPath.replace(/\/+$/u, '').split('/').slice(1);
  if (rawSegments.some(segment => segment === '' || segment === '.' || segment === '..'
    || segment.toLowerCase() === '%2e' || segment.toLowerCase() === '%2e%2e')) return invalid;
  let parsed;
  try {
    parsed = new URL(catalogUrl);
  } catch {
    return invalid;
  }
  if (parsed.protocol !== 'https:'
    || parsed.hostname.toLowerCase() !== 'github.com'
    || parsed.port !== ''
    || parsed.username !== ''
    || parsed.password !== ''
    || parsed.search !== ''
    || parsed.hash !== '') return invalid;
  const parts = parsed.pathname.replace(/\/+$/u, '').split('/').slice(1);
  if (parts.length < 2 || !parts.slice(0, 2).every(part => GITHUB_NAME.test(part))) return invalid;
  const owner = parts[0];
  const repository = parts[1].replace(/\.git$/iu, '');
  const repositoryUrl = `https://github.com/${owner}/${repository}`;
  if (parts.length === 2) return { repositoryUrl, repositoryPath: null, repositoryRef: null };
  if (parts[2] !== 'tree' || parts.length < 5 || !GITHUB_NAME.test(parts[3])) return invalid;
  const directory = parts.slice(4);
  if (!safeRepositoryPath(directory)) return invalid;
  return { repositoryUrl, repositoryPath: directory.join('/'), repositoryRef: parts[3] };
}

/** A clone URL pnpm accepts: https, no credentials, query, or fragment, and a repository path. */
function isRepositoryUrl(value) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:'
      && parsed.username === ''
      && parsed.password === ''
      && parsed.search === ''
      && parsed.hash === ''
      && parsed.pathname.replace(/^\/+|\/+$/gu, '').split('/').length >= 2;
  } catch {
    return false;
  }
}

function isPackageName(value) {
  return typeof value === 'string' && value.length <= 214 && NPM_PACKAGE.test(value);
}

/**
 * Whether an HTTPS GitHub Release archive belongs to the entry's own
 * repository. Release CDN URLs are rejected because they cannot be bound to the
 * repository identity published by the entry.
 */
function releaseArchiveBelongsToRepository(archive, repositoryUrl) {
  if (typeof repositoryUrl !== 'string') return false;
  try {
    const archiveUrl = new URL(archive);
    const repository = new URL(repositoryUrl);
    if (archiveUrl.protocol !== 'https:' || repository.protocol !== 'https:') return false;
    if (archiveUrl.hostname.toLowerCase() !== 'github.com' || repository.hostname.toLowerCase() !== 'github.com') return false;
    if (archiveUrl.port !== '' || archiveUrl.username !== '' || archiveUrl.password !== '' || archiveUrl.search !== '' || archiveUrl.hash !== '') return false;
    const repositoryPath = repository.pathname.replace(/\.git$/iu, '').replace(/\/+$/u, '');
    const repositoryParts = repositoryPath.split('/').filter(Boolean);
    const archiveParts = archiveUrl.pathname.split('/').filter(Boolean);
    if (repositoryParts.length !== 2 || archiveParts.length < 4 || !ARCHIVE_PATH.test(archiveUrl.pathname)) return false;
    return archiveParts[0].toLowerCase() === repositoryParts[0].toLowerCase()
      && archiveParts[1].toLowerCase() === repositoryParts[1].toLowerCase()
      && archiveParts[2] === 'releases';
  } catch {
    return false;
  }
}

/**
 * The install targets dsh-market can hand to the Harness plugin manager, in
 * the order dsh-market prefers them: registry, release archive, repository.
 * @param entry one registry entry.
 * @returns ranked targets; the first is the default.
 */
export function installTargetsFor(entry, targetIds) {
  const targets = [];
  const npm = optionalString(entry.npm);
  if (npm !== null && isPackageName(npm)) {
    const version = optionalString(entry.version);
    const pinned = version !== null && EXACT_VERSION.test(version);
    targets.push({
      kind: 'registry',
      spec: pinned ? `${npm}@${version}` : npm,
      packageName: npm,
      packageVersion: pinned ? version : null,
    });
  }
  const tarball = optionalString(entry.tarball);
  const github = githubTarget(optionalString(entry.url) ?? '');
  if (tarball !== null && releaseArchiveBelongsToRepository(tarball, github.repositoryUrl)) {
    targets.push({ kind: 'archive', spec: `archive+${tarball}`, packageName: null, packageVersion: optionalString(entry.version) });
  }
  if (isRepositoryUrl(github.repositoryUrl)) {
    const repository = github.repositoryUrl.replace(/\.git$/iu, '');
    const reference = github.repositoryRef ?? (github.repositoryPath === null ? null : 'HEAD');
    const parameters = [];
    if (reference !== null) parameters.push(reference);
    if (github.repositoryPath !== null) parameters.push(`path:/${github.repositoryPath}`);
    const spec = `git+${repository}.git${parameters.length === 0 ? '' : `#${parameters.join('&')}`}`;
    targets.push({ kind: 'git', spec, packageName: null, packageVersion: null });
  }
  return targets.map((target, index) => ({
    ...target,
    isDefault: index === 0,
    priority: (index + 1) * 10,
    id: stableId(TARGET_ID_BASE, `${entry.url}#target:${target.kind}:${target.spec}`, targetIds),
    uuid: stableUuid('plugin.dsh-market.target', `${entry.url}#${target.kind}:${target.spec}`),
  }));
}

function mediaFor(entry, mediaIds) {
  const rows = [];
  const icon = optionalString(entry.icon);
  if (icon !== null) {
    rows.push({ kind: 'icon', url: icon, sortOrder: 0 });
  }
  normalizedList(entry.screenshots).forEach((url, index) => {
    rows.push({ kind: 'screenshot', url, sortOrder: index + 1 });
  });
  return rows.map(row => ({
    ...row,
    id: stableId(MEDIA_ID_BASE, `${entry.url}#media:${row.kind}:${row.url}`, mediaIds),
    uuid: stableUuid('plugin.dsh-market.media', `${entry.url}#${row.kind}:${row.url}`),
  }));
}

function capabilitiesFor(entry, capabilityIds) {
  const checkedAt = isoInstant(entry.capabilityCheckedAt);
  const rows = [];
  normalizedList(entry.capabilities).forEach((code, index) => {
    rows.push({ kind: 'capability', code, sortOrder: index + 1, checkedAt });
  });
  normalizedList(entry.capabilityRedLines).forEach((code, index) => {
    rows.push({ kind: 'red_line', code, sortOrder: index + 1, checkedAt });
  });
  return rows.map(row => ({
    ...row,
    id: stableId(CAPABILITY_ID_BASE, `${entry.url}#capability:${row.kind}:${row.code}`, capabilityIds),
    uuid: stableUuid('plugin.dsh-market.capability', `${entry.url}#${row.kind}:${row.code}`),
  }));
}

function officialEntryFor(bundle, revision, categoryId, ids, usedKeys) {
  const entry = officialCatalogEntry(bundle);
  const pluginKey = `sdkwork-official-${bundle.packageName.slice('@deepseek-ai/'.length)}`;
  if (usedKeys.has(pluginKey)) throw new Error(`duplicate Official plugin key ${pluginKey}`);
  usedKeys.add(pluginKey);
  const repositoryUrl = 'https://github.com/deepseek-ai/deepseek-harness';
  const metadata = {
    provider: 'sdkwork',
    source: 'sdkwork-official-bundles',
    catalogUrl: entry.url,
    pageUrl: null,
    owner: entry.owner,
    npmPackage: entry.npm,
    tarballUrl: null,
    repositoryUrl,
    repositoryPath: bundle.packagePath,
    repositoryRef: 'main',
    version: entry.version,
    install: null,
    categories: ['official'],
    added: null,
    stars: 0,
    starsCheckedAt: null,
    downloads: 0,
    downloadsStart: null,
    downloadsEnd: null,
    downloadsCheckedAt: null,
    githubReleaseDownloads: null,
    releaseManifest: null,
    iconUrl: null,
    screenshots: [],
    capabilities: [],
    capabilityRedLines: [],
    capabilityCheckedAt: null,
    deprecated: false,
    replacement: null,
    previousNpm: [],
    catalogRevision: revision,
    release: null,
    recentCommits: [],
    updatesCheckedAt: null,
    raw: {},
  };
  return {
    id: stableId(PLUGIN_ID_BASE, entry.url, ids.pluginIds),
    uuid: stableUuid('plugin.sdkwork.official', entry.url),
    pluginKey,
    provider: 'sdkwork',
    catalogProvider: 'sdkwork',
    catalogUrl: entry.url,
    catalogPageUrl: null,
    ownerLogin: entry.owner,
    npmPackage: entry.npm,
    tarballUrl: null,
    repositoryUrl,
    repositoryPath: bundle.packagePath,
    repositoryRef: 'main',
    registryVersion: entry.version,
    addedOn: null,
    starsCount: 0,
    starsCheckedAt: null,
    downloadsCount: 0,
    downloadsStart: null,
    downloadsEnd: null,
    downloadsCheckedAt: null,
    isDeprecated: false,
    replacedByCatalogUrl: null,
    catalogRevision: revision,
    categoryCode: OFFICIAL_CATEGORY.code,
    categoryId,
    name: entry.name,
    description: entry.description['en-US'],
    nameLocales: entry.nameLocales,
    descriptionLocales: entry.description,
    iconUrl: null,
    usageCount: 0,
    versionLabel: entry.version,
    metadata,
    installTargets: installTargetsFor(entry, ids.targetIds),
    media: mediaFor(entry, ids.mediaIds),
    capabilities: capabilitiesFor(entry, ids.capabilityIds),
    tags: ['official'],
  };
}

/**
 * Project the registry document onto the SDKWork Plugins initialization data.
 * @param document parsed `plugins.json`.
 * @param updates parsed `updates.json` (the release/commit history the market
 *   shows per repository), when available.
 * @returns the normalized catalog: revision, categories, and entries with rows.
 */
export function normalizeCatalog(document, updates = undefined) {
  if (!document || !Array.isArray(document.plugins)) {
    throw new Error('dsh-market catalog must contain a plugins array');
  }
  const revision = optionalString(document.updated) ?? 'unknown';
  const categoryLabels = document.categories ?? {};
  // The changelog document is keyed by repository URL, the same origin the
  // entry's own repository facts name.
  const updatesByRepository = updates?.updates && typeof updates.updates === 'object' ? updates.updates : {};
  // An upstream row that claims an Official URL or npm identity is replaced by
  // the authoritative SDKWork record below rather than emitted twice.
  const marketEntries = document.plugins.filter(entry => officialBundleForEntry(entry) === null);

  // Registry categories retain their first-seen sort position after the
  // SDKWork-owned Official category.
  const categoryCodes = new Map();
  for (const entry of marketEntries) {
    for (const code of normalizedList(entry.category)) {
      if (code === OFFICIAL_CATEGORY.code) continue;
      if (!categoryCodes.has(code)) categoryCodes.set(code, categoryCodes.size);
    }
  }
  const categoryIds = new Set();
  const categories = [
    {
      code: OFFICIAL_CATEGORY.code,
      id: stableId(CATEGORY_ID_BASE, OFFICIAL_CATEGORY.code, categoryIds),
      uuid: stableUuid('cat.sdkwork.official', OFFICIAL_CATEGORY.code),
      sortOrder: OFFICIAL_CATEGORY.sortOrder,
      labels: OFFICIAL_CATEGORY.labels,
      taxonomySource: OFFICIAL_CATEGORY.taxonomySource,
    },
    ...[...categoryCodes.keys()].sort().map((code, index) => ({
      code,
      id: stableId(CATEGORY_ID_BASE, code, categoryIds),
      uuid: stableUuid('cat.dsh-market', code),
      sortOrder: 1000 + (categoryCodes.get(code) ?? index),
      labels: {
        'zh-CN': optionalString(categoryLabels[code]?.zh) ?? code,
        'en-US': optionalString(categoryLabels[code]?.en) ?? code,
      },
      taxonomySource: 'dsh-market',
    })),
  ];
  const categoryByCode = new Map(categories.map(category => [category.code, category]));

  const pluginIds = new Set();
  const usedKeys = new Set();

  // Stable plugin keys: a readable slug of the unique catalog URL, with a
  // deterministic suffix on every member of a colliding group so the key can
  // never depend on catalog order.
  const baseKeys = marketEntries.map(entry => {
    const slug = slugFromUrl(optionalString(entry.url) ?? '');
    const base = `dsh-${slug === '' ? `entry-${sha256(optionalString(entry.url) ?? '').slice(0, 8)}` : slug}`;
    return base.slice(0, 118).replace(/-+$/u, '');
  });
  const groups = new Map();
  baseKeys.forEach((key, index) => {
    const members = groups.get(key) ?? [];
    members.push(index);
    groups.set(key, members);
  });
  const keys = baseKeys.map((key, index) => {
    const collision = (groups.get(key)?.length ?? 0) > 1;
    return collision
      ? `${key}-${sha256(optionalString(marketEntries[index].url) ?? String(index)).slice(0, 8)}`
      : key;
  });

  const targetIds = new Set();
  const mediaIds = new Set();
  const capabilityIds = new Set();
  const entries = marketEntries.map((entry, index) => {
    const catalogUrl = optionalString(entry.url);
    if (catalogUrl === null) throw new Error(`catalog entry ${index} has no url`);
    const pluginKey = keys[index];
    if (usedKeys.has(pluginKey)) throw new Error(`catalog entry ${index} produced a duplicate plugin key ${pluginKey}`);
    usedKeys.add(pluginKey);

    const categoriesOfEntry = normalizedList(entry.category);
    const primary = categoriesOfEntry[0] === undefined ? null : categoryByCode.get(categoriesOfEntry[0]) ?? null;
    const description = entry.description && typeof entry.description === 'object' ? entry.description : {};
    const zhDescription = optionalString(description.zh);
    const enDescription = optionalString(description.en);
    const displayName = optionalString(entry.name) ?? optionalString(entry.npm) ?? catalogUrl;
    const github = githubTarget(catalogUrl);
    const changelog = updatesByRepository[github.repositoryUrl] ?? updatesByRepository[catalogUrl];
    const release = changelog?.release && typeof changelog.release === 'object'
      ? {
        tag: optionalString(changelog.release.tag),
        name: optionalString(changelog.release.name),
        publishedAt: isoInstant(changelog.release.publishedAt),
        url: optionalString(changelog.release.url),
        body: optionalString(changelog.release.body),
      }
      : null;
    const recentCommits = Array.isArray(changelog?.commits)
      ? changelog.commits.slice(0, 10).flatMap(commit => (typeof commit?.sha === 'string' && commit.sha !== ''
        ? [{
          sha: commit.sha,
          message: optionalString(commit.message),
          date: isoInstant(commit.date),
        }]
        : []))
      : [];
    const raw = Object.fromEntries(Object.entries(entry).filter(([key]) => !KNOWN_ENTRY_KEYS.has(key)));
    const downloads = boundedInteger(entry.downloads);
    const stars = boundedInteger(entry.stars);
    const metadata = {
      provider: 'dsh-market',
      catalogUrl,
      pageUrl: optionalString(entry.page),
      owner: optionalString(entry.owner),
      npmPackage: optionalString(entry.npm),
      tarballUrl: optionalString(entry.tarball),
      repositoryUrl: github.repositoryUrl,
      repositoryPath: github.repositoryPath,
      repositoryRef: github.repositoryRef,
      version: optionalString(entry.version),
      install: optionalString(entry.install),
      categories: categoriesOfEntry,
      added: optionalString(entry.added),
      stars,
      starsCheckedAt: isoInstant(entry.starsCheckedAt),
      downloads,
      downloadsStart: isoDate(entry.downloadsStart),
      downloadsEnd: isoDate(entry.downloadsEnd),
      downloadsCheckedAt: isoDate(entry.downloadsCheckedAt),
      githubReleaseDownloads: boundedInteger(entry.githubReleaseDownloads),
      releaseManifest: entry.releaseManifest && typeof entry.releaseManifest === 'object' ? entry.releaseManifest : null,
      iconUrl: optionalString(entry.icon),
      screenshots: normalizedList(entry.screenshots),
      capabilities: normalizedList(entry.capabilities),
      capabilityRedLines: normalizedList(entry.capabilityRedLines),
      capabilityCheckedAt: isoInstant(entry.capabilityCheckedAt),
      deprecated: entry.deprecated === true,
      replacement: optionalString(entry.replacement),
      previousNpm: normalizedList(entry.previousNpm),
      catalogRevision: revision,
      release,
      recentCommits,
      updatesCheckedAt: isoDate(changelog?.checkedAt),
      raw,
    };
    const installTargets = installTargetsFor(entry, targetIds);
    return {
      id: stableId(PLUGIN_ID_BASE, catalogUrl, pluginIds),
      uuid: stableUuid('plugin.dsh-market', catalogUrl),
      pluginKey,
      provider: 'dsh-market',
      catalogProvider: 'dsh-market',
      catalogUrl,
      catalogPageUrl: metadata.pageUrl,
      ownerLogin: metadata.owner,
      npmPackage: metadata.npmPackage,
      tarballUrl: metadata.tarballUrl,
      repositoryUrl: github.repositoryUrl,
      repositoryPath: github.repositoryPath,
      repositoryRef: github.repositoryRef,
      registryVersion: metadata.version,
      addedOn: isoDate(entry.added),
      starsCount: stars ?? 0,
      starsCheckedAt: metadata.starsCheckedAt,
      downloadsCount: downloads ?? 0,
      downloadsStart: metadata.downloadsStart,
      downloadsEnd: metadata.downloadsEnd,
      downloadsCheckedAt: metadata.downloadsCheckedAt,
      isDeprecated: metadata.deprecated,
      replacedByCatalogUrl: metadata.replacement,
      catalogRevision: revision,
      categoryCode: primary?.code ?? null,
      categoryId: primary?.id ?? null,
      name: displayName,
      description: enDescription ?? zhDescription,
      nameLocales: { 'en-US': displayName },
      descriptionLocales: {
        ...(enDescription === null ? {} : { 'en-US': enDescription }),
        ...(zhDescription === null ? {} : { 'zh-CN': zhDescription }),
      },
      iconUrl: metadata.iconUrl,
      usageCount: downloads ?? 0,
      versionLabel: metadata.version ?? '',
      metadata,
      installTargets,
      media: mediaFor(entry, mediaIds),
      capabilities: capabilitiesFor(entry, capabilityIds),
      tags: categoriesOfEntry,
    };
  });
  const officialCategoryId = categories[0].id;
  entries.push(...OFFICIAL_BUNDLES.map(bundle => officialEntryFor(
    bundle,
    revision,
    officialCategoryId,
    { pluginIds, targetIds, mediaIds, capabilityIds },
    usedKeys,
  )));
  return {
    revision,
    sourceUrl: optionalString(document.url) ?? DEFAULT_CATALOG_URL,
    updated: document.updated ?? null,
    count: entries.length,
    categories,
    entries,
    changelog: {
      sourceUrl: optionalString(updates?.url) ?? null,
      revision: optionalString(updates?.updated) ?? null,
      repositoryCount: Object.keys(updatesByRepository).length,
      entryCount: entries.filter(entry => entry.metadata.release !== null || entry.metadata.recentCommits.length > 0).length,
    },
  };
}

function categorySql(catalog) {
  const rows = catalog.categories.map(category => `    (${category.id}, ${sqlText(category.uuid)}, ${ADMIN_TENANT_ID}, 0, ${sqlText(category.code)}, ${sqlText(category.code)}, NULL, '{}'::jsonb, '{}'::jsonb, ${category.sortOrder}, 1, ${sqlText(category.taxonomySource)})`);
  return `INSERT INTO ai_plugin_category (id, uuid, tenant_id, organization_id, category_code, name, description, name_locales_json, description_locales_json, sort_order, lifecycle_status, taxonomy_source)\nVALUES\n${rows.join(',\n')}\nON CONFLICT (tenant_id, category_code) DO UPDATE SET\n    taxonomy_source = EXCLUDED.taxonomy_source,\n    sort_order = EXCLUDED.sort_order,\n    updated_at = CURRENT_TIMESTAMP;`;
}

/** One catalog row as the jsonb item the single INSERT reads. */
function entryItem(entry) {
  return {
    id: entry.id,
    uuid: entry.uuid,
    pluginKey: entry.pluginKey,
    provider: entry.provider,
    catalogProvider: entry.catalogProvider,
    catalogUrl: entry.catalogUrl,
    catalogPageUrl: entry.catalogPageUrl,
    ownerLogin: entry.ownerLogin,
    npmPackage: entry.npmPackage,
    tarballUrl: entry.tarballUrl,
    repositoryUrl: entry.repositoryUrl,
    repositoryPath: entry.repositoryPath,
    repositoryRef: entry.repositoryRef,
    registryVersion: entry.registryVersion,
    addedOn: entry.addedOn,
    starsCount: entry.starsCount,
    starsCheckedAt: entry.starsCheckedAt,
    downloadsCount: entry.downloadsCount,
    downloadsStart: entry.downloadsStart,
    downloadsEnd: entry.downloadsEnd,
    downloadsCheckedAt: entry.downloadsCheckedAt,
    isDeprecated: entry.isDeprecated,
    replacedByCatalogUrl: entry.replacedByCatalogUrl,
    catalogRevision: entry.catalogRevision,
    categoryCode: entry.categoryCode,
    categoryId: entry.categoryId,
    name: entry.name,
    description: entry.description,
    nameLocales: entry.nameLocales,
    descriptionLocales: entry.descriptionLocales,
    iconUrl: entry.iconUrl,
    usageCount: entry.usageCount,
    versionLabel: entry.versionLabel,
    tags: entry.tags,
    marketplaceMetadata: entry.metadata,
    installTargets: entry.installTargets,
    media: entry.media,
    capabilities: entry.capabilities,
  };
}

export function renderSeedSql(catalog) {
  const payload = JSON.stringify(stripNulDeep(catalog.entries.map(entryItem)));
  // One catalog payload, loaded once into a transaction-scoped table. The
  // literal is single-quoted so the framework's seed validator sees a string,
  // not executable SQL: catalog copy does contain `--`, `/*`, and SQL words.
  const literal = `'${payload.replaceAll("'", "''")}'`;
  return `-- Generated by tools/import_dsh_market_catalog.mjs
-- Source: ${catalog.sourceUrl}
-- Revision: ${catalog.revision}
-- Entries: ${catalog.count}
-- Categories: ${catalog.categories.length}
-- The catalog payload is registry data. The per-row display columns are set by
-- the locale seed sets under seeds/locales/{locale}/.

BEGIN;

CREATE TEMP TABLE dsh_market_catalog_payload (
    item JSONB NOT NULL
) ON COMMIT DROP;

INSERT INTO dsh_market_catalog_payload (item)
SELECT value
FROM jsonb_array_elements(${literal}::jsonb);

${categorySql(catalog)}

-- Reappearing URLs keep their numeric id and uuid. Only rows owned by this
-- catalog are resurrected; SDKWork product rows and other tenants are untouched.
UPDATE ai_plugin AS plugin
SET deleted_at = NULL,
    lifecycle_status = 1,
    updated_at = CURRENT_TIMESTAMP
FROM dsh_market_catalog_payload AS catalog
WHERE plugin.tenant_id = ${ADMIN_TENANT_ID}
  AND plugin.catalog_provider = catalog.item->>'catalogProvider'
  AND plugin.catalog_url = catalog.item->>'catalogUrl'
  AND plugin.deleted_at IS NOT NULL
  AND (plugin.catalog_provider = 'dsh-market'
    OR (plugin.catalog_provider = 'sdkwork'
      AND plugin.marketplace_metadata_json->>'source' = 'sdkwork-official-bundles'));

-- The partial default-target unique index requires every old catalog default
-- to be cleared before the incoming default rows are written.
UPDATE ai_plugin_install_target AS target
SET is_default = FALSE,
    updated_at = CURRENT_TIMESTAMP
FROM ai_plugin AS plugin
WHERE target.tenant_id = ${ADMIN_TENANT_ID}
  AND target.plugin_id = plugin.id
  AND target.is_default
  AND target.deleted_at IS NULL
  AND plugin.deleted_at IS NULL
  AND (plugin.catalog_provider = 'dsh-market'
    OR (plugin.catalog_provider = 'sdkwork'
      AND plugin.marketplace_metadata_json->>'source' = 'sdkwork-official-bundles'));

WITH catalog AS (
    SELECT item FROM dsh_market_catalog_payload
)
INSERT INTO ai_plugin (
    id, uuid, tenant_id, organization_id, owner_user_id, plugin_key, name, description,
    name_locales_json, description_locales_json, icon_url, usage_count, is_featured, featured_order,
    featured_title_locales_json, featured_description_locales_json, featured_image_url, category_id,
    category_code, version_label, provider, implementation_type, visibility, manifest_json, source_json,
    marketplace_metadata_json, install_status, lifecycle_status, tags_json, allowed_role_codes_json,
    catalog_provider, catalog_url, catalog_page_url, owner_login, npm_package, tarball_url,
    repository_url, repository_path, repository_ref, registry_version, added_on, stars_count,
    stars_checked_at, downloads_count, downloads_start, downloads_end, downloads_checked_at,
    is_deprecated, replaced_by_catalog_url, catalog_revision
)
SELECT
    (item->>'id')::bigint, item->>'uuid', ${ADMIN_TENANT_ID}, 0, 0, item->>'pluginKey',
    item->>'name', item->>'description', item->'nameLocales', item->'descriptionLocales',
    NULLIF(item->>'iconUrl', ''), (item->>'usageCount')::bigint, FALSE, 0, '{}'::jsonb, '{}'::jsonb,
    NULL, NULLIF(item->>'categoryId', '')::bigint, NULLIF(item->>'categoryCode', ''),
    COALESCE(item->>'versionLabel', ''), item->>'provider',
    CASE WHEN item->>'provider' = 'sdkwork' THEN 'sdkwork-native' ELSE 'custom' END,
    'public', '{}'::jsonb, NULL,
    item->'marketplaceMetadata', 'available', 1, item->'tags', '[]'::jsonb,
    item->>'catalogProvider', item->>'catalogUrl', NULLIF(item->>'catalogPageUrl', ''),
    NULLIF(item->>'ownerLogin', ''), NULLIF(item->>'npmPackage', ''), NULLIF(item->>'tarballUrl', ''),
    NULLIF(item->>'repositoryUrl', ''), NULLIF(item->>'repositoryPath', ''), NULLIF(item->>'repositoryRef', ''),
    NULLIF(item->>'registryVersion', ''), NULLIF(item->>'addedOn', '')::date,
    COALESCE((item->>'starsCount')::bigint, 0), NULLIF(item->>'starsCheckedAt', '')::timestamptz,
    COALESCE((item->>'downloadsCount')::bigint, 0), NULLIF(item->>'downloadsStart', '')::date,
    NULLIF(item->>'downloadsEnd', '')::date, NULLIF(item->>'downloadsCheckedAt', '')::timestamptz,
    COALESCE((item->>'isDeprecated')::boolean, FALSE), NULLIF(item->>'replacedByCatalogUrl', ''),
    NULLIF(item->>'catalogRevision', '')
FROM catalog
ON CONFLICT (tenant_id, catalog_provider, catalog_url)
    WHERE catalog_url IS NOT NULL AND deleted_at IS NULL
DO UPDATE SET
    uuid = EXCLUDED.uuid,
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    name_locales_json = EXCLUDED.name_locales_json,
    description_locales_json = EXCLUDED.description_locales_json,
    icon_url = EXCLUDED.icon_url,
    usage_count = EXCLUDED.usage_count,
    category_id = EXCLUDED.category_id,
    category_code = EXCLUDED.category_code,
    version_label = EXCLUDED.version_label,
    provider = EXCLUDED.provider,
    marketplace_metadata_json = EXCLUDED.marketplace_metadata_json,
    tags_json = EXCLUDED.tags_json,
    catalog_provider = EXCLUDED.catalog_provider,
    catalog_url = EXCLUDED.catalog_url,
    catalog_page_url = EXCLUDED.catalog_page_url,
    owner_login = EXCLUDED.owner_login,
    npm_package = EXCLUDED.npm_package,
    tarball_url = EXCLUDED.tarball_url,
    repository_url = EXCLUDED.repository_url,
    repository_path = EXCLUDED.repository_path,
    repository_ref = EXCLUDED.repository_ref,
    registry_version = EXCLUDED.registry_version,
    added_on = EXCLUDED.added_on,
    stars_count = EXCLUDED.stars_count,
    stars_checked_at = EXCLUDED.stars_checked_at,
    downloads_count = EXCLUDED.downloads_count,
    downloads_start = EXCLUDED.downloads_start,
    downloads_end = EXCLUDED.downloads_end,
    downloads_checked_at = EXCLUDED.downloads_checked_at,
    is_deprecated = EXCLUDED.is_deprecated,
    replaced_by_catalog_url = EXCLUDED.replaced_by_catalog_url,
    catalog_revision = EXCLUDED.catalog_revision,
    lifecycle_status = 1,
    deleted_at = NULL,
    updated_at = CURRENT_TIMESTAMP;

-- Stale children of retained plugins are removed before upsert. They are hard
-- deleted because the child uniqueness constraints include soft-deleted rows.
DELETE FROM ai_plugin_install_target AS target
USING ai_plugin AS plugin, dsh_market_catalog_payload AS catalog
WHERE target.tenant_id = ${ADMIN_TENANT_ID}
  AND target.plugin_id = plugin.id
  AND plugin.tenant_id = ${ADMIN_TENANT_ID}
  AND plugin.catalog_provider = catalog.item->>'catalogProvider'
  AND plugin.catalog_url = catalog.item->>'catalogUrl'
  AND target.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(catalog.item->'installTargets') AS incoming
    WHERE incoming->>'kind' = target.target_kind
      AND incoming->>'spec' = target.target_spec
  );

WITH catalog AS (
    SELECT item FROM dsh_market_catalog_payload
), targets AS (
    SELECT plugin.id AS plugin_id, target.value AS item
    FROM catalog
    JOIN ai_plugin AS plugin
      ON plugin.tenant_id = ${ADMIN_TENANT_ID}
     AND plugin.catalog_provider = catalog.item->>'catalogProvider'
     AND plugin.catalog_url = catalog.item->>'catalogUrl'
    CROSS JOIN LATERAL jsonb_array_elements(catalog.item->'installTargets') AS target
)
INSERT INTO ai_plugin_install_target (
    id, uuid, tenant_id, organization_id, plugin_id, target_kind, target_spec,
    package_name, package_version, is_default, source_priority, lifecycle_status
)
SELECT
    (item->>'id')::bigint, item->>'uuid', ${ADMIN_TENANT_ID}, 0, plugin_id, item->>'kind', item->>'spec',
    NULLIF(item->>'packageName', ''), NULLIF(item->>'packageVersion', ''),
    COALESCE((item->>'isDefault')::boolean, FALSE), (item->>'priority')::integer, 1
FROM targets
ON CONFLICT (tenant_id, plugin_id, target_kind, target_spec) DO UPDATE SET
    package_name = EXCLUDED.package_name,
    package_version = EXCLUDED.package_version,
    is_default = EXCLUDED.is_default,
    source_priority = EXCLUDED.source_priority,
    lifecycle_status = 1,
    deleted_at = NULL,
    updated_at = CURRENT_TIMESTAMP;

DELETE FROM ai_plugin_media AS media
USING ai_plugin AS plugin, dsh_market_catalog_payload AS catalog
WHERE media.tenant_id = ${ADMIN_TENANT_ID}
  AND media.plugin_id = plugin.id
  AND plugin.tenant_id = ${ADMIN_TENANT_ID}
  AND plugin.catalog_provider = catalog.item->>'catalogProvider'
  AND plugin.catalog_url = catalog.item->>'catalogUrl'
  AND media.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(catalog.item->'media') AS incoming
    WHERE incoming->>'kind' = media.media_kind
      AND (incoming->>'sortOrder')::integer = media.sort_order
  );

WITH catalog AS (
    SELECT item FROM dsh_market_catalog_payload
), media AS (
    SELECT plugin.id AS plugin_id, entry.value AS item
    FROM catalog
    JOIN ai_plugin AS plugin
      ON plugin.tenant_id = ${ADMIN_TENANT_ID}
     AND plugin.catalog_provider = catalog.item->>'catalogProvider'
     AND plugin.catalog_url = catalog.item->>'catalogUrl'
    CROSS JOIN LATERAL jsonb_array_elements(catalog.item->'media') AS entry
)
INSERT INTO ai_plugin_media (
    id, uuid, tenant_id, organization_id, plugin_id, media_kind, url, sort_order, lifecycle_status
)
SELECT
    (item->>'id')::bigint, item->>'uuid', ${ADMIN_TENANT_ID}, 0, plugin_id, item->>'kind',
    item->>'url', (item->>'sortOrder')::integer, 1
FROM media
ON CONFLICT (tenant_id, plugin_id, media_kind, sort_order) DO UPDATE SET
    url = EXCLUDED.url,
    lifecycle_status = 1,
    deleted_at = NULL,
    updated_at = CURRENT_TIMESTAMP;

DELETE FROM ai_plugin_capability AS capability
USING ai_plugin AS plugin, dsh_market_catalog_payload AS catalog
WHERE capability.tenant_id = ${ADMIN_TENANT_ID}
  AND capability.plugin_id = plugin.id
  AND plugin.tenant_id = ${ADMIN_TENANT_ID}
  AND plugin.catalog_provider = catalog.item->>'catalogProvider'
  AND plugin.catalog_url = catalog.item->>'catalogUrl'
  AND capability.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(catalog.item->'capabilities') AS incoming
    WHERE incoming->>'kind' = capability.disclosure_kind
      AND incoming->>'code' = capability.capability_code
  );

WITH catalog AS (
    SELECT item FROM dsh_market_catalog_payload
), capabilities AS (
    SELECT plugin.id AS plugin_id, entry.value AS item
    FROM catalog
    JOIN ai_plugin AS plugin
      ON plugin.tenant_id = ${ADMIN_TENANT_ID}
     AND plugin.catalog_provider = catalog.item->>'catalogProvider'
     AND plugin.catalog_url = catalog.item->>'catalogUrl'
    CROSS JOIN LATERAL jsonb_array_elements(catalog.item->'capabilities') AS entry
)
INSERT INTO ai_plugin_capability (
    id, uuid, tenant_id, organization_id, plugin_id, disclosure_kind, capability_code,
    checked_at, sort_order, lifecycle_status
)
SELECT
    (item->>'id')::bigint, item->>'uuid', ${ADMIN_TENANT_ID}, 0, plugin_id, item->>'kind',
    item->>'code', NULLIF(item->>'checkedAt', '')::timestamptz, (item->>'sortOrder')::integer, 1
FROM capabilities
ON CONFLICT (tenant_id, plugin_id, disclosure_kind, capability_code) DO UPDATE SET
    checked_at = EXCLUDED.checked_at,
    sort_order = EXCLUDED.sort_order,
    lifecycle_status = 1,
    deleted_at = NULL,
    updated_at = CURRENT_TIMESTAMP;

-- Only upstream-owned dsh-market rows are eligible for removal. Official and
-- SDKWork-authored rows, installations, and other tenants are never deleted.
UPDATE ai_plugin AS plugin
SET lifecycle_status = 4,
    deleted_at = CURRENT_TIMESTAMP,
    updated_at = CURRENT_TIMESTAMP
WHERE plugin.tenant_id = ${ADMIN_TENANT_ID}
  AND plugin.catalog_provider = 'dsh-market'
  AND plugin.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1
    FROM dsh_market_catalog_payload AS catalog
    WHERE catalog.item->>'catalogUrl' = plugin.catalog_url
      AND catalog.item->>'catalogProvider' = 'dsh-market'
  );

UPDATE ai_plugin_install_target AS target
SET lifecycle_status = 4,
    deleted_at = CURRENT_TIMESTAMP,
    updated_at = CURRENT_TIMESTAMP
FROM ai_plugin AS plugin
WHERE target.tenant_id = ${ADMIN_TENANT_ID}
  AND target.plugin_id = plugin.id
  AND target.deleted_at IS NULL
  AND plugin.tenant_id = ${ADMIN_TENANT_ID}
  AND plugin.catalog_provider = 'dsh-market'
  AND plugin.deleted_at IS NOT NULL;

UPDATE ai_plugin_media AS media
SET lifecycle_status = 4,
    deleted_at = CURRENT_TIMESTAMP,
    updated_at = CURRENT_TIMESTAMP
FROM ai_plugin AS plugin
WHERE media.tenant_id = ${ADMIN_TENANT_ID}
  AND media.plugin_id = plugin.id
  AND media.deleted_at IS NULL
  AND plugin.tenant_id = ${ADMIN_TENANT_ID}
  AND plugin.catalog_provider = 'dsh-market'
  AND plugin.deleted_at IS NOT NULL;

UPDATE ai_plugin_capability AS capability
SET lifecycle_status = 4,
    deleted_at = CURRENT_TIMESTAMP,
    updated_at = CURRENT_TIMESTAMP
FROM ai_plugin AS plugin
WHERE capability.tenant_id = ${ADMIN_TENANT_ID}
  AND capability.plugin_id = plugin.id
  AND capability.deleted_at IS NULL
  AND plugin.tenant_id = ${ADMIN_TENANT_ID}
  AND plugin.catalog_provider = 'dsh-market'
  AND plugin.deleted_at IS NOT NULL;

COMMIT;
`;
}

function localeCategorySql(catalog, locale) {
  const rows = catalog.categories.map(category => {
    const label = category.labels[locale] ?? category.code;
    return `    (${sqlText(category.code)}, ${sqlText(category.taxonomySource)}, ${sqlText(label)}, ${sqlJson({ [locale]: label })})`;
  });
  return `BEGIN;

UPDATE ai_plugin_category AS category
SET name = value.name,
    name_locales_json = category.name_locales_json || value.locales,
    updated_at = CURRENT_TIMESTAMP
FROM (VALUES
${rows.join(',\n')}
) AS value(code, taxonomy_source, name, locales)
WHERE category.tenant_id = ${ADMIN_TENANT_ID}
  AND category.taxonomy_source = value.taxonomy_source
  AND category.category_code = value.code;

COMMIT;
`;
}

function localeCatalogSql(catalog, locale) {
  const rows = catalog.entries.map(entry => {
    const name = locale === 'zh-CN'
      ? (entry.nameLocales['zh-CN'] ?? entry.name)
      : (entry.nameLocales[locale] ?? entry.name);
    const description = entry.descriptionLocales[locale] ?? entry.description ?? '';
    return `    (${sqlText(entry.catalogProvider)}, ${sqlText(entry.catalogUrl)}, ${sqlText(name)}, ${sqlText(description)}, ${sqlJson({ [locale]: description })})`;
  });
  return `BEGIN;

UPDATE ai_plugin AS plugin
SET name = value.name,
    description = value.description,
    description_locales_json = plugin.description_locales_json || value.locales,
    updated_at = CURRENT_TIMESTAMP
FROM (VALUES
${rows.join(',\n')}
) AS value(provider, catalog_url, name, description, locales)
WHERE plugin.tenant_id = ${ADMIN_TENANT_ID}
  AND plugin.catalog_provider = value.provider
  AND plugin.catalog_url = value.catalog_url;

COMMIT;
`;
}

async function writeFileEnsured(path, content) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content, 'utf8');
}

async function previousChangelog(root) {
  let seed;
  let snapshot;
  try {
    seed = await readFile(join(root, CATALOG_SEED), 'utf8');
  } catch (error) {
    // A first import has no prior release history to preserve.
    if (error.code === 'ENOENT') return undefined;
    throw error;
  }
  const marker = 'FROM jsonb_array_elements(';
  const from = seed.indexOf(marker);
  if (from === -1) return undefined;
  const start = seed.indexOf("'", from + marker.length);
  const end = seed.indexOf("'::jsonb", start);
  if (start === -1 || end === -1) throw new Error('existing catalog seed payload literal is malformed');
  const entries = JSON.parse(seed.slice(start + 1, end).replaceAll("''", "'"));
  try {
    snapshot = JSON.parse(await readFile(join(root, SNAPSHOT), 'utf8'));
  } catch (error) {
    // The seed still carries enough data to preserve per-repository history.
    if (error.code !== 'ENOENT') throw error;
  }
  const updates = {};
  for (const entry of entries) {
    const metadata = entry.marketplaceMetadata;
    if (metadata?.release === null || metadata?.release === undefined) {
      if ((metadata?.recentCommits?.length ?? 0) === 0) continue;
    }
    const key = metadata?.repositoryUrl ?? entry.catalogUrl;
    updates[key] = {
      release: metadata?.release ?? null,
      commits: metadata?.recentCommits ?? [],
      checkedAt: metadata?.updatesCheckedAt ?? undefined,
    };
  }
  return {
    url: snapshot?.source?.changelog?.sourceUrl ?? null,
    updated: snapshot?.source?.changelog?.revision ?? null,
    updates,
  };
}

async function refreshLocaleChecksums(root, files) {
  const manifestPath = join(root, 'database/seeds/seed.manifest.json');
  let manifest;
  try {
    manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  } catch (error) {
    // Generated catalogs can also target an isolated test directory.
    if (error.code === 'ENOENT') return;
    throw error;
  }
  for (const locale of ['zh-CN', 'en-US']) {
    const localeSet = manifest.localeSets?.[locale];
    if (localeSet === undefined) continue;
    const paths = localeSet.files ?? [];
    const content = paths.map(path => files.find(file => file.path === `database/seeds/${path}`)?.content ?? '').join('');
    if (paths.some(path => files.find(file => file.path === `database/seeds/${path}`) === undefined)) {
      throw new Error(`locale checksum manifest names unknown generated file for ${locale}`);
    }
    localeSet.checksum = `sha256:${sha256(content)}`;
  }
  await writeFileEnsured(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
}

/**
 * Regenerate every catalog asset and the recorded snapshot.
 * @param document parsed `plugins.json`.
 * @param root repository root.
 * @param updates parsed `updates.json`, when the caller has it.
 * @returns counts and checksums for the caller's report.
 */
export async function generateCatalogAssets(document, root = DEFAULT_ROOT, updates = undefined) {
  const catalog = normalizeCatalog(document, updates ?? await previousChangelog(root));
  const files = [
    { path: CATALOG_SEED, content: renderSeedSql(catalog) },
    { path: `database/seeds/locales/zh-CN/001_plugin_categories_display.sql`, content: localeCategorySql(catalog, 'zh-CN') },
    { path: `database/seeds/locales/zh-CN/002_plugin_catalog_display.sql`, content: localeCatalogSql(catalog, 'zh-CN') },
    { path: `database/seeds/locales/en-US/001_plugin_categories_display.sql`, content: localeCategorySql(catalog, 'en-US') },
    { path: `database/seeds/locales/en-US/002_plugin_catalog_display.sql`, content: localeCatalogSql(catalog, 'en-US') },
  ];
  const checksums = {};
  for (const file of files) {
    await writeFileEnsured(join(root, file.path), file.content);
    checksums[file.path] = `sha256:${sha256(file.content)}`;
  }
  await refreshLocaleChecksums(root, files);
  const snapshot = {
    schemaVersion: 1,
    kind: 'sdkwork.plugins.dsh-market.catalog-snapshot',
    source: {
      catalogUrl: catalog.sourceUrl,
      catalogName: 'dsh-market',
      revision: catalog.revision,
      updated: catalog.updated,
      entryCount: catalog.count,
      dshMarketEntryCount: catalog.entries.filter(entry => entry.catalogProvider === 'dsh-market').length,
      officialEntryCount: catalog.entries.filter(entry => entry.catalogProvider === 'sdkwork').length,
      categoryCount: catalog.categories.length,
      installTargetCount: catalog.entries.reduce((total, entry) => total + entry.installTargets.length, 0),
      mediaCount: catalog.entries.reduce((total, entry) => total + entry.media.length, 0),
      capabilityCount: catalog.entries.reduce((total, entry) => total + entry.capabilities.length, 0),
      deprecatedCount: catalog.entries.filter(entry => entry.isDeprecated).length,
      changelog: catalog.changelog,
    },
    seed: {
      file: CATALOG_SEED,
      checksum: checksums[CATALOG_SEED],
      localeSeeds: {
        'zh-CN': [checksums['database/seeds/locales/zh-CN/001_plugin_categories_display.sql'], checksums['database/seeds/locales/zh-CN/002_plugin_catalog_display.sql']],
        'en-US': [checksums['database/seeds/locales/en-US/001_plugin_categories_display.sql'], checksums['database/seeds/locales/en-US/002_plugin_catalog_display.sql']],
      },
    },
    regenerate: 'node tools/import_dsh_market_catalog.mjs --input <plugins.json> --updates <updates.json>',
  };
  await writeFileEnsured(join(root, SNAPSHOT), `${JSON.stringify(snapshot, null, 2)}\n`);
  return { catalog, checksums, snapshot };
}

async function readCatalog(input) {
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
    const key = token.slice(2);
    args[key] = argv[index + 1]?.startsWith('--') ? true : argv[++index];
  }
  return args;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = parseArgs(process.argv.slice(2));
  const input = typeof args.input === 'string' ? args.input : undefined;
  const root = typeof args.root === 'string' ? args.root : DEFAULT_ROOT;
  const document = await readCatalog(input);
  const updates = await readUpdates(typeof args.updates === 'string' ? args.updates : undefined);
  const { snapshot } = await generateCatalogAssets(document, root, updates);
  process.stdout.write(`Imported ${snapshot.source.entryCount} dsh-market entries at revision ${snapshot.source.revision} `
    + `(${snapshot.source.categoryCount} categories, ${snapshot.source.installTargetCount} install targets, `
    + `${snapshot.source.mediaCount} media rows, ${snapshot.source.capabilityCount} capability rows, `
    + `${snapshot.source.changelog.entryCount} changelog entries) into ${root}\n`);
}
