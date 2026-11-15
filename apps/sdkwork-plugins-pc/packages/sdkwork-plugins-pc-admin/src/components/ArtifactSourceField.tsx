import { useRef, useState } from 'react';

import type { SdkworkDriveAppClient } from '@sdkwork/drive-app-sdk';
import { trim } from '@sdkwork/utils';
import type {
  PluginArtifactDriveDirectorySource,
  PluginArtifactDriveFileSource,
  PluginArtifactGitSource,
  PluginArtifactSource,
} from '@sdkwork/plugins-backend-sdk';

import { usePluginsAdminCopy } from '../copy/pluginsAdminCopy';
import { uploadPluginPackageArchive } from '../services/pluginArtifactUploadService';
import {
  DriveFolderPicker,
  type DriveFolderSelection,
} from './DriveFolderPicker';

type SourceKind = PluginArtifactSource['kind'];

interface GitDraft {
  repositoryUrl: string;
  repositoryPath: string;
  gitRef: string;
}

const SECONDARY_BUTTON_CLASS =
  'rounded-md border border-zinc-700 bg-zinc-800/60 px-3 py-1.5 text-sm text-zinc-200 hover:bg-zinc-700/60 disabled:opacity-60';
const FIELD_CLASS =
  'w-full rounded-md border border-zinc-700 bg-zinc-800/60 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-60';

function isValidGitRepositoryUrl(value: string): boolean {
  return /^https:\/\/[A-Za-z0-9][A-Za-z0-9.-]*(?::[0-9]{1,5})?\/[^\s]+$/.test(value);
}

function normalizeRepositoryPath(value: string): string {
  const trimmed = trim(value).replace(/\/+$/, '');
  if (trimmed === '' || trimmed === '.') return trimmed;
  return trimmed.replace(/^\.\/+/, '');
}

function isValidRepositoryPath(value: string): boolean {
  if (value === '.') return true;
  if (value === '' || value.startsWith('/') || value.includes('\\')) return false;
  return value.split('/').every((segment) => segment !== '' && segment !== '.' && segment !== '..');
}

function isValidGitRef(value: string): boolean {
  if (value === '') return true;
  return (
    /^[A-Za-z0-9._/-]+$/.test(value) &&
    value !== '@' &&
    !value.includes('..') &&
    !value.startsWith('/') &&
    !value.endsWith('/') &&
    !value.includes('//')
  );
}

function gitSourceFromDraft(draft: GitDraft): PluginArtifactGitSource | null {
  const repositoryUrl = trim(draft.repositoryUrl);
  const repositoryPath = normalizeRepositoryPath(draft.repositoryPath);
  const gitRef = trim(draft.gitRef);
  if (!isValidGitRepositoryUrl(repositoryUrl)) return null;
  if (!isValidRepositoryPath(repositoryPath)) return null;
  if (!isValidGitRef(gitRef)) return null;
  return {
    kind: 'git',
    repositoryUrl,
    repositoryPath,
    ...(gitRef ? { gitRef } : {}),
  };
}

function initialGitDraft(value: PluginArtifactSource | null): GitDraft {
  if (value?.kind !== 'git') {
    return { repositoryUrl: '', repositoryPath: '', gitRef: '' };
  }
  return {
    repositoryUrl: value.repositoryUrl,
    repositoryPath: value.repositoryPath,
    gitRef: value.gitRef ?? '',
  };
}

export interface ArtifactSourceFieldProps {
  driveClient: SdkworkDriveAppClient;
  /** Committed source. `null` means the operator has not supplied a valid source yet. */
  value: PluginArtifactSource | null;
  onChange: (source: PluginArtifactSource | null) => void;
  disabled?: boolean;
}

/**
 * Three-mode artifact source editor.
 *
 * The create and attach flows accept a Drive archive, an existing Drive
 * directory, or a Git repository URL + in-repository path. The component owns
 * the per-mode drafts and emits only a complete source, so the surrounding form
 * can keep its submit action disabled until the backend contract is satisfied.
 * Remount with a new `key` to reset it after a successful create.
 */
