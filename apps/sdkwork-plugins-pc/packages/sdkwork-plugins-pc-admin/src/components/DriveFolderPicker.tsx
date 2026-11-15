import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';

import type { DriveNode, DriveSpace, SdkworkDriveAppClient } from '@sdkwork/drive-app-sdk';

import { usePluginsAdminCopy } from '../copy/pluginsAdminCopy';
import { useFocusTrap } from './useFocusTrap';

export interface DriveFolderSelection {
  spaceId: string;
  nodeId: string;
  name: string;
  path: string;
  driveUri: string;
}

interface Breadcrumb {
  nodeId: string | null;
  name: string;
}

export interface DriveFolderPickerProps {
  open: boolean;
  driveClient: SdkworkDriveAppClient;
  onCancel: () => void;
  onSelect: (selection: DriveFolderSelection) => void;
}

const SECONDARY_BUTTON_CLASS =
  'rounded-md border border-zinc-700 bg-zinc-800/60 px-3 py-1.5 text-sm text-zinc-200 hover:bg-zinc-700/60 disabled:opacity-60';
const PRIMARY_BUTTON_CLASS =
  'rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-60';

function formatDriveUri(spaceId: string, nodeId: string): string {
  return `drive://spaces/${spaceId}/nodes/${nodeId}`;
}

/**
 * Hierarchical picker for a sdkwork-drive folder.
 *
 * The artifact contract accepts a folder node URI, so the picker starts at the
 * selected space root and lets the operator walk into a folder before choosing
 * it. Loading, empty, error, and no-space states stay inside the dialog so a
 * failed Drive read never silently selects an unrelated directory.
 */
