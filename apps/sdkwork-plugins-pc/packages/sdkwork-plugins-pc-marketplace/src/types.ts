export interface MarketplaceMessages {
  sectionNavigationLabel: string;
  categoryNavigationLabel: string;
  navigation: { plugins: string; skills: string; partners: string };
  search: string;
  manage: string;
  add: string;
  featured: string;
  popular: string;
  install: string;
  installing: string;
  installed: string;
  update: string;
  remove: string;
  installedVersion: (version: string) => string;
  updateTo: (version: string) => string;
  installDisabled: string;
  installFailed: string;
  removeFailed: string;
  sourceUnavailable: string;
  loading: string;
  loadingMore: string;
  loadMore: string;
  retry: string;
  empty: string;
  noMatch: string;
  loadError: string;
  usage: (count: string) => string;
  manageTitle: string;
  manageDescription: string;
  addTitle: string;
  addDescription: string;
  /** Opens the wrapped category strip when the categories do not fit one row. */
  expandCategories: string;
  /** Collapses the wrapped category strip back to one row. */
  collapseCategories: string;
  /** Status line under the list while the next page loads as the reader scrolls. */
  loadMoreHint: string;
  /** Accessible name of the control that scrolls the catalog back to its top. */
  backToTop: string;
  /** Close action of the plugin detail dialog. */
  close: string;
  /** Dialog heading for one plugin's detail. */
  detailTitle: (name: string) => string;
  /** Collapsible section listing what a plugin declares it does. */
  capabilitiesTitle: string;
  /** How many capabilities a plugin declares. */
  capabilitiesSummary: (declared: number) => string;
  /** Caveat under the capability list: a static scan proves presence, not absence. */
  capabilitiesCaveat: string;
  /** Collapsible section showing the install commands of a plugin. */
  installCommandTitle: string;
  /** Note under the actions: community plugins keep build scripts off by default. */
  communityPluginNote: string;
  /** Action that opens the plugin's git repository in a new browser tab. */
  openRepository: string;
  /** Copy action for one install command. */
  copyCommand: string;
  /** Confirmation after copying an install command. */
  commandCopied: string;
  /** Secondary action in the dialog for a host that owns the plugin's own page. */
  openPluginPage: string;
  /** Release date label in the dialog header. */
  addedOn: (date: string) => string;
  /** Star count label in the dialog header. */
  stars: (count: string) => string;
  /** Download count label in the dialog header. */
  downloads: (count: string) => string;
}

/** Install target kinds the local Host can execute. */
export type MarketplaceInstallTargetKind = 'registry' | 'archive' | 'git' | 'path' | 'drive';

/**
 * One server-authoritative install target for a catalog record.
 * `spec` is the install spec the Host hands to its plugin manager.
 */
export interface MarketplaceInstallTarget {
  kind: MarketplaceInstallTargetKind;
  spec: string;
  /** Package name the Host needs to update or remove the installed plugin. */
  packageName?: string | null;
  /** Version the target pins, when it pins one. */
  packageVersion?: string | null;
  /** Whether the catalog ranks this target first among the record's targets. */
  isDefault?: boolean;
}

/** Installed state for one catalog record, read from the local Host. */
export interface MarketplaceInstallationState {
  status: 'installed' | 'update-available';
  /** Installed version, when known. */
  installedVersion?: string;
  /** Version the catalog currently offers. */
  version?: string;
  /** Installed package name, needed by the host to update or remove it. */
  packageName?: string;
}
