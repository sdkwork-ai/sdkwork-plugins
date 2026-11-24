import { marketplaceMessages as en } from './en-US/intelligence/plugins-marketplace/page';
import { marketplaceMessages as zh } from './zh-CN/intelligence/plugins-marketplace/page';
import type { MarketplaceMessages } from '../types.ts';

export type MarketplaceLocale = 'en-US' | 'zh-CN';

export function marketplaceMessagesFor(locale: MarketplaceLocale): MarketplaceMessages {
  return locale === 'zh-CN' ? zh : en;
}
