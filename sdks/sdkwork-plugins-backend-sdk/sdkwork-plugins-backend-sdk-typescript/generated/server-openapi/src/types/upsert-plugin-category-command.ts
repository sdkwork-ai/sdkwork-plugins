export interface UpsertPluginCategoryCommand {
  categoryCode: string;
  name: string;
  description?: string;
  sortOrder?: number;
}
