import type { SdkworkDriveAppClient } from '@sdkwork/drive-app-sdk';
import { hexEncode, Sha256Hasher } from '@sdkwork/utils';

import {
  getPluginsAdminDriveSpaceId,
} from '../pluginsAdminService.ts';
import { PLUGIN_PACKAGE_ARTIFACT_UPLOAD } from '../sdk/uploadDeclaration.ts';

export interface PluginArtifactUploadResult {
  artifactRef: string;
  checksumSha256: string;
  sizeBytes: string;
}

async function calculateSha256(file: File): Promise<string> {
  const hasher = new Sha256Hasher();
  const reader = file.stream().getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      hasher.update(value);
    }
  } finally {
    reader.releaseLock();
  }
  return hexEncode(hasher.digest());
}

async function resolveSpaceId(driveClient: SdkworkDriveAppClient): Promise<string> {
  const configured = getPluginsAdminDriveSpaceId();
  if (configured) return configured;

  const page = await driveClient.drive.spaces.list(
    { pageSize: 1 },
    { timeout: 30_000 },
  );
  const space = page.items.find((item) => item.lifecycleStatus === 'active');
  if (!space) {
    throw new Error(
      'No sdkwork-drive space is available for the plugin package archive.',
    );
  }
  return space.id;
}

export async function uploadPluginPackageArchive(
  driveClient: SdkworkDriveAppClient,
  file: File,
): Promise<PluginArtifactUploadResult> {
  const spaceId = await resolveSpaceId(driveClient);
  const checksumSha256 = await calculateSha256(file);
  const uploadResult = await driveClient.uploader.upload({
    file,
    appResourceType: PLUGIN_PACKAGE_ARTIFACT_UPLOAD.appResourceType,
    appResourceId: file.name,
    scene: PLUGIN_PACKAGE_ARTIFACT_UPLOAD.scene,
    source: PLUGIN_PACKAGE_ARTIFACT_UPLOAD.source,
    spaceId,
    uploadProfileCode: PLUGIN_PACKAGE_ARTIFACT_UPLOAD.uploadProfileCode,
    originalFileName: file.name,
    contentType: file.type || 'application/octet-stream',
    checksumSha256Hex: `sha256:${checksumSha256}`,
  });

  return {
    artifactRef: `drive://spaces/${uploadResult.uploadItem.spaceId}/nodes/${uploadResult.uploadItem.nodeId}`,
    checksumSha256,
    sizeBytes: String(file.size),
  };
}
