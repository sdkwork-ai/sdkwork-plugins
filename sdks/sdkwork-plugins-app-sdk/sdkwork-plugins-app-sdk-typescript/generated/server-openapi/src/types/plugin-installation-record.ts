import type { PluginRecord } from './plugin-record';

export interface PluginInstallationRecord {
  /** Snowflake id serialized as a decimal string. */
  id: string;
  hostId: string;
  pluginKey: string;
  packageName?: string;
  version?: string;
  installSpec?: string;
  status: 'installed' | 'removed';
  catalogRevision?: string;
  snapshot: PluginRecord;
  synchronizedAt: string;
  removedAt?: string;
}