export function ArtifactSourceField({
  driveClient,
  value,
  onChange,
  disabled = false,
}: ArtifactSourceFieldProps) {
  const copy = usePluginsAdminCopy();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<SourceKind>(value?.kind ?? 'drive_file');
  const [fileSource, setFileSource] = useState<PluginArtifactDriveFileSource | null>(
    value?.kind === 'drive_file' ? value : null,
  );
  const [fileName, setFileName] = useState<string | null>(null);
  const [directorySource, setDirectorySource] =
    useState<PluginArtifactDriveDirectorySource | null>(
      value?.kind === 'drive_directory' ? value : null,
    );
  const [directoryPath, setDirectoryPath] = useState<string | null>(
    value?.kind === 'drive_directory' ? value.driveUri : null,
  );
  const [gitDraft, setGitDraft] = useState<GitDraft>(() => initialGitDraft(value));
  const [pickerOpen, setPickerOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function sourceForMode(next: SourceKind): PluginArtifactSource | null {
    if (next === 'drive_file') return fileSource;
    if (next === 'drive_directory') return directorySource;
    return gitSourceFromDraft(gitDraft);
  }

  function changeMode(next: SourceKind) {
    setMode(next);
    setError(null);
    onChange(sourceForMode(next));
  }

  async function uploadArchive() {
    const file = fileInputRef.current?.files?.[0];
    if (!file) {
      setError(copy.artifactSource.driveFile.missingFile);
      return;
    }
    setUploading(true);
    setError(null);
    const previousSource = fileSource;
    onChange(null);
    try {
      const artifact = await uploadPluginPackageArchive(driveClient, file);
      const next: PluginArtifactDriveFileSource = {
        kind: 'drive_file',
        driveUri: artifact.artifactRef,
        checksumSha256: artifact.checksumSha256,
        sizeBytes: artifact.sizeBytes,
      };
      setFileSource(next);
      setFileName(file.name);
      if (mode === 'drive_file') onChange(next);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      if (previousSource) onChange(previousSource);
    } finally {
      setUploading(false);
    }
  }

  function selectDirectory(selection: DriveFolderSelection) {
    const next: PluginArtifactDriveDirectorySource = {
      kind: 'drive_directory',
      driveUri: selection.driveUri,
    };
    setDirectorySource(next);
    setDirectoryPath(selection.path);
    setPickerOpen(false);
    setError(null);
    if (mode === 'drive_directory') onChange(next);
  }

  function updateGitDraft(patch: Partial<GitDraft>) {
    const next = { ...gitDraft, ...patch };
    setGitDraft(next);
    if (mode === 'git') onChange(gitSourceFromDraft(next));
  }

  const repositoryUrl = trim(gitDraft.repositoryUrl);
  const repositoryPath = normalizeRepositoryPath(gitDraft.repositoryPath);
  const gitUrlInvalid =
    repositoryUrl !== '' && !isValidGitRepositoryUrl(repositoryUrl);
  const gitPathInvalid =
    repositoryPath !== '' && !isValidRepositoryPath(repositoryPath);
  const gitRefInvalid =
    trim(gitDraft.gitRef) !== '' && !isValidGitRef(trim(gitDraft.gitRef));
  const busy = disabled || uploading;

  return (
    <>
      <fieldset className="grid gap-3 rounded-lg border border-zinc-700 bg-zinc-800/40 p-3">
        <legend className="px-1 text-xs font-medium uppercase tracking-wide text-zinc-400">
          {copy.artifactSource.legend}
        </legend>
        <p className="text-xs text-zinc-500">{copy.artifactSource.hint}</p>

        <div
          className="flex flex-wrap gap-1 rounded-md border border-zinc-700 bg-zinc-800/40 p-1"
          role="group"
          aria-label={copy.artifactSource.legend}
        >
          {(
            [
              ['drive_file', copy.artifactSource.mode.driveFile],
              ['drive_directory', copy.artifactSource.mode.driveDirectory],
              ['git', copy.artifactSource.mode.git],
            ] as const
          ).map(([kind, label]) => (
            <button
              key={kind}
              type="button"
              className={`rounded px-3 py-1.5 text-sm font-medium ${
                mode === kind
                  ? 'bg-blue-600 text-white'
                  : 'text-zinc-300 hover:bg-zinc-700/60'
              } disabled:opacity-60`}
              onClick={() => changeMode(kind)}
              aria-pressed={mode === kind}
              disabled={busy}
            >
              {label}
            </button>
          ))}
        </div>

        {error ? (
          <p role="alert" className="text-sm text-red-400">
            {error}
          </p>
        ) : null}

        {mode === 'drive_file' ? (
          <div className="grid gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept=".zip,.tar,.gz,.tgz,.skillpkg,application/zip"
              className="block w-full text-sm text-zinc-300 file:mr-3 file:rounded-md file:border-0 file:bg-zinc-700 file:px-3 file:py-1.5 file:text-sm file:text-zinc-200 hover:file:bg-zinc-600"
              disabled={busy}
              aria-label={copy.artifactSource.driveFile.archive}
            />
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                className={SECONDARY_BUTTON_CLASS}
                onClick={uploadArchive}
                disabled={busy}
              >
                {uploading
                  ? copy.artifactSource.driveFile.uploading
                  : copy.artifactSource.driveFile.upload}
              </button>
              {fileName ? (
                <span className="text-xs text-emerald-400">
                  {copy.artifactSource.driveFile.uploaded(fileName)}
                </span>
              ) : null}
            </div>
            <p className="text-xs text-zinc-500">
              {copy.artifactSource.driveFile.chooseHint}
            </p>
            {fileSource ? (
              <p className="break-all font-mono text-xs text-zinc-400">
                {fileSource.driveUri}
              </p>
            ) : null}
          </div>
        ) : null}

        {mode === 'drive_directory' ? (
          <div className="grid gap-2">
            <button
              type="button"
              className="flex w-full items-center justify-between gap-3 rounded-md border border-zinc-700 bg-zinc-800/60 px-3 py-2 text-left text-sm text-zinc-100 hover:border-zinc-600 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-60"
              onClick={() => setPickerOpen(true)}
              disabled={busy}
              aria-haspopup="dialog"
            >
              <span className="min-w-0 truncate">
                {directoryPath ?? copy.artifactSource.driveDirectory.placeholder}
              </span>
              <span aria-hidden="true" className="shrink-0 text-zinc-500">
                �?              </span>
            </button>
            {directorySource ? (
              <>
                <p className="text-xs text-emerald-400">
                  {copy.artifactSource.driveDirectory.selected(directoryPath ?? '')}
                </p>
                <p className="break-all font-mono text-xs text-zinc-400">
                  {directorySource.driveUri}
                </p>
              </>
            ) : null}
          </div>
        ) : null}

        {mode === 'git' ? (
          <div className="grid gap-3">
            <label className="grid gap-1.5 text-sm">
              <span className="text-xs font-medium text-zinc-400">
                {copy.artifactSource.git.repositoryUrl}
              </span>
              <input
                className={FIELD_CLASS}
                value={gitDraft.repositoryUrl}
                onChange={(event) => updateGitDraft({ repositoryUrl: event.target.value })}
                placeholder={copy.artifactSource.git.repositoryUrlPlaceholder}
                required
                disabled={busy}
                aria-invalid={gitUrlInvalid}
              />
              {gitUrlInvalid ? (
                <span className="text-xs text-amber-400">
                  {copy.artifactSource.git.invalidUrl}
                </span>
              ) : null}
            </label>
            <label className="grid gap-1.5 text-sm">
              <span className="text-xs font-medium text-zinc-400">
                {copy.artifactSource.git.repositoryPath}
              </span>
              <input
                className={FIELD_CLASS}
                value={gitDraft.repositoryPath}
                onChange={(event) => updateGitDraft({ repositoryPath: event.target.value })}
                placeholder={copy.artifactSource.git.repositoryPathPlaceholder}
                required
                disabled={busy}
                aria-invalid={gitPathInvalid}
              />
              {gitPathInvalid ? (
                <span className="text-xs text-amber-400">
                  {copy.artifactSource.git.invalidPath}
                </span>
              ) : null}
            </label>
            <label className="grid gap-1.5 text-sm">
              <span className="text-xs font-medium text-zinc-400">
                {copy.artifactSource.git.gitRef}
              </span>
              <input
                className={FIELD_CLASS}
                value={gitDraft.gitRef}
                onChange={(event) => updateGitDraft({ gitRef: event.target.value })}
                placeholder={copy.artifactSource.git.gitRefPlaceholder}
                disabled={busy}
                aria-invalid={gitRefInvalid}
              />
              {gitRefInvalid ? (
                <span className="text-xs text-amber-400">
                  {copy.artifactSource.git.invalidRef}
                </span>
              ) : null}
            </label>
            <p className="text-xs text-zinc-500">{copy.artifactSource.git.hint}</p>
          </div>
        ) : null}
      </fieldset>

      <DriveFolderPicker
        open={pickerOpen}
        driveClient={driveClient}
        onCancel={() => setPickerOpen(false)}
        onSelect={selectDirectory}
      />
    </>
  );
}
