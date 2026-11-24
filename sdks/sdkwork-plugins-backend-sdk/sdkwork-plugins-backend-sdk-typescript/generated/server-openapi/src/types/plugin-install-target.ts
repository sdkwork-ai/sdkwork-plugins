/** One stored install target of a catalog plugin. `kind` selects the installer namespace and `spec` is the complete specification for it. */
export interface PluginInstallTarget {
  kind: 'registry' | 'archive' | 'git' | 'path' | 'drive';
  /** Complete installer specification for `kind`, for example `@scope/pkg@1.2.3` or `git+https://...git#main&path:/plugins/demo`. */
  spec: string;
  packageName: string | null;
  packageVersion: string | null;
  isDefault: boolean;
}
