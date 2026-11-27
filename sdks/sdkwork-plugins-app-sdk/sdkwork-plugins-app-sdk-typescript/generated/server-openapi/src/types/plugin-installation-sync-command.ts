export interface PluginInstallationSyncCommand {
  pluginKey: string;
  action: 'installed' | 'updated' | 'removed';
  packageName?: string;
  version?: string;
  installSpec?: string;
}
