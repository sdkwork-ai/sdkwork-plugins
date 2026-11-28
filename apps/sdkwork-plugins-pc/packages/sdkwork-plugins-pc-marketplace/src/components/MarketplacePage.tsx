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

/**
 * The viewport the catalog scrolls in: the first ancestor that scrolls its own
 * content, or undefined when the catalog scrolls with the document. A host
 * panel, a standalone window and an embedded frame all resolve here, so the
 * sentinel and the back-to-top control never assume who owns the scrollbar.
 */
function scrollParentOf(node: HTMLElement | null): HTMLElement | null {
  for (let parent = node?.parentElement ?? null; parent !== null; parent = parent.parentElement) {
    const { overflowY } = window.getComputedStyle(parent);
    if (overflowY === 'auto' || overflowY === 'scroll') return parent;
  }
  return null;
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

/** The git glyph a card and the detail dialog use for a repository link. */
function GitIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 3v6m0 0a3 3 0 1 0 0 6 3 3 0 0 0 0-6Zm0 6v6m0 0a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
    </svg>
  );
}

/** Everything the detail dialog reads from one catalog record. */
interface PluginDetailDialogProps {
  plugin: PluginRecord;
  locale: MarketplaceLocale;
  messages: MarketplaceMessages;
  categories: readonly PluginCategoryRecord[];
  installation?: MarketplaceInstallationState;
  state: MarketplaceCardState;
  onClose: () => void;
  onInstall?: (plugin: PluginRecord) => void;
  onUpdate?: (plugin: PluginRecord, installation: MarketplaceInstallationState) => void;
  onRemove?: (plugin: PluginRecord, installation: MarketplaceInstallationState) => void;
  onOpenPlugin?: (plugin: PluginRecord) => void;
}

/**
 * One plugin's detail, drawn over the catalog.
 *
 * It shows what the catalog already knows — identity, registry facts, the
 * declared capabilities and the install commands — and reuses the card's install
 * controls, so installing never needs a second implementation. The dialog closes
 * on the scrim, on Escape and on its own close control.
 */
