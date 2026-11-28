import { useEffect, useId, useRef, useState } from 'react';
import type { PluginCategoryRecord, PluginRecord } from '@sdkwork/plugins-app-sdk';
import type { MarketplaceAppClient, MarketplaceCatalog } from '../services/marketplaceService.ts';
import { loadMarketplaceCatalog, mergeMarketplaceCatalog } from '../services/marketplaceService.ts';
import { marketplaceCardState, type MarketplaceCardState } from '../marketplaceCardState.ts';
import { marketplaceMessagesFor, type MarketplaceLocale } from '../i18n/index.ts';
import type { MarketplaceInstallationState, MarketplaceMessages } from '../types.ts';
import styles from './MarketplacePage.module.css';

export type { MarketplaceInstallationState, MarketplaceInstallTarget, MarketplaceInstallTargetKind } from '../types.ts';

type MarketplaceCategory = PluginCategoryRecord;

export interface MarketplacePageProps {
  appClient: MarketplaceAppClient;
  locale?: MarketplaceLocale;
  onManage?: () => void;
  onAdd?: () => void;
  onInstall?: (plugin: PluginRecord) => void;
  /** Install the catalog version over the installed one (host decides how). */
  onUpdate?: (plugin: PluginRecord, installation: MarketplaceInstallationState) => void;
  /** Uninstall the installed package. */
  onRemove?: (plugin: PluginRecord, installation: MarketplaceInstallationState) => void;
  /** Open the plugin's own page. Without it the card is not a link. */
  onOpenPlugin?: (plugin: PluginRecord) => void;
  /** Installed state for one catalog record, read from the local Host. */
  installationOf?: (plugin: PluginRecord) => MarketplaceInstallationState | undefined;
  /** Why installation is unavailable for this record right now (already localized). */
  installDisabledReason?: (plugin: PluginRecord) => string | undefined;
  /** Catalog records with an install run in flight. */
  installingKeys?: ReadonlySet<string>;
  activeSection?: 'plugins' | 'skills' | 'partners';
  onSectionChange?: (section: 'plugins' | 'skills' | 'partners') => void;
  /** Hide the embedded section switcher when a host provides the shared one. */
  showSectionNavigation?: boolean;
  canInstall?: boolean;
  /**
   * Controlled catalog query. When a host renders the toolbar itself it owns the
   * field, so the search text arrives here instead of the page keeping its own.
   */
  searchValue?: string;
  /** Called with the next query while `searchValue` is provided. */
  onSearchValueChange?: (value: string) => void;
  /**
   * Skip the page header — the search field and the two action buttons — so a
   * host can place that toolbar in its own chrome row. The category strip and
   * the catalog body remain.
   */
  hideToolbar?: boolean;
}

function localizedText(values: Record<string, string> | undefined, locale: MarketplaceLocale): string | undefined {
  return values?.[locale] || values?.[locale === 'zh-CN' ? 'zh' : 'en'] || values?.['en-US'];
}

function categoryName(category: MarketplaceCategory, locale: MarketplaceLocale): string {
  return localizedText(category.nameLocales, locale) || category.name;
}

function useDebouncedSearch(value: string, delayMs = 180): string {
  const [query, setQuery] = useState(value);
  useEffect(() => {
    const timeout = window.setTimeout(() => { setQuery(value); }, delayMs);
    return () => { window.clearTimeout(timeout); };
  }, [value, delayMs]);
  return query;
}

/** Visible explanation for a disabled install or update control. */
function controlReason(state: MarketplaceCardState, messages: MarketplaceMessages): string | undefined {
  if (state.installing) return undefined;
  // An installed up-to-date record only keeps its uninstall action, which the
  // install state cannot block.
  if (state.installed && !state.updateAvailable) return undefined;
  if (state.reason !== undefined) return state.reason;
  if (state.installed) return state.updateEnabled ? undefined : messages.installDisabled;
  if (!state.available) return messages.sourceUnavailable;
  return state.installEnabled ? undefined : messages.installDisabled;
}

