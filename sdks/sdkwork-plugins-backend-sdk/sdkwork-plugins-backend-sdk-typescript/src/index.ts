import {
  createClient as createGeneratedPluginsBackendClient,
  SdkworkBackendClient,
} from '../generated/server-openapi/src/index';
import type { SdkworkBackendConfig } from '../generated/server-openapi/src/types/common';

export { SdkworkBackendClient, createGeneratedPluginsBackendClient };
export type { SdkworkBackendConfig };
export * from '../generated/server-openapi/src/types';
export * from '../generated/server-openapi/src/api';
export * from '../generated/server-openapi/src/http';
export * from '../generated/server-openapi/src/auth';

export type SdkworkPluginsBackendClient = SdkworkBackendClient;

export function createPluginsBackendClient(config: SdkworkBackendConfig): SdkworkPluginsBackendClient {
  return createGeneratedPluginsBackendClient(config);
}

export function createClient(config: SdkworkBackendConfig): SdkworkPluginsBackendClient {
  return createPluginsBackendClient(config);
}
