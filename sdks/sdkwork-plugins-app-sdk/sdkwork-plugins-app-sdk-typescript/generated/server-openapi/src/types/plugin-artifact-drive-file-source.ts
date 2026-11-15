/** An archive uploaded to sdkwork-drive. checksumSha256 is the SHA-256 of the archive bytes. */
export interface PluginArtifactDriveFileSource {
  kind: 'drive_file';
  driveUri: string;
  checksumSha256: string;
  sizeBytes?: string | null;
}
