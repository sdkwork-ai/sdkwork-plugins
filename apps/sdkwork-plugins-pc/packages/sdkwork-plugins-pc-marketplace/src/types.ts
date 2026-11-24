export interface MarketplaceMessages {
  navigation: { plugins: string; skills: string; partners: string };
  search: string;
  manage: string;
  add: string;
  featured: string;
  popular: string;
  connect: string;
  sourceUnavailable: string;
  loading: string;
  loadingMore: string;
  loadMore: string;
  retry: string;
  empty: string;
  noMatch: string;
  loadError: string;
  usage: (count: string) => string;
  manageTitle: string;
  manageDescription: string;
  addTitle: string;
  addDescription: string;
}
