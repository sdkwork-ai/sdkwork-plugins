import { useEffect, useState } from 'react';
import type { PluginCategoryRecord, PluginRecord } from '@sdkwork/plugins-app-sdk';
import type { MarketplaceAppClient, MarketplaceCatalog } from '../services/marketplaceService.ts';
import { loadMarketplaceCatalog, marketplacePluginInstallAvailable, mergeMarketplaceCatalog } from '../services/marketplaceService.ts';
import { marketplaceMessagesFor, type MarketplaceLocale } from '../i18n/index.ts';
import styles from './MarketplacePage.module.css';

type MarketplaceCategory = PluginCategoryRecord;

export interface MarketplacePageProps {
  appClient: MarketplaceAppClient;
  locale?: MarketplaceLocale;
  onManage?: () => void;
  onAdd?: () => void;
  onConnect?: (plugin: PluginRecord) => void;
  onOpenPlugin?: (plugin: PluginRecord) => void;
  activeSection?: 'plugins' | 'skills' | 'partners';
  onSectionChange?: (section: 'plugins' | 'skills' | 'partners') => void;
  canInstall?: boolean;
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

export function MarketplacePage({
  appClient,
  locale = 'zh-CN',
  onManage,
  onAdd,
  onConnect,
  onOpenPlugin,
  activeSection = 'plugins',
  onSectionChange,
  canInstall = true,
}: MarketplacePageProps) {
  const messages = marketplaceMessagesFor(locale);
  const [search, setSearch] = useState('');
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

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <nav className={styles.mainNav} aria-label="Plugin sections">
          <svg className={styles.brandMark} viewBox="0 0 24 24" aria-hidden="true">
            <rect x="2.5" y="3.5" width="19" height="17" rx="4" fill="none" stroke="currentColor" strokeWidth="1.8" />
            <path d="M8.5 4v16" stroke="currentColor" strokeWidth="1.8" />
          </svg>
          <button type="button" className={`${styles.navLink} ${activeSection === 'plugins' ? styles.navLinkActive : ''}`} aria-current={activeSection === 'plugins' ? 'page' : undefined} onClick={() => { onSectionChange?.('plugins'); }}>{messages.navigation.plugins}</button>
          <button type="button" className={`${styles.navLink} ${activeSection === 'skills' ? styles.navLinkActive : ''}`} aria-current={activeSection === 'skills' ? 'page' : undefined} onClick={() => { onSectionChange?.('skills'); }}>{messages.navigation.skills}</button>
          <button type="button" className={`${styles.navLink} ${activeSection === 'partners' ? styles.navLinkActive : ''}`} aria-current={activeSection === 'partners' ? 'page' : undefined} onClick={() => { onSectionChange?.('partners'); }}>{messages.navigation.partners}</button>
        </nav>
        <div className={styles.toolbar}>
          <label className={styles.search}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.8" stroke="currentColor" strokeWidth="1.8" /><path d="m16 16 5 5" stroke="currentColor" strokeWidth="1.8" /></svg>
            <input className={styles.searchInput} type="search" value={search} onChange={event => { setSearch(event.target.value); }} placeholder={messages.search} aria-label={messages.search} />
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

      <nav className={styles.categories} aria-label="Plugin categories">
        <button type="button" className={`${styles.category} ${categoryCode === undefined ? styles.categoryActive : ''}`} onClick={() => { setCategoryCode(undefined); }}>{messages.featured}</button>
        {categories.map(category => (
          <button key={category.categoryCode} type="button" className={`${styles.category} ${categoryCode === category.categoryCode ? styles.categoryActive : ''}`} onClick={() => { setCategoryCode(category.categoryCode); }}>
            {categoryName(category, locale)}
          </button>
        ))}
      </nav>

      {loading && popular.length === 0 ? (
        <div className={styles.content} aria-busy="true" aria-label={messages.loading}>
          <div className={styles.featured}><div className={styles.skeleton} /><div className={styles.skeleton} /></div>
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
              {featured.map(plugin => (
                <button key={plugin.pluginKey} type="button" className={styles.featureCard} disabled={!marketplacePluginInstallAvailable(plugin, canInstall)} title={!plugin.source ? messages.sourceUnavailable : undefined} onClick={() => { onOpenPlugin?.(plugin); }}>
                  <span className={styles.featureCopy}>
                    <span className={styles.eyebrow}>{messages.featured}</span>
                  <span className={styles.featureTitle}>{localizedText(plugin.featuredTitleLocales, locale) || localizedText(plugin.nameLocales, locale) || plugin.name}</span>
                    <span className={styles.featureDescription}>{localizedText(plugin.featuredDescriptionLocales, locale) || localizedText(plugin.descriptionLocales, locale) || plugin.description || ''}</span>
                  </span>
                  {plugin.featuredImageUrl || plugin.iconUrl ? <img className={styles.featureImage} src={plugin.featuredImageUrl || plugin.iconUrl || ''} alt="" /> : null}
                </button>
              ))}
            </section>
          )}
          <h1 className={styles.sectionHeading}>{messages.popular}</h1>
          <section className={styles.pluginGrid} aria-label={messages.popular}>
            {popular.map(plugin => (
              <article className={styles.pluginRow} key={plugin.pluginKey}>
                {plugin.iconUrl ? <img className={styles.pluginIcon} src={plugin.iconUrl} alt="" loading="lazy" /> : <div className={`${styles.pluginIcon} ${styles.pluginFallback}`} aria-hidden="true">{plugin.name.slice(0, 1)}</div>}
                <div className={styles.pluginCopy}>
                  <div className={styles.pluginName} title={localizedText(plugin.nameLocales, locale) || plugin.name}>{localizedText(plugin.nameLocales, locale) || plugin.name}</div>
                  <div className={styles.pluginDescription} title={localizedText(plugin.descriptionLocales, locale) || plugin.description || ''}>{localizedText(plugin.descriptionLocales, locale) || plugin.description || ''}</div>
                  {!plugin.source ? <div className={styles.pluginUsage}>{messages.sourceUnavailable}</div> : null}
                  {plugin.usageCount != null ? <div className={styles.pluginUsage}>{messages.usage(plugin.usageCount)}</div> : null}
                </div>
                <button type="button" className={styles.connectButton} disabled={!marketplacePluginInstallAvailable(plugin, canInstall)} title={!plugin.source ? messages.sourceUnavailable : undefined} onClick={() => { onConnect?.(plugin); }}>
                  {messages.connect}
                </button>
              </article>
            ))}
          </section>
          {error ? <div className={styles.loadMore} role="alert">{messages.loadError}<button type="button" className={styles.statusButton} onClick={() => { setRetryVersion(value => value + 1); }}>{messages.retry}</button></div> : null}
          {hasMore && !error ? <div className={styles.loadMore}><button type="button" className={styles.statusButton} disabled={loading} onClick={() => { setPage(value => value + 1); }}>{loading ? messages.loadingMore : messages.loadMore}</button></div> : null}
        </div>
      )}
    </main>
  );
}
