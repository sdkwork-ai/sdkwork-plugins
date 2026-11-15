import type { PluginArtifactDriveDirectorySource } from './plugin-artifact-drive-directory-source';
import type { PluginArtifactDriveFileSource } from './plugin-artifact-drive-file-source';
import type { PluginArtifactGitSource } from './plugin-artifact-git-source';

/** Plugin artifact content source: a Drive archive, an existing Drive directory, or a Git repository path. */
export type PluginArtifactSource = PluginArtifactDriveFileSource | PluginArtifactDriveDirectorySource | PluginArtifactGitSource;