interface InstallControlsProps {
  plugin: PluginRecord;
  installation?: MarketplaceInstallationState;
  state: MarketplaceCardState;
  messages: MarketplaceMessages;
  onInstall?: (plugin: PluginRecord) => void;
  onUpdate?: (plugin: PluginRecord, installation: MarketplaceInstallationState) => void;
  onRemove?: (plugin: PluginRecord, installation: MarketplaceInstallationState) => void;
}

/**
 * The only install surface on a card: a featured shelf body never installs, and
 * the popular row reuses the same controls so both layouts share one state model.
 */
function InstallControls({ plugin, installation, state, messages, onInstall, onUpdate, onRemove }: InstallControlsProps) {
  const reasonId = useId();
  const [failure, setFailure] = useState<'install' | 'remove' | undefined>();
  const run = (kind: 'install' | 'remove', action: (() => void) | undefined) => action === undefined ? undefined : () => {
    setFailure(undefined);
    try {
      action();
    } catch {
      // A Host callback that throws has already consumed the user action; report it on the card.
      setFailure(kind);
    }
  };
  const install = run('install', onInstall === undefined ? undefined : () => { onInstall(plugin); });
  const update = run('install', onUpdate === undefined || installation === undefined ? undefined : () => { onUpdate(plugin, installation); });
  const remove = run('remove', onRemove === undefined || installation === undefined ? undefined : () => { onRemove(plugin, installation); });
  const reason = controlReason(state, messages);
  const installDisabled = !state.installEnabled;
  const updateDisabled = !state.updateEnabled;
  const installFailed = failure === 'install' && !state.installing && (!state.installed || state.updateAvailable);
  const removeFailed = failure === 'remove' && state.installed && !state.installing;
  return (
    <span className={styles.installControls}>
      <span className={styles.installMeta}>
        {state.installed ? <span className={styles.installedBadge}>{state.installedVersion === undefined ? messages.installed : messages.installedVersion(state.installedVersion)}</span> : null}
        {state.installed && state.updateAvailable && state.version !== undefined ? <span className={styles.versionText}>{messages.updateTo(state.version)}</span> : null}
        {!state.installed && state.version !== undefined ? <span className={styles.versionText}>{state.version}</span> : null}
      </span>
      <span className={styles.installActions}>
        {state.installing ? (
          // Keeps keyboard focus on the card while the Host runs the install.
          <button type="button" className={styles.installButton} aria-disabled="true" aria-busy="true">{messages.installing}</button>
        ) : null}
        {!state.installing && !state.installed ? (
          <button
            type="button"
            className={styles.installButton}
            disabled={installDisabled}
            title={installDisabled ? reason : undefined}
            aria-describedby={installDisabled && reason !== undefined ? reasonId : undefined}
            onClick={install}
          >
            {messages.install}
          </button>
        ) : null}
        {!state.installing && state.installed && state.updateAvailable ? (
          <button
            type="button"
            className={styles.installButton}
            disabled={updateDisabled}
            title={updateDisabled ? reason : undefined}
            aria-describedby={updateDisabled && reason !== undefined ? reasonId : undefined}
            onClick={update}
          >
            {messages.update}
          </button>
        ) : null}
        {state.installed ? <button type="button" className={styles.removeButton} disabled={!state.removeEnabled} onClick={remove}>{messages.remove}</button> : null}
      </span>
      {reason === undefined ? null : <span id={reasonId} className={styles.installReason}>{reason}</span>}
      {installFailed ? <span role="alert" className={styles.installFailed}>{messages.installFailed}</span> : null}
      {removeFailed ? <span role="alert" className={styles.installFailed}>{messages.removeFailed}</span> : null}
    </span>
  );
}

