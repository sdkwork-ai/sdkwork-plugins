import type { PluginCategoryRecord } from './plugin-category-record';

export interface PluginsAdminUpsertCategoryResponse {
  code: 0;
  data: unknown & { item: PluginCategoryRecord; };
  /** Server-owned request correlation id. */
  traceId: string;
}
