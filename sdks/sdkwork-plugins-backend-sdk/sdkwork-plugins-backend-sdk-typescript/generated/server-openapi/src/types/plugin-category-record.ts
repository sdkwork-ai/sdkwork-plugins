export interface PluginCategoryRecord {
  /** Snowflake entity id serialized as a decimal string (API_SPEC §13.6). */
  id: string;
  uuid: string;
  categoryCode: string;
  name: string;
  description?: string | null;
  sortOrder: number;
  lifecycleStatus: 'draft' | 'active' | 'disabled' | 'archived' | 'deleted';
  version: string;
  createdAt: string;
  updatedAt: string;
  /** Localized display names keyed by BCP-47 locale. */
  nameLocales: Record<string, string>;
  /** Localized descriptions keyed by BCP-47 locale. */
  descriptionLocales: Record<string, string>;
}