export function MarketplacePage({
  appClient,
  locale = 'zh-CN',
  onManage,
  onAdd,
  onInstall,
  onUpdate,
  onRemove,
  onOpenPlugin,
  installationOf,
  installDisabledReason,
  installingKeys,
  activeSection = 'plugins',
  onSectionChange,
  showSectionNavigation = true,
  canInstall = true,
  searchValue,
  onSearchValueChange,
  hideToolbar = false,
}: MarketplacePageProps) {
  const messages = marketplaceMessagesFor(locale);
  const [ownSearch, setOwnSearch] = useState('');
  // A host that renders the toolbar owns the query; otherwise the page does.
  const search = searchValue ?? ownSearch;
  const changeSearch = onSearchValueChange ?? setOwnSearch;
  const [categoryCode, setCategoryCode] = useState<string | undefined>();
  const [catalog, setCatalog] = useState<MarketplaceCatalog>({
    categories: [],
    featuredPlugins: [],
    popularPlugins: [],
    hasMore: false,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [retryVersion, setRetryVersion] = useState(0);
  const [page, setPage] = useState(1);
  const query = useDebouncedSearch(search);

  // The category strip is one row by default. Categories are catalog data, so
  // a wide catalog overflows the column; the strip then offers a trailing
  // toggle that wraps every category onto further rows instead of running off
  // the edge. Overflow is measured on the collapsed strip only, because the
  // wrapped form always fits by construction.
  const categoriesRef = useRef<HTMLElement | null>(null);
  const [categoriesExpanded, setCategoriesExpanded] = useState(false);
  const [categoriesOverflow, setCategoriesOverflow] = useState(false);

  useEffect(() => {
    if (categoriesExpanded) return undefined;
    const measure = (): void => {
      const node = categoriesRef.current;
      if (node === null) return;
      setCategoriesOverflow(node.scrollWidth > node.clientWidth + 1);
    };
    measure();
    window.addEventListener('resize', measure);
    return () => { window.removeEventListener('resize', measure); };
  }, [categoriesExpanded, catalog.categories]);

  useEffect(() => {
    setPage(1);
    setCatalog({ categories: [], featuredPlugins: [], popularPlugins: [], hasMore: false });
  }, [query, categoryCode]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(false);
    void loadMarketplaceCatalog(appClient, {
      search: query,
      categoryCode,
      signal: controller.signal,
      popularPage: page,
      includeFeatured: page === 1 && categoryCode === undefined && !query,
    })
      .then(result => {
        setCatalog(current => mergeMarketplaceCatalog(current, result, page));
      })
      .catch(() => {
        if (!controller.signal.aborted) setError(true);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => { controller.abort(); };
  }, [appClient, query, categoryCode, retryVersion, page]);

  const { categories, featuredPlugins: featured, popularPlugins: popular, hasMore } = catalog;
  const cardState = (plugin: PluginRecord): { installation?: MarketplaceInstallationState; state: MarketplaceCardState } => {
    const installation = installationOf?.(plugin);
    return {
      installation,
      state: marketplaceCardState(plugin, {
        installation,
        installing: installingKeys?.has(plugin.pluginKey) ?? false,
        canInstall,
        reason: installDisabledReason?.(plugin),
      }),
    };
  };

  return (
    <main className={styles.page}>
      {hideToolbar ? null : (
        <header className={styles.header}>
          {showSectionNavigation && <nav className={styles.mainNav} aria-label={messages.sectionNavigationLabel}>
            <svg className={styles.brandMark} viewBox="0 0 24 24" aria-hidden="true">
              <rect x="2.5" y="3.5" width="19" height="17" rx="4" fill="none" stroke="currentColor" strokeWidth="1.8" />
              <path d="M8.5 4v16" stroke="currentColor" strokeWidth="1.8" />
            </svg>
            <button type="button" className={`${styles.navLink} ${activeSection === 'plugins' ? styles.navLinkActive : ''}`} aria-current={activeSection === 'plugins' ? 'page' : undefined} onClick={() => { onSectionChange?.('plugins'); }}>{messages.navigation.plugins}</button>
            <button type="button" className={`${styles.navLink} ${activeSection === 'skills' ? styles.navLinkActive : ''}`} aria-current={activeSection === 'skills' ? 'page' : undefined} onClick={() => { onSectionChange?.('skills'); }}>{messages.navigation.skills}</button>
            <button type="button" className={`${styles.navLink} ${activeSection === 'partners' ? styles.navLinkActive : ''}`} aria-current={activeSection === 'partners' ? 'page' : undefined} onClick={() => { onSectionChange?.('partners'); }}>{messages.navigation.partners}</button>
          </nav>}
          <div className={styles.toolbar}>
            <label className={styles.search}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.8" stroke="currentColor" strokeWidth="1.8" /><path d="m16 16 5 5" stroke="currentColor" strokeWidth="1.8" /></svg>
              <input className={styles.searchInput} type="search" value={search} onChange={event => { changeSearch(event.target.value); }} placeholder={messages.search} aria-label={messages.search} />
            </label>
            <div className={styles.actions}>
              <button type="button" className={styles.actionButton} onClick={onManage}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 7h16M4 17h16M9 4v6m6 4v6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /><circle cx="9" cy="7" r="2" fill="var(--market-bg)" stroke="currentColor" strokeWidth="1.7" /><circle cx="15" cy="17" r="2" fill="var(--market-bg)" stroke="currentColor" strokeWidth="1.7" /></svg>
                {messages.manage}
              </button>
              <button type="button" className={styles.actionButton} disabled={!canInstall} onClick={onAdd}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
                {messages.add}
              </button>
            </div>
          </div>
        </header>
      )}

      {/* One row by default; a catalog whose categories do not fit offers the
          trailing toggle, which wraps them onto further rows. The toggle sits
          in the row's own scroll area and stays pinned to its trailing edge, so
          the chips run under it rather than off the column. */}
      <nav
        ref={categoriesRef}
        className={`${styles.categories} ${categoriesExpanded ? styles.categoriesExpanded : ''}`}
        aria-label={messages.categoryNavigationLabel}
      >
        <button type="button" className={`${styles.category} ${categoryCode === undefined ? styles.categoryActive : ''}`} onClick={() => { setCategoryCode(undefined); }}>{messages.featured}</button>
        {categories.map(category => (
          <button key={category.categoryCode} type="button" className={`${styles.category} ${categoryCode === category.categoryCode ? styles.categoryActive : ''}`} onClick={() => { setCategoryCode(category.categoryCode); }}>
            {categoryName(category, locale)}
          </button>
        ))}
        {categoriesOverflow || categoriesExpanded ? (
          <button
            type="button"
            className={styles.categoryToggle}
            data-category-toggle=""
            aria-label={categoriesExpanded ? messages.collapseCategories : messages.expandCategories}
            aria-expanded={categoriesExpanded}
            onClick={() => { setCategoriesExpanded(value => !value) }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              {categoriesExpanded
                ? <path d="M5 12h14" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
                : <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />}
            </svg>
          </button>
        ) : null}
      </nav>

      {loading && popular.length === 0 ? (
        <div className={styles.content} aria-busy="true" aria-label={messages.loading}>
          <div className={styles.featured}><div className={styles.skeleton} /><div className={styles.skeleton} /><div className={styles.skeleton} /></div>
          <div className={styles.sectionHeading}>{messages.popular}</div>
          <div className={styles.pluginGrid}>{Array.from({ length: 9 }, (_, index) => <div key={index} className={styles.skeleton} />)}</div>
        </div>
      ) : error && popular.length === 0 ? (
        <div className={styles.status} role="alert">
          <p className={styles.statusTitle}>{messages.loadError}</p>
          <button type="button" className={styles.statusButton} onClick={() => { setRetryVersion(value => value + 1); }}>{messages.retry}</button>
        </div>
      ) : popular.length === 0 ? (
        <div className={styles.status}><p className={styles.statusTitle}>{query || categoryCode ? messages.noMatch : messages.empty}</p></div>
      ) : (
        <div className={styles.content}>
          {featured.length > 0 && categoryCode === undefined && !query && (
            <section className={styles.featured} aria-label={messages.featured}>
              {featured.map(plugin => {
                const { installation, state } = cardState(plugin);
                const title = localizedText(plugin.featuredTitleLocales, locale) || localizedText(plugin.nameLocales, locale) || plugin.name;
                const description = localizedText(plugin.featuredDescriptionLocales, locale) || localizedText(plugin.descriptionLocales, locale) || plugin.description || '';
                // The card leads with its market category when the catalog
                // resolves it, so the shelf does not repeat the section label
                // on every card.
                const category = plugin.categoryCode == null
                  ? undefined
                  : categories.find(entry => entry.categoryCode === plugin.categoryCode);
                const image = plugin.featuredImageUrl || plugin.iconUrl;
                return (
                  <article className={styles.featureCard} key={plugin.pluginKey}>
                    <span className={styles.featureCopy}>
                      <span className={styles.eyebrow}>{category === undefined ? messages.featured : categoryName(category, locale)}</span>
                      {onOpenPlugin === undefined
                        ? <span className={styles.featureTitle}>{title}</span>
                        : <button type="button" className={styles.featureTitleLink} onClick={() => { onOpenPlugin(plugin); }}>{title}</button>}
                      <span className={styles.featureDescription}>{description}</span>
                      <InstallControls plugin={plugin} installation={installation} state={state} messages={messages} onInstall={onInstall} onUpdate={onUpdate} onRemove={onRemove} />
                    </span>
                    {image === null || image === ''
                      ? <span className={styles.featureFallback} aria-hidden="true">{plugin.name.slice(0, 1)}</span>
                      : <img className={styles.featureImage} src={image} alt="" />}
                  </article>
                );
              })}
            </section>
          )}
          <h1 className={styles.sectionHeading}>{messages.popular}</h1>
          <section className={styles.pluginGrid} aria-label={messages.popular}>
            {popular.map(plugin => {
              const { installation, state } = cardState(plugin);
              return (
                <article className={styles.pluginRow} key={plugin.pluginKey}>
                  {plugin.iconUrl ? <img className={styles.pluginIcon} src={plugin.iconUrl} alt="" loading="lazy" /> : <div className={`${styles.pluginIcon} ${styles.pluginFallback}`} aria-hidden="true">{plugin.name.slice(0, 1)}</div>}
                  <div className={styles.pluginCopy}>
                    <div className={styles.pluginName} title={localizedText(plugin.nameLocales, locale) || plugin.name}>{localizedText(plugin.nameLocales, locale) || plugin.name}</div>
                    <div className={styles.pluginDescription} title={localizedText(plugin.descriptionLocales, locale) || plugin.description || ''}>{localizedText(plugin.descriptionLocales, locale) || plugin.description || ''}</div>
                    {plugin.usageCount != null ? <div className={styles.pluginUsage}>{messages.usage(plugin.usageCount)}</div> : null}
                  </div>
                  <InstallControls plugin={plugin} installation={installation} state={state} messages={messages} onInstall={onInstall} onUpdate={onUpdate} onRemove={onRemove} />
                </article>
              );
            })}
          </section>
          {error ? <div className={styles.loadMore} role="alert">{messages.loadError}<button type="button" className={styles.statusButton} onClick={() => { setRetryVersion(value => value + 1); }}>{messages.retry}</button></div> : null}
          {hasMore && !error ? <div className={styles.loadMore}><button type="button" className={styles.statusButton} disabled={loading} onClick={() => { setPage(value => value + 1); }}>{loading ? messages.loadingMore : messages.loadMore}</button></div> : null}
        </div>
      )}
    </main>
  );
}
