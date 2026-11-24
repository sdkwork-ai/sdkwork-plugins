import type { MarketplaceInstallRecord } from './services/marketplaceService.ts';
import { marketplacePluginInstallAvailable, marketplacePluginVersion } from './services/marketplaceService.ts';
import type { MarketplaceInstallationState } from './types.ts';

/**
 * Derived install view for one catalog card. Both card layouts share it so the
 * featured shelf and the popular rows cannot drift apart.
 */
export interface MarketplaceCardState {
  /** The record carries an install target the Host can execute. */
  available: boolean;
  /** The Host reports the plugin as installed. */
  installed: boolean;
  /** The installed version has a newer catalog version. */
  updateAvailable: boolean;
  /** An install or update run is in flight for this record. */
  installing: boolean;
  /** The install control is actionable now. */
  installEnabled: boolean;
  /** The update control is actionable now. */
  updateEnabled: boolean;
  /** The uninstall control is actionable now. */
  removeEnabled: boolean;
  /** Host-supplied reason installation is unavailable for this record. */
  reason?: string;
  /** Installed version, when the Host knows it. */
  installedVersion?: string;
  /** Version the catalog currently offers. */
  version?: string;
}

export interface MarketplaceCardStateInput {
  installation?: MarketplaceInstallationState;
  installing?: boolean;
  /** Host capability gate; a false value disables install and update, never uninstall. */
  canInstall?: boolean;
  reason?: string;
}

export function marketplaceCardState(
  plugin: MarketplaceInstallRecord,
  input: MarketplaceCardStateInput = {},
): MarketplaceCardState {
  const { installation, installing = false, canInstall = true, reason } = input;
  const available = marketplacePluginInstallAvailable(plugin, true);
  const installed = installation !== undefined;
  const updateAvailable = installation?.status === 'update-available';
  // A blocked install only blocks gaining or replacing a version; removing an
  // installed package stays available so a user is never trapped.
  const blocked = installing || reason !== undefined;
  return {
    available,
    installed,
    updateAvailable,
    installing,
    installEnabled: available && canInstall && !installed && !blocked,
    updateEnabled: installed && updateAvailable && canInstall && !blocked,
    removeEnabled: installed && !installing,
    reason,
    installedVersion: installation?.installedVersion,
    version: installation?.version ?? marketplacePluginVersion(plugin),
  };
}
