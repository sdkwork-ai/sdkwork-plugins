import type { PageInfo } from './page-info';
import type { PluginCategoryRecord } from './plugin-category-record';

export interface PluginsAdminListCategoriesResponse {
  code: 0;
  data: unknown & { items: PluginCategoryRecord[]; pageInfo: PageInfo; };
  /** Server-owned request correlation id. */
  traceId: string;
}
