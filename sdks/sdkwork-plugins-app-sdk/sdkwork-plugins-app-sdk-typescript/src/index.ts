import {
  createClient as createGeneratedPluginsAppClient,
  SdkworkAppClient,
} from '../generated/server-openapi/src/index';
import type { SdkworkAppConfig } from '../generated/server-openapi/src/types/common';

export { SdkworkAppClient, createGeneratedPluginsAppClient };
export type { SdkworkAppConfig };
export * from '../generated/server-openapi/src/types';
export * from '../generated/server-openapi/src/api';
export * from '../generated/server-openapi/src/http';
export * from '../generated/server-openapi/src/auth';

export type SdkworkPluginsAppClient = SdkworkAppClient;

export function createPluginsAppClient(config: SdkworkAppConfig): SdkworkPluginsAppClient {
  return createGeneratedPluginsAppClient(config);
}

export function createClient(config: SdkworkAppConfig): SdkworkPluginsAppClient {
  return createPluginsAppClient(config);
}
