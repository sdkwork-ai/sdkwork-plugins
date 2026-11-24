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
