/**
 * Application upload declaration constants.
 *
 * Authority: `DRIVE_SPEC.md` section 18 (Application Upload Declaration
 * Contract). Declared values live in
 * `apps/sdkwork-plugins-pc/specs/upload.declaration.json`; this module carries
 * them into code so upload call sites reference a constant instead of
 * repeating literals.
 */

export interface PluginUploadDeclarationEntry {
  readonly appResourceIdKind: 'application' | 'entity' | 'draft';
  readonly appResourceType: string;
  readonly purpose: string;
  readonly retention: 'long_term' | 'temporary';
  readonly scene: string;
  readonly source: string;
  readonly uploadProfileCode: string;
}

/** Canonical application identity from `agent.app.config.json`. */
export const PLUGINS_APP_ID = 'sdkwork-plugins' as const;

/** The single call-origin label for every upload from this application. */
export const PLUGINS_UPLOAD_SOURCE = 'sdkwork-plugins-pc' as const;

export const PLUGIN_PACKAGE_ARTIFACT_UPLOAD = {
  appResourceIdKind: 'entity',
  appResourceType: 'plugin.package_artifact',
  purpose:
    'Plugin package archive uploaded by an operator so the plugin can be installed.',
  retention: 'long_term',
  scene: 'plugin-package-upload',
  source: PLUGINS_UPLOAD_SOURCE,
  uploadProfileCode: 'archive',
} as const satisfies PluginUploadDeclarationEntry;

export const PLUGIN_UPLOAD_DECLARATIONS: readonly PluginUploadDeclarationEntry[] = [
  PLUGIN_PACKAGE_ARTIFACT_UPLOAD,
];
