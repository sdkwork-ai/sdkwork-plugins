import {
  SdkworkBackendClient,
  type CreatePluginCommand,
  type PluginCategoryRecord,
  type PluginRecord,
  type UpdatePluginCommand,
  type UpsertPluginCategoryCommand,
} from '@sdkwork/plugins-backend-sdk';
import type { SdkworkDriveAppClient } from '@sdkwork/drive-app-sdk';

import { resolvePluginsAdminCopy } from './copy/pluginsAdminCopy.ts';

/**
 * List query parameters of the generated backend client. The generated API
 * barrel does not re-export the `*ListParams` interfaces, so the type is
 * derived from the client method signature it parameterizes.
 */
export type PluginsAdminListParams = Parameters<
  SdkworkBackendClient['pluginsAdmin']['listPlugins']
>[0];

/** Generated list envelope: `{ items, pageInfo }` per operation. */
export type PluginsAdminPluginPage = Awaited<
  ReturnType<SdkworkBackendClient['pluginsAdmin']['listPlugins']>
>;

export type PluginsAdminCategoryPage = Awaited<
  ReturnType<SdkworkBackendClient['pluginsAdmin']['listCategories']>
>;

export type {
  CreatePluginCommand,
  PluginCategoryRecord,
  PluginRecord,
  UpdatePluginCommand,
  UpsertPluginCategoryCommand,
};

/**
 * Runtime ports the Plugins admin block needs from its composing host.
 *
 * The admin block never constructs transport itself: the host binds a backend
 * client factory (same-origin base URL, host session token manager) through
 * {@link configurePluginsAdminRuntime} before the first render.
 */
export interface PluginsAdminRuntime {
  getBackendSdkClient: () => SdkworkBackendClient;
  /** Drive client used by the three-mode artifact source editor. */
  getDriveSdkClient: () => SdkworkDriveAppClient;
  /**
   * Optional target space for uploaded plugin archives. When omitted, the
   * upload service uses the first active space visible to the operator.
   */
  getDriveSpaceId?: () => string | undefined;
}

let runtime: PluginsAdminRuntime | null = null;

export function configurePluginsAdminRuntime(next: PluginsAdminRuntime): void {
  runtime = next;
}

export function getPluginsAdminBackendSdkClient(): SdkworkBackendClient {
  if (!runtime) {
    throw new Error(resolvePluginsAdminCopy().errors.runtimeNotConfigured);
  }
  return runtime.getBackendSdkClient();
}

export function getPluginsAdminDriveSdkClient(): SdkworkDriveAppClient {
  if (!runtime) {
    throw new Error(resolvePluginsAdminCopy().errors.runtimeNotConfigured);
  }
  return runtime.getDriveSdkClient();
}

export function getPluginsAdminDriveSpaceId(): string | undefined {
  const value = runtime?.getDriveSpaceId?.();
  return value?.trim() ? value.trim() : undefined;
}

export async function listPluginCategories(
  params?: PluginsAdminListParams,
): Promise<PluginsAdminCategoryPage> {
  return getPluginsAdminBackendSdkClient().pluginsAdmin.listCategories(params);
}

export async function upsertPluginCategory(
  body: UpsertPluginCategoryCommand,
): Promise<PluginCategoryRecord> {
  return getPluginsAdminBackendSdkClient().pluginsAdmin.upsertCategory(body);
}

export async function listPlugins(
  params?: PluginsAdminListParams,
): Promise<PluginsAdminPluginPage> {
  return getPluginsAdminBackendSdkClient().pluginsAdmin.listPlugins(params);
}

export async function createPlugin(body: CreatePluginCommand): Promise<PluginRecord> {
  return getPluginsAdminBackendSdkClient().pluginsAdmin.createPlugin(body);
}

export async function updatePlugin(
  pluginKey: string,
  body: UpdatePluginCommand,
): Promise<PluginRecord> {
  return getPluginsAdminBackendSdkClient().pluginsAdmin.updatePlugin(pluginKey, body);
}

export async function deletePlugin(pluginKey: string): Promise<void> {
  return getPluginsAdminBackendSdkClient().pluginsAdmin.deletePlugin(pluginKey);
}
