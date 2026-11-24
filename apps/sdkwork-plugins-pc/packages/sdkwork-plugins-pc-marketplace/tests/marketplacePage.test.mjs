import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { marketplaceCardState } from '../src/marketplaceCardState.ts';
import { marketplaceMessagesFor } from '../src/i18n/index.ts';

const INSTALLABLE = {
  installTargets: [
    { kind: 'registry', spec: '@example/demo@1.1.0', packageName: '@example/demo', packageVersion: '1.1.0', isDefault: true },
  ],
};

test('marks an installed record with the offered update and the uninstall action', () => {
  const state = marketplaceCardState(INSTALLABLE, {
    installation: { status: 'update-available', installedVersion: '1.0.0', version: '1.1.0', packageName: '@example/demo' },
  });

  assert.deepEqual(state, {
    available: true,
    installed: true,
    updateAvailable: true,
    installing: false,
    installEnabled: false,
    updateEnabled: true,
    removeEnabled: true,
    reason: undefined,
    installedVersion: '1.0.0',
    version: '1.1.0',
  });
});

test('offers no update or install action for an installed up-to-date record', () => {
  const state = marketplaceCardState(INSTALLABLE, { installation: { status: 'installed', installedVersion: '1.1.0' } });

  assert.equal(state.installed, true);
  assert.equal(state.updateAvailable, false);
  assert.equal(state.installEnabled, false);
  assert.equal(state.updateEnabled, false);
  assert.equal(state.removeEnabled, true);
});

test('disables every action while an install run is in flight', () => {
  const idle = marketplaceCardState(INSTALLABLE, { installing: true });
  assert.equal(idle.installing, true);
  assert.equal(idle.installEnabled, false);

  const installed = marketplaceCardState(INSTALLABLE, {
    installing: true,
    installation: { status: 'update-available', installedVersion: '1.0.0', version: '1.1.0' },
  });
  assert.equal(installed.updateEnabled, false);
  assert.equal(installed.removeEnabled, false);
});

test('blocks install and update on a host reason but still allows uninstall', () => {
  const blocked = marketplaceCardState(INSTALLABLE, { reason: 'Only the desktop build can install plugins.' });
  assert.equal(blocked.available, true);
  assert.equal(blocked.installEnabled, false);
  assert.equal(blocked.reason, 'Only the desktop build can install plugins.');

  const installed = marketplaceCardState(INSTALLABLE, {
    reason: 'Only the desktop build can install plugins.',
    installation: { status: 'update-available', installedVersion: '1.0.0', version: '1.1.0' },
  });
  assert.equal(installed.updateEnabled, false);
  assert.equal(installed.removeEnabled, true);
});

test('honours the host capability gate without trapping an installed package', () => {
  const fresh = marketplaceCardState(INSTALLABLE, { canInstall: false });
  assert.equal(fresh.available, true);
  assert.equal(fresh.installEnabled, false);

  const installed = marketplaceCardState(INSTALLABLE, {
    canInstall: false,
    installation: { status: 'update-available', installedVersion: '1.0.0' },
  });
  assert.equal(installed.updateEnabled, false);
  assert.equal(installed.removeEnabled, true);
});

test('reports an uninstallable record without offering a version', () => {
  const state = marketplaceCardState({ source: undefined });

  assert.equal(state.available, false);
  assert.equal(state.installed, false);
  assert.equal(state.installEnabled, false);
  assert.equal(state.version, undefined);
});

test('offers the catalog version of an installable record that is not installed', () => {
  const state = marketplaceCardState(INSTALLABLE);
  assert.equal(state.installEnabled, true);
  assert.equal(state.version, '1.1.0');
});

test('keeps the host offered version over the catalog projection', () => {
  const state = marketplaceCardState(INSTALLABLE, { installation: { status: 'update-available', version: '1.2.0' } });
  assert.equal(state.version, '1.2.0');
});

test('ships the install messages for both locales', () => {
  const zh = marketplaceMessagesFor('zh-CN');
  const en = marketplaceMessagesFor('en-US');

  assert.deepEqual(Object.keys(zh).sort(), Object.keys(en).sort());
  for (const [key, value] of Object.entries(zh)) {
    assert.equal(typeof value, typeof en[key], `locale parity for ${key}`);
  }

  assert.equal(zh.install, '安装');
  assert.equal(zh.installing, '安装中…');
  assert.equal(zh.installed, '已安装');
  assert.equal(zh.update, '更新');
  assert.equal(zh.remove, '卸载');
  assert.equal(zh.installedVersion('1.0.0'), '已安装 1.0.0');
  assert.equal(zh.updateTo('1.1.0'), '更新到 1.1.0');
  assert.equal(typeof zh.installDisabled, 'string');
  assert.equal(typeof zh.installFailed, 'string');
  assert.equal(typeof zh.removeFailed, 'string');
  assert.equal(typeof zh.retry, 'string');
  assert.equal(zh.sourceUnavailable, '该插件尚未配置安装来源');

  assert.equal(en.installing, 'Installing…');
  assert.equal(en.installed, 'Installed');
  assert.equal(en.update, 'Update');
  assert.equal(en.remove, 'Remove');
  assert.equal(en.installedVersion('1.0.0'), 'Installed 1.0.0');
  assert.equal(en.updateTo('1.1.0'), 'Update to 1.1.0');

  // The usage wording is a shared product string and must not drift.
  assert.equal(zh.usage('40'), '已使用 40 次');
  assert.equal(en.usage('40'), '40 uses');
});

const pageSource = await readFile(new URL('../src/components/MarketplacePage.tsx', import.meta.url), 'utf8');

function tagAt(source, index) {
  return source.slice(source.lastIndexOf('<', index), source.indexOf('>', index) + 1);
}

function openingTag(source, className) {
  const index = source.indexOf(`className={styles.${className}}`);
  assert.notEqual(index, -1, `styles.${className} must be rendered`);
  return tagAt(source, index);
}

test('card bodies are never click targets and only explicit controls install', () => {
  for (const className of ['featureCard', 'pluginRow']) {
    const tag = openingTag(pageSource, className);
    assert.ok(tag.startsWith('<article'), `${className} must be an article`);
    assert.equal(tag.includes('onClick'), false, `${className} body must not be clickable`);
    assert.equal(tag.includes('onInstall'), false, `${className} body must not install`);
  }

  for (const attribute of ['onInstall=', 'onUpdate=', 'onRemove=']) {
    let index = pageSource.indexOf(attribute);
    assert.notEqual(index, -1, `${attribute} must be wired`);
    while (index !== -1) {
      assert.ok(tagAt(pageSource, index).startsWith('<InstallControls'), `${attribute} may only reach <InstallControls>`);
      index = pageSource.indexOf(attribute, index + 1);
    }
  }

  assert.equal((pageSource.match(/<InstallControls /gu) ?? []).length, 2, 'both card layouts share the install controls');
  assert.equal((pageSource.match(/onOpenPlugin\(/gu) ?? []).length, 1, 'the featured title is the only plugin-opening control');
  assert.ok(pageSource.includes('styles.featureTitleLink'), 'the featured title is a link-button');
  assert.ok(pageSource.includes('aria-describedby='), 'a blocked control must reference its reason');
  assert.ok(pageSource.includes('role="alert"'), 'a failed install must be announced');
});
