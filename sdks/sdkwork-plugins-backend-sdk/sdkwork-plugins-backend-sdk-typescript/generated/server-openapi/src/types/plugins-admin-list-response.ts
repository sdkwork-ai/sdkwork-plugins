import type { PageInfo } from './page-info';
import type { PluginRecord } from './plugin-record';

export interface PluginsAdminListResponse {
  code: 0;
  data: unknown & { items: PluginRecord[]; pageInfo: PageInfo; };
  /** Server-owned request correlation id. */
  traceId: string;
}
