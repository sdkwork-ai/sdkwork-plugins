/** A path inside an https Git repository. Consumers clone the repository at the pinned revision. */
export interface PluginArtifactGitSource {
  kind: 'git';
  repositoryUrl: string;
  repositoryPath: string;
  gitRef?: string | null;
}
