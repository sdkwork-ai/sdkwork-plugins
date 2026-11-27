import type { PluginInstallationRecord } from './plugin-installation-record';

export interface PluginsSyncInstallationResponse {
  code: 0;
  data: unknown & { item: PluginInstallationRecord; };
  /** Server-owned request correlation id. */
  traceId: string;
}
