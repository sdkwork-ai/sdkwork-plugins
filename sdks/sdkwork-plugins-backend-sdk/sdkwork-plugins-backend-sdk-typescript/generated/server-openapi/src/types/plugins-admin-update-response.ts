import type { PluginRecord } from './plugin-record';

export interface PluginsAdminUpdateResponse {
  code: 0;
  data: unknown & { item: PluginRecord; };
  /** Server-owned request correlation id. */
  traceId: string;
}