export function DriveFolderPicker({
  open,
  driveClient,
  onCancel,
  onSelect,
}: DriveFolderPickerProps) {
  const copy = usePluginsAdminCopy();
  const titleId = useId();
  const descriptionId = useId();
  const { containerRef, onKeyDown } = useFocusTrap<HTMLDivElement>(open, '[data-autofocus]');
  const requestSeq = useRef(0);
  const [spaces, setSpaces] = useState<DriveSpace[]>([]);
  const [spaceId, setSpaceId] = useState('');
  const [breadcrumbs, setBreadcrumbs] = useState<Breadcrumb[]>([]);
  const [folders, setFolders] = useState<DriveNode[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    void loadSpaces();
    // `loadSpaces` is intentionally scoped to the dialog open transition.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, driveClient]);

  async function loadSpaces() {
    const seq = ++requestSeq.current;
    setLoading(true);
    setError(null);
    try {
      const page = await driveClient.drive.spaces.list(
        { pageSize: 100 },
        { timeout: 30_000 },
      );
      if (seq !== requestSeq.current) return;
      const activeSpaces = page.items.filter((space) => space.lifecycleStatus === 'active');
      setSpaces(activeSpaces);
      const first = activeSpaces[0];
      if (!first) {
        setSpaceId('');
        setBreadcrumbs([]);
        setFolders([]);
        return;
      }
      const root: Breadcrumb = { nodeId: null, name: first.displayName };
      setSpaceId(first.id);
      setBreadcrumbs([root]);
      await loadFolders(first.id, null, [root], seq);
    } catch (cause) {
      if (seq !== requestSeq.current) return;
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      if (seq === requestSeq.current) setLoading(false);
    }
  }

  async function loadFolders(
    nextSpaceId: string,
    parentNodeId: string | null,
    nextBreadcrumbs: Breadcrumb[],
    seq = ++requestSeq.current,
  ) {
    setLoading(true);
    setError(null);
    try {
      const page = await driveClient.drive.nodes.list(
        nextSpaceId,
        {
          ...(parentNodeId ? { parentNodeId } : {}),
          pageSize: '200',
          sortBy: 'name',
          sortOrder: 'asc',
        },
        { timeout: 30_000 },
      );
      if (seq !== requestSeq.current) return;
      setSpaceId(nextSpaceId);
      setBreadcrumbs(nextBreadcrumbs);
      setFolders(page.items.filter((node) => node.nodeType === 'folder'));
    } catch (cause) {
      if (seq !== requestSeq.current) return;
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      if (seq === requestSeq.current) setLoading(false);
    }
  }

  function enterSpace(nextSpaceId: string) {
    const space = spaces.find((item) => item.id === nextSpaceId);
    if (!space) return;
    const root: Breadcrumb = { nodeId: null, name: space.displayName };
    setSpaceId(nextSpaceId);
    setBreadcrumbs([root]);
    setFolders([]);
    void loadFolders(nextSpaceId, null, [root]);
  }

  function enterFolder(folder: DriveNode) {
    if (!spaceId) return;
    const nextBreadcrumbs = [...breadcrumbs, { nodeId: folder.id, name: folder.nodeName }];
    void loadFolders(spaceId, folder.id, nextBreadcrumbs);
  }

  function navigateTo(index: number) {
    if (!spaceId) return;
    const nextBreadcrumbs = breadcrumbs.slice(0, index + 1);
    const target = nextBreadcrumbs[index];
    if (!target) return;
    void loadFolders(spaceId, target.nodeId, nextBreadcrumbs);
  }

  function handlePanelKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      onCancel();
      return;
    }
    if (event.key === 'Enter' && event.target instanceof HTMLElement) {
      const tag = event.target.tagName;
      if (tag === 'INPUT' || tag === 'SELECT') {
        event.preventDefault();
        return;
      }
    }
    onKeyDown(event);
  }

  if (!open) return null;

  const current = breadcrumbs[breadcrumbs.length - 1] ?? null;
  const canSelect = Boolean(spaceId && current?.nodeId);
  const currentPath = breadcrumbs.map((crumb) => crumb.name).join(' / ');

  function selectCurrent() {
    if (!spaceId || !current?.nodeId) return;
    onSelect({
      spaceId,
      nodeId: current.nodeId,
      name: current.name,
      path: currentPath,
      driveUri: formatDriveUri(spaceId, current.nodeId),
    });
  }

  return (
    <div
      className="sdkwork-drive-folder-picker-root fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4 backdrop-blur-[2px]"
      role="presentation"
    >
      <button
        type="button"
        tabIndex={-1}
        className="sdkwork-drive-folder-picker-backdrop absolute inset-0 cursor-default"
        aria-label={copy.overlay.close}
        onClick={onCancel}
      />
      <div
        ref={containerRef}
        className="sdkwork-drive-folder-picker-panel relative flex max-h-[80vh] w-full max-w-xl flex-col overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900 shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        onKeyDown={handlePanelKeyDown}
      >
        <header className="flex items-start justify-between gap-4 border-b border-zinc-800 px-5 py-4">
          <div className="min-w-0">
            <h3 id={titleId} className="text-base font-semibold text-zinc-100">
              {copy.artifactSource.driveDirectory.pickerTitle}
            </h3>
            <p id={descriptionId} className="mt-1 text-sm text-zinc-400">
              {copy.artifactSource.driveDirectory.pickerDescription}
            </p>
          </div>
          <button
            type="button"
            className="rounded p-1 text-lg leading-none text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
            onClick={onCancel}
            aria-label={copy.overlay.close}
          >
            ×
          </button>
        </header>

        <div className="grid gap-3 border-b border-zinc-800 px-5 py-3">
          {spaces.length > 1 ? (
            <label className="grid gap-1.5 text-sm">
              <span className="text-xs font-medium text-zinc-400">
                {copy.artifactSource.driveDirectory.space}
              </span>
              <select
                className="w-full rounded-md border border-zinc-700 bg-zinc-800/60 px-3 py-2 text-sm text-zinc-100 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                value={spaceId}
                onChange={(event) => enterSpace(event.target.value)}
                data-autofocus
              >
                {spaces.map((space) => (
                  <option key={space.id} value={space.id}>
                    {space.displayName}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <nav
            className="flex flex-wrap items-center gap-1 text-sm text-zinc-400"
            aria-label={copy.artifactSource.driveDirectory.pickerTitle}
          >
            {breadcrumbs.map((crumb, index) => (
              <span key={`${crumb.nodeId ?? 'root'}-${index}`} className="flex items-center gap-1">
                {index > 0 ? <span aria-hidden="true">/</span> : null}
                <button
                  type="button"
                  className="rounded px-1.5 py-0.5 text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100 disabled:opacity-60"
                  onClick={() => navigateTo(index)}
                  disabled={loading || index === breadcrumbs.length - 1}
                >
                  {crumb.name}
                </button>
              </span>
            ))}
          </nav>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-3">
          {loading ? (
            <p className="px-2 py-6 text-center text-sm text-zinc-500">
              {copy.artifactSource.driveDirectory.loading}
            </p>
          ) : error ? (
            <p role="alert" className="px-2 py-6 text-center text-sm text-red-400">
              {error}
            </p>
          ) : spaces.length === 0 ? (
            <p className="px-2 py-6 text-center text-sm text-zinc-500">
              {copy.artifactSource.driveDirectory.noSpaces}
            </p>
          ) : folders.length === 0 ? (
            <p className="px-2 py-6 text-center text-sm text-zinc-500">
              {copy.artifactSource.driveDirectory.empty}
            </p>
          ) : (
            <div className="grid gap-1">
              {folders.map((folder) => (
                <button
                  key={folder.id}
                  type="button"
                  className="flex items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm text-zinc-200 hover:bg-zinc-800/60"
                  onClick={() => enterFolder(folder)}
                >
                  <span aria-hidden="true" className="text-amber-400">
                    ▸
                  </span>
                  <span className="min-w-0 truncate">{folder.nodeName}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-zinc-800 px-5 py-3">
          <div className="min-w-0 text-sm text-zinc-400">
            <span className="block truncate">
              {currentPath || copy.artifactSource.driveDirectory.placeholder}
            </span>
            {!canSelect ? (
              <span className="mt-0.5 block text-xs text-zinc-500">
                {copy.artifactSource.driveDirectory.selectRootHint}
              </span>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            <button type="button" className={SECONDARY_BUTTON_CLASS} onClick={onCancel}>
              {copy.artifactSource.driveDirectory.cancel}
            </button>
            <button
              type="button"
              className={PRIMARY_BUTTON_CLASS}
              onClick={selectCurrent}
              disabled={!canSelect || loading}
            >
              {copy.artifactSource.driveDirectory.confirm}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