function PluginDetailDialog({
  plugin,
  locale,
  messages,
  categories,
  installation,
  state,
  onClose,
  onInstall,
  onUpdate,
  onRemove,
  onOpenPlugin,
}: PluginDetailDialogProps) {
  const [copied, setCopied] = useState<string | undefined>();
  /** Index of the screenshot being previewed, if the preview is open. */
  const [previewIndex, setPreviewIndex] = useState<number | undefined>();
  const title = localizedText(plugin.nameLocales, locale) || plugin.name;
  const description = localizedText(plugin.descriptionLocales, locale) || plugin.description || '';
  const category = plugin.categoryCode == null
    ? undefined
    : categories.find(entry => entry.categoryCode === plugin.categoryCode);
  const screenshots = plugin.media
    .filter(asset => asset.kind === 'screenshot')
    .slice()
    .sort((left, right) => left.sortOrder - right.sortOrder);
  const screenshot = screenshots[0];
  const commands = plugin.installTargets.map(target => target.spec);
  const previewing = previewIndex === undefined ? undefined : screenshots[previewIndex];

  // Escape closes the preview first and the dialog second; the arrows page
  // through the screenshots while previewing.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        if (previewIndex === undefined) onClose();
        else setPreviewIndex(undefined);
        return;
      }
      if (previewIndex === undefined || screenshots.length < 2) return;
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        setPreviewIndex(current => (current === undefined ? current : (current - 1 + screenshots.length) % screenshots.length));
      }
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        setPreviewIndex(current => (current === undefined ? current : (current + 1) % screenshots.length));
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => { document.removeEventListener('keydown', onKeyDown); };
  }, [onClose, previewIndex, screenshots.length]);

  const copy = (command: string): void => {
    void navigator.clipboard?.writeText(command).then(() => {
      setCopied(command);
      window.setTimeout(() => { setCopied(current => (current === command ? undefined : current)); }, 1600);
    }).catch(() => {});
  };

  return (
    <>
    <div className={styles.dialogScrim} role="presentation" onClick={onClose}>
      <div
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="plugin-detail-title"
        onClick={event => { event.stopPropagation(); }}
      >
        <header className={styles.dialogHeader}>
          <h2 id="plugin-detail-title" className={styles.dialogTitle}>{messages.detailTitle(title)}</h2>
          <button type="button" className={styles.dialogClose} aria-label={messages.close} onClick={onClose} autoFocus>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="m6 6 12 12M18 6 6 18" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
            </svg>
          </button>
        </header>

        <div className={styles.dialogIdentity}>
          {plugin.iconUrl
            ? <img className={styles.dialogIcon} src={plugin.iconUrl} alt="" />
            : <span className={`${styles.dialogIcon} ${styles.pluginFallback}`} aria-hidden="true">{plugin.name.slice(0, 1)}</span>}
          <div className={styles.dialogMeta}>
            <span className={styles.dialogOwner}>{plugin.ownerLogin ?? plugin.provider ?? messages.featured}</span>
            <span>{plugin.versionLabel}</span>
            {Number(plugin.downloadsCount) > 0 ? <span>{messages.downloads(plugin.downloadsCount)}</span> : null}
            {Number(plugin.starsCount) > 0 ? <span>{messages.stars(plugin.starsCount)}</span> : null}
            {plugin.addedOn === null ? null : <span>{messages.addedOn(plugin.addedOn)}</span>}
          </div>
        </div>

        {category === undefined ? null : <span className={styles.dialogCategory}>{categoryName(category, locale)}</span>}
        <p className={styles.dialogDescription}>{description}</p>
        {screenshot === undefined ? null : (
          <button
            type="button"
            className={styles.dialogShotButton}
            aria-label={messages.previewImage}
            title={messages.previewImage}
            onClick={() => { setPreviewIndex(0); }}
          >
            <img className={styles.dialogShot} src={screenshot.url} alt="" loading="lazy" />
          </button>
        )}

        <details className={styles.dialogSection}>
          <summary className={styles.dialogSummary}>
            <span className={styles.dialogSectionIcon} aria-hidden="true">?</span>
            <span className={styles.dialogSectionTitle}>{messages.capabilitiesTitle}</span>
            <span className={styles.dialogSummaryHint}>{messages.capabilitiesSummary(plugin.capabilities.length)}</span>
            <svg className={styles.dialogChevron} width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="m9 6 6 6-6 6" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </summary>
          <ul className={styles.dialogList}>
            {plugin.capabilities.map(capability => <li key={capability}>{capability}</li>)}
            {plugin.capabilityRedLines.map(redLine => <li key={redLine} className={styles.dialogRedLine}>{redLine}</li>)}
          </ul>
          <p className={styles.dialogCaveat}>{messages.capabilitiesCaveat}</p>
        </details>

        <details className={styles.dialogSection}>
          <summary className={styles.dialogSummary}>
            <span className={styles.dialogSectionIcon} aria-hidden="true">&gt;_</span>
            <span className={styles.dialogSectionTitle}>{messages.installCommandTitle}</span>
            <svg className={styles.dialogChevron} width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="m9 6 6 6-6 6" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </summary>
          <ul className={styles.dialogList}>
            {commands.map(command => (
              <li key={command} className={styles.dialogCommand}>
                <code>{command}</code>
                <button type="button" className={styles.dialogCopy} onClick={() => { copy(command); }}>
                  {copied === command ? messages.commandCopied : messages.copyCommand}
                </button>
              </li>
            ))}
          </ul>
        </details>

        <p className={styles.dialogNote}>{messages.communityPluginNote}</p>

        <footer className={styles.dialogActions}>
          {plugin.repositoryUrl === null
            ? null
            : <a
                className={styles.dialogAction}
                href={plugin.repositoryUrl}
                target="_blank"
                rel="noreferrer noopener"
                aria-label={messages.openRepository}
              >
                <GitIcon />
                {messages.repositoryLabel}
              </a>}
          {onOpenPlugin === undefined
            ? null
            : <button type="button" className={styles.dialogAction} onClick={() => { onOpenPlugin(plugin); }}>{messages.openPluginPage}</button>}
          <button type="button" className={styles.dialogAction} onClick={onClose}>{messages.close}</button>
          <InstallControls
            plugin={plugin}
            installation={installation}
            state={state}
            messages={messages}
            onInstall={onInstall}
            onUpdate={onUpdate}
            onRemove={onRemove}
          />
        </footer>
      </div>
    </div>
    {previewing === undefined ? null : (
        <div className={styles.previewScrim} role="presentation" onClick={() => { setPreviewIndex(undefined); }}>
          <div className={styles.previewBar}>
            <span className={styles.previewCounter}>{messages.imageCounter((previewIndex ?? 0) + 1, screenshots.length)}</span>
            <button
              type="button"
              className={styles.previewClose}
              aria-label={messages.close}
              onClick={() => { setPreviewIndex(undefined); }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="m6 6 12 12M18 6 6 18" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
              </svg>
            </button>
          </div>
          {screenshots.length > 1 ? (
            <button
              type="button"
              className={`${styles.previewNav} ${styles.previewPrev}`}
              aria-label={messages.previousImage}
              onClick={(event) => {
                event.stopPropagation();
                setPreviewIndex(index => (index === undefined ? index : (index - 1 + screenshots.length) % screenshots.length));
              }}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="m14 6-6 6 6 6" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          ) : null}
          <img
            className={styles.previewImage}
            src={previewing.url}
            alt={title}
            onClick={(event) => { event.stopPropagation(); }}
          />
          {screenshots.length > 1 ? (
            <button
              type="button"
              className={`${styles.previewNav} ${styles.previewNext}`}
              aria-label={messages.nextImage}
              onClick={(event) => {
                event.stopPropagation();
                setPreviewIndex(index => (index === undefined ? index : (index + 1) % screenshots.length));
              }}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="m10 6 6 6-6 6" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          ) : null}
        </div>
    )}
    </>
  );
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

  // Paging follows the scroll position: the sentinel below the list enters the
  // scrollport and the next page starts loading, so a long catalog is one
  // continuous scroll instead of a button press per page.
  const rootRef = useRef<HTMLElement | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  // Older browsers keep the explicit "load more" button.
  const autoPaging = typeof IntersectionObserver !== 'undefined';
  const [scrolled, setScrolled] = useState(false);
  /** The plugin whose detail dialog is open, if any. */
  const [detailPlugin, setDetailPlugin] = useState<PluginRecord | undefined>();
  // Set when a page arrives empty: the catalog keeps saying `hasMore` but has
  // nothing left, so paging stops rather than looping.
  const [pagingStalled, setPagingStalled] = useState(false);

  // A filter change only restarts the list, and it restarts during render so the
  // fetch below never fires a page number left over from the previous filter —
  // an effect would let that stale page request out and merge another filter's
  // rows into the new list. The category strip is catalog taxonomy, the same
  // categories whatever filter is active, so it stays on screen instead of
  // emptying and repainting on every category press.
  const filterKey = `${query}\u0000${categoryCode ?? ''}`;
  const [renderedFilter, setRenderedFilter] = useState(filterKey);
  if (renderedFilter !== filterKey) {
    setRenderedFilter(filterKey);
    setPage(1);
    setPagingStalled(false);
    setCatalog(current => ({ ...current, hasMore: false }));
  }

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
        if (page > 1 && result.popularPlugins.length === 0) setPagingStalled(true);
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


  // The catalog scrolls inside whatever viewport its host gives it, so both the
  // observer and the back-to-top control resolve that viewport instead of
  // assuming the catalog owns one.
  useEffect(() => {
    const scroller = scrollParentOf(rootRef.current);
    const onScroll = (): void => { setScrolled((scroller?.scrollTop ?? window.scrollY) > 320); };
    onScroll();
    const target: HTMLElement | Window = scroller ?? window;
    target.addEventListener('scroll', onScroll, { passive: true });
    return () => { target.removeEventListener('scroll', onScroll); };
  }, []);

  // One page per sentinel sighting, and only while the catalog reports more:
  // the list ends when the catalog answers without `hasMore`.
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!autoPaging || sentinel === null || !hasMore || loading || error || pagingStalled) return undefined;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some(entry => entry.isIntersecting)) setPage(value => value + 1);
    }, { root: scrollParentOf(rootRef.current), rootMargin: '320px 0px' });
    observer.observe(sentinel);
    return () => { observer.disconnect(); };
  }, [autoPaging, error, hasMore, loading, page, pagingStalled]);

  const backToTop = (): void => {
    const scroller = scrollParentOf(rootRef.current);
    if (scroller === null) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    scroller.scrollTo({ top: 0, behavior: 'smooth' });
  };

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

  // One dialog serves both card layouts: a card press opens the plugin's own
  // detail, which the catalog already holds, so the reader can read what the
  // plugin declares and see its install command before installing.
  const openDetail = (plugin: PluginRecord): void => {
    setDetailPlugin(plugin);
  };

  return (
    <>
    <main className={styles.page} ref={rootRef}>
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
                      <button type="button" className={styles.featureTitleLink} onClick={() => { openDetail(plugin); }}>{title}</button>
                      {plugin.repositoryUrl === null
                        ? null
                        : <a
                            className={styles.repoLink}
                            href={plugin.repositoryUrl}
                            target="_blank"
                            rel="noreferrer noopener"
                            aria-label={messages.openRepository}
                            title={messages.openRepository}
                            onClick={event => { event.stopPropagation(); }}
                          >
                            <GitIcon />
                          </a>}
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
                    <button type="button" className={styles.pluginName} onClick={() => { openDetail(plugin); }}>
                      {localizedText(plugin.nameLocales, locale) || plugin.name}
                    </button>
                    <div className={styles.pluginDescription} title={localizedText(plugin.descriptionLocales, locale) || plugin.description || ''}>{localizedText(plugin.descriptionLocales, locale) || plugin.description || ''}</div>
                    <div className={styles.pluginFooter}>
                      {plugin.usageCount != null ? <span className={styles.pluginUsage}>{messages.usage(plugin.usageCount)}</span> : null}
                      {plugin.repositoryUrl === null
                        ? null
                        : <a
                            className={styles.repoLink}
                            href={plugin.repositoryUrl}
                            target="_blank"
                            rel="noreferrer noopener"
                            aria-label={messages.openRepository}
                            title={messages.openRepository}
                            onClick={event => { event.stopPropagation(); }}
                          >
                            <GitIcon />
                          </a>}
                    </div>
                  </div>
                  <InstallControls plugin={plugin} installation={installation} state={state} messages={messages} onInstall={onInstall} onUpdate={onUpdate} onRemove={onRemove} />
                </article>
              );
            })}
          </section>
          {error ? <div className={styles.loadMore} role="alert">{messages.loadError}<button type="button" className={styles.statusButton} onClick={() => { setRetryVersion(value => value + 1); }}>{messages.retry}</button></div> : null}
          {/* The list loads as it is scrolled: this row is both the sentinel the
              observer watches and the fallback the reader can press, so a page
              without IntersectionObserver still pages by hand. */}
          {hasMore && !error ? (
            <div className={styles.loadMore} ref={sentinelRef} data-catalog-sentinel="">
              {autoPaging
                ? (
                  <>
                    <span className={styles.spinner} aria-hidden="true" />
                    {loading ? messages.loadingMore : messages.loadMoreHint}
                  </>
                )
                : (
                  <button type="button" className={styles.statusButton} disabled={loading} onClick={() => { setPage(value => value + 1); }}>
                    {loading ? messages.loadingMore : messages.loadMore}
                  </button>
                )}
            </div>
          ) : null}
        </div>
      )}
      {scrolled ? (
        <button
          type="button"
          className={styles.backToTop}
          data-back-to-top=""
          aria-label={messages.backToTop}
          title={messages.backToTop}
          onClick={backToTop}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M12 19V5m0 0-6 6m6-6 6 6" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      ) : null}
    </main>
    {detailPlugin === undefined ? null : (
      <PluginDetailDialog
        plugin={detailPlugin}
        locale={locale}
        messages={messages}
        categories={categories}
        installation={cardState(detailPlugin).installation}
        state={cardState(detailPlugin).state}
        onClose={() => { setDetailPlugin(undefined); }}
        {...(onInstall === undefined ? {} : { onInstall })}
        {...(onUpdate === undefined ? {} : { onUpdate })}
        {...(onRemove === undefined ? {} : { onRemove })}
        {...(onOpenPlugin === undefined ? {} : { onOpenPlugin })}
      />
    )}
    </>
  );
}
