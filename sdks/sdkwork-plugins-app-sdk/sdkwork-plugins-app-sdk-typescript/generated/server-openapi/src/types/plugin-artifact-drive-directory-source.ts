/** An existing sdkwork-drive folder. The runtime materializes the folder contents as the plugin package. */
export interface PluginArtifactDriveDirectorySource {
  kind: 'drive_directory';
  driveUri: string;
}
