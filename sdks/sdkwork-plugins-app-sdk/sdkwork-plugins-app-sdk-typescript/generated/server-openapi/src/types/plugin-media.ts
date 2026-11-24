/** One media asset attached to a catalog plugin. */
export interface PluginMedia {
  kind: 'icon' | 'screenshot' | 'featured' | 'cover';
  url: string;
  /** Display order inside the media kind. */
  sortOrder: number;
}
