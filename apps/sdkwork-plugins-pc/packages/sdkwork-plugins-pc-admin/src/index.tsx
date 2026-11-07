import { useCallback, useEffect, useState, type FormEvent } from 'react';

import { isBlank, trim } from '@sdkwork/utils';
import type {
  PluginCategoryRecord,
  PluginRecord,
} from '@sdkwork/plugins-backend-sdk';

import {
  createPlugin,
  deletePlugin,
  listPluginCategories,
  listPlugins,
  updatePlugin,
  upsertPluginCategory,
  type PluginsAdminListParams,
} from './pluginsAdminService.ts';

const IMPLEMENTATION_OPTIONS = [
  'sdkwork-native',
  'rig-rust',
  'openai-agents',
  'langchain',
  'langgraph',
  'crewai',
  'autogen',
  'semantic-kernel',
  'custom',
] as const;

const VISIBILITY_OPTIONS = ['private', 'organization', 'tenant', 'public'] as const;
const INSTALL_STATUS_OPTIONS = ['available', 'installed', 'disabled'] as const;
const LIFECYCLE_TARGETS = ['draft', 'active', 'disabled', 'archived'] as const;

type ImplementationOption = (typeof IMPLEMENTATION_OPTIONS)[number];
type VisibilityOption = (typeof VISIBILITY_OPTIONS)[number];
type LifecycleTarget = (typeof LIFECYCLE_TARGETS)[number];

type StatusTransition = {
  label: string;
  targetStatus: LifecycleTarget;
};

const STATUS_TRANSITIONS: Record<string, readonly StatusTransition[]> = {
  draft: [
    { label: 'Activate', targetStatus: 'active' },
    { label: 'Archive', targetStatus: 'archived' },
  ],
  active: [
    { label: 'Disable', targetStatus: 'disabled' },
    { label: 'Archive', targetStatus: 'archived' },
  ],
  disabled: [
    { label: 'Activate', targetStatus: 'active' },
    { label: 'Archive', targetStatus: 'archived' },
  ],
  archived: [{ label: 'Activate', targetStatus: 'active' }],
};

function isImplementationOption(value: string): value is ImplementationOption {
  return (IMPLEMENTATION_OPTIONS as readonly string[]).includes(value);
}

function isVisibilityOption(value: string): value is VisibilityOption {
  return (VISIBILITY_OPTIONS as readonly string[]).includes(value);
}

function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

function parseTags(value: string): string[] {
  return value
    .split(',')
    .map((tag) => trim(tag))
    .filter((tag) => tag.length > 0);
}

function parseManifest(value: string): Record<string, unknown> | string {
  if (isBlank(value)) {
    return {};
  }
  try {
    const parsed: unknown = JSON.parse(value);
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return 'Manifest must be a JSON object';
    }
    return parsed as Record<string, unknown>;
  } catch {
    return 'Manifest is not valid JSON';
  }
}

/**
 * Cloud Router admin-console surface for managed plugins, owned by
 * sdkwork-plugins and consumed cross-repo through the backend-api surface
 * (`/backend/v3/api/plugins`).
 *
 * The host must bind `configurePluginsAdminRuntime({ getBackendSdkClient })`
 * before this page renders; the block never constructs transport itself.
 */
export function PluginsPage() {
  const [records, setRecords] = useState<PluginRecord[]>([]);
  const [categories, setCategories] = useState<PluginCategoryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<PluginRecord | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [listParams, setListParams] = useState<PluginsAdminListParams | undefined>(undefined);

  const reload = useCallback(() => {
    setReloadToken((token) => token + 1);
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    Promise.all([listPlugins(listParams), listPluginCategories()])
      .then(([pluginPage, categoryPage]) => {
        if (!active) return;
        setRecords(pluginPage.items);
        setCategories(categoryPage.items);
        setError(null);
      })
      .catch((cause: unknown) => {
        if (!active) return;
        setError(errorMessage(cause));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [reloadToken, listParams]);

  const runAction = useCallback(
    async (action: () => Promise<unknown>, successNotice: string): Promise<boolean> => {
      setError(null);
      setNotice(null);
      try {
        await action();
        setNotice(successNotice);
        reload();
        return true;
      } catch (cause: unknown) {
        setError(errorMessage(cause));
        return false;
      }
    },
    [reload],
  );

  const handleDelete = useCallback(
    (record: PluginRecord) => {
      const confirmed = window.confirm(
        `Delete plugin ${record.name} (${record.pluginKey})? The record is soft-deleted and leaves the catalog.`,
      );
      if (!confirmed) {
        return;
      }
      void runAction(
        () => deletePlugin(record.pluginKey),
        `Plugin ${record.name} deleted`,
      );
    },
    [runAction],
  );

  return (
    <section className="embedded-fill-page">
      <header className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-slate-900 dark:text-zinc-100">Plugin Management</h1>
          <p className="text-sm text-slate-500 dark:text-zinc-400">
            Managed plugins served through the backend administration API.
          </p>
        </div>
        <button
          type="button"
          className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-500"
          onClick={() => setCreateOpen(true)}
        >
          New plugin
        </button>
      </header>

      {error ? (
        <div className="mb-4 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
          {error}
        </div>
      ) : null}
      {notice ? (
        <div className="mb-4 rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
          {notice}
        </div>
      ) : null}

      <div className="data-surface">
        <div className="table-frame">
          {loading ? (
            <p className="text-sm text-slate-500 dark:text-zinc-400">Loading plugins…</p>
          ) : records.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-zinc-400">No managed plugins yet</p>
          ) : (
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-slate-500 dark:text-zinc-400">
                <tr>
                  <th className="px-3 py-2">Plugin</th>
                  <th className="px-3 py-2">Category</th>
                  <th className="px-3 py-2">Implementation</th>
                  <th className="px-3 py-2">Visibility</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Install</th>
                  <th className="px-3 py-2">Version</th>
                  <th className="px-3 py-2">Updated</th>
                  <th className="px-3 py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {records.map((record) => (
                  <tr key={record.id} className="border-t border-slate-200 dark:border-zinc-800">
                    <td className="px-3 py-2">
                      <div className="font-medium text-slate-900 dark:text-zinc-100">{record.name}</div>
                      <div className="text-xs text-slate-500 dark:text-zinc-400">{record.pluginKey}</div>
                    </td>
                    <td className="px-3 py-2 text-slate-700 dark:text-zinc-300">
                      {record.categoryCode ?? '—'}
                    </td>
                    <td className="px-3 py-2 text-slate-700 dark:text-zinc-300">{record.implementationType}</td>
                    <td className="px-3 py-2 text-slate-700 dark:text-zinc-300">{record.visibility}</td>
                    <td className="px-3 py-2 text-slate-700 dark:text-zinc-300">{record.status}</td>
                    <td className="px-3 py-2 text-slate-700 dark:text-zinc-300">{record.installStatus}</td>
                    <td className="px-3 py-2 text-slate-700 dark:text-zinc-300">{record.versionLabel}</td>
                    <td className="px-3 py-2 text-xs text-slate-500 dark:text-zinc-400">{record.updatedAt}</td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          className="rounded border border-slate-300 px-2 py-0.5 text-xs hover:bg-slate-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
                          onClick={() => setEditTarget(record)}
                        >
                          Edit
                        </button>
                        {(STATUS_TRANSITIONS[record.status] ?? []).map((transition) => (
                          <button
                            key={transition.label}
                            type="button"
                            className="rounded border border-slate-300 px-2 py-0.5 text-xs hover:bg-slate-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
                            onClick={() =>
                              void runAction(
                                () =>
                                  updatePlugin(record.pluginKey, {
                                    lifecycleStatus: transition.targetStatus,
                                  }),
                                `Plugin ${record.name} is now ${transition.targetStatus}`,
                              )
                            }
                          >
                            {transition.label}
                          </button>
                        ))}
                        <button
                          type="button"
                          className="rounded border border-red-300 px-2 py-0.5 text-xs text-red-700 hover:bg-red-50 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-950"
                          onClick={() => handleDelete(record)}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <label className="mt-3 grid max-w-xs gap-1 text-sm">
          <span className="text-slate-600 dark:text-zinc-300">Filter by keyword</span>
          <input
            className="rounded border border-slate-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-800"
            value={listParams?.q ?? ''}
            onChange={(event) => {
              const keyword = event.target.value;
              setListParams(keyword.trim().length > 0 ? { q: keyword } : undefined);
            }}
            placeholder="name, key, tag, provider"
          />
        </label>
      </div>

      {createOpen ? (
        <CreatePluginModal
          categories={categories}
          onClose={() => setCreateOpen(false)}
          onCreate={async (body) => {
            const succeeded = await runAction(() => createPlugin(body), 'Plugin created');
            if (succeeded) {
              setCreateOpen(false);
            }
          }}
        />
      ) : null}
      {editTarget ? (
        <EditPluginModal
          record={editTarget}
          categories={categories}
          onClose={() => setEditTarget(null)}
          onUpdate={async (pluginKey, body) => {
            const succeeded = await runAction(
              () => updatePlugin(pluginKey, body),
              `Plugin ${editTarget.name} updated`,
            );
            if (succeeded) {
              setEditTarget(null);
            }
          }}
        />
      ) : null}
    </section>
  );
}

type CreatePluginModalProps = {
  categories: PluginCategoryRecord[];
  onClose: () => void;
  onCreate: (body: Parameters<typeof createPlugin>[0]) => Promise<unknown>;
};

function CreatePluginModal({ categories, onClose, onCreate }: CreatePluginModalProps) {
  const [pluginKey, setPluginKey] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [categoryCode, setCategoryCode] = useState('');
  const [versionLabel, setVersionLabel] = useState('0.0.1');
  const [provider, setProvider] = useState('');
  const [implementationType, setImplementationType] = useState<ImplementationOption>('sdkwork-native');
  const [visibility, setVisibility] = useState<VisibilityOption>('tenant');
  const [manifest, setManifest] = useState('{}');
  const [tags, setTags] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const parsedManifest = parseManifest(manifest);
    if (typeof parsedManifest === 'string') {
      setFormError(parsedManifest);
      return;
    }
    setSubmitting(true);
    setFormError(null);
    void onCreate({
      pluginKey: trim(pluginKey),
      name: trim(name),
      description: isBlank(description) ? undefined : trim(description),
      categoryCode: isBlank(categoryCode) ? undefined : trim(categoryCode),
      versionLabel: isBlank(versionLabel) ? undefined : trim(versionLabel),
      provider: isBlank(provider) ? undefined : trim(provider),
      implementationType,
      visibility,
      manifest: parsedManifest,
      tags: parseTags(tags),
      allowedRoleCodes: [],
    })
      .catch((cause: unknown) => {
        setFormError(errorMessage(cause));
      })
      .finally(() => {
        setSubmitting(false);
      });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <form
        className="w-full max-w-lg rounded-lg bg-white p-5 shadow-xl dark:bg-zinc-900"
        onSubmit={submit}
      >
        <h2 className="mb-4 text-base font-semibold text-slate-900 dark:text-zinc-100">Create plugin</h2>
        <div className="grid gap-3">
          <label className="grid gap-1 text-sm">
            <span className="text-slate-600 dark:text-zinc-300">Plugin key</span>
            <input
              className="rounded border border-slate-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-800"
              value={pluginKey}
              onChange={(event) => setPluginKey(event.target.value)}
              placeholder="web-search"
              required
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-slate-600 dark:text-zinc-300">Name</span>
            <input
              className="rounded border border-slate-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-800"
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-slate-600 dark:text-zinc-300">Description</span>
            <textarea
              className="rounded border border-slate-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-800"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={2}
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="grid gap-1 text-sm">
              <span className="text-slate-600 dark:text-zinc-300">Category</span>
              <select
                className="rounded border border-slate-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-800"
                value={categoryCode}
                onChange={(event) => setCategoryCode(event.target.value)}
              >
                <option value="">Uncategorized</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.categoryCode}>
                    {category.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-sm">
              <span className="text-slate-600 dark:text-zinc-300">Version label</span>
              <input
                className="rounded border border-slate-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-800"
                value={versionLabel}
                onChange={(event) => setVersionLabel(event.target.value)}
              />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="grid gap-1 text-sm">
              <span className="text-slate-600 dark:text-zinc-300">Implementation</span>
              <select
                className="rounded border border-slate-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-800"
                value={implementationType}
                onChange={(event) => {
                  const next = event.target.value;
                  if (isImplementationOption(next)) {
                    setImplementationType(next);
                  }
                }}
              >
                {IMPLEMENTATION_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-sm">
              <span className="text-slate-600 dark:text-zinc-300">Visibility</span>
              <select
                className="rounded border border-slate-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-800"
                value={visibility}
                onChange={(event) => {
                  const next = event.target.value;
                  if (isVisibilityOption(next)) {
                    setVisibility(next);
                  }
                }}
              >
                {VISIBILITY_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="grid gap-1 text-sm">
            <span className="text-slate-600 dark:text-zinc-300">Provider</span>
            <input
              className="rounded border border-slate-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-800"
              value={provider}
              onChange={(event) => setProvider(event.target.value)}
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-slate-600 dark:text-zinc-300">Tags (comma separated)</span>
            <input
              className="rounded border border-slate-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-800"
              value={tags}
              onChange={(event) => setTags(event.target.value)}
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-slate-600 dark:text-zinc-300">Manifest (JSON object)</span>
            <textarea
              className="rounded border border-slate-300 px-2 py-1 font-mono text-xs dark:border-zinc-700 dark:bg-zinc-800"
              value={manifest}
              onChange={(event) => setManifest(event.target.value)}
              rows={4}
            />
          </label>
        </div>
        {formError ? (
          <p className="mt-3 text-sm text-red-600 dark:text-red-400">{formError}</p>
        ) : null}
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            className="rounded border border-slate-300 px-3 py-1.5 text-sm dark:border-zinc-700"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-60"
            disabled={submitting}
          >
            Create
          </button>
        </div>
      </form>
    </div>
  );
}

type EditPluginModalProps = {
  record: PluginRecord;
  categories: PluginCategoryRecord[];
  onClose: () => void;
  onUpdate: (
    pluginKey: string,
    body: Parameters<typeof updatePlugin>[1],
  ) => Promise<unknown>;
};

function EditPluginModal({ record, categories, onClose, onUpdate }: EditPluginModalProps) {
  const [name, setName] = useState(record.name);
  const [description, setDescription] = useState(record.description ?? '');
  const [categoryCode, setCategoryCode] = useState(record.categoryCode ?? '');
  const [versionLabel, setVersionLabel] = useState(record.versionLabel);
  const [provider, setProvider] = useState(record.provider ?? '');
  const [visibility, setVisibility] = useState<VisibilityOption>(
    isVisibilityOption(record.visibility) ? record.visibility : 'tenant',
  );
  const [installStatus, setInstallStatus] = useState<string>(record.installStatus);
  const [tags, setTags] = useState(record.tags.join(', '));
  const [manifest, setManifest] = useState(() => JSON.stringify(record.manifest, null, 2));
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const parsedManifest = parseManifest(manifest);
    if (typeof parsedManifest === 'string') {
      setFormError(parsedManifest);
      return;
    }
    const isInstallStatusOption = (INSTALL_STATUS_OPTIONS as readonly string[]).includes(installStatus);
    if (!isInstallStatusOption) {
      setFormError('Install status must be available, installed, or disabled');
      return;
    }
    setSubmitting(true);
    setFormError(null);
    void onUpdate(record.pluginKey, {
      name: trim(name),
      description: isBlank(description) ? undefined : trim(description),
      categoryCode: isBlank(categoryCode) ? undefined : trim(categoryCode),
      versionLabel: trim(versionLabel),
      provider: isBlank(provider) ? undefined : trim(provider),
      visibility,
      installStatus: installStatus as Parameters<typeof updatePlugin>[1]['installStatus'],
      tags: parseTags(tags),
      manifest: parsedManifest,
    })
      .catch((cause: unknown) => {
        setFormError(errorMessage(cause));
      })
      .finally(() => {
        setSubmitting(false);
      });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <form
        className="w-full max-w-lg rounded-lg bg-white p-5 shadow-xl dark:bg-zinc-900"
        onSubmit={submit}
      >
        <h2 className="mb-1 text-base font-semibold text-slate-900 dark:text-zinc-100">
          Edit plugin {record.name}
        </h2>
        <p className="mb-4 text-xs text-slate-500 dark:text-zinc-400">
          {record.pluginKey} · status {record.status}
        </p>
        <div className="grid gap-3">
          <label className="grid gap-1 text-sm">
            <span className="text-slate-600 dark:text-zinc-300">Name</span>
            <input
              className="rounded border border-slate-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-800"
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-slate-600 dark:text-zinc-300">Description</span>
            <textarea
              className="rounded border border-slate-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-800"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={2}
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="grid gap-1 text-sm">
              <span className="text-slate-600 dark:text-zinc-300">Category</span>
              <select
                className="rounded border border-slate-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-800"
                value={categoryCode}
                onChange={(event) => setCategoryCode(event.target.value)}
              >
                <option value="">Uncategorized</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.categoryCode}>
                    {category.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-sm">
              <span className="text-slate-600 dark:text-zinc-300">Version label</span>
              <input
                className="rounded border border-slate-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-800"
                value={versionLabel}
                onChange={(event) => setVersionLabel(event.target.value)}
              />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="grid gap-1 text-sm">
              <span className="text-slate-600 dark:text-zinc-300">Visibility</span>
              <select
                className="rounded border border-slate-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-800"
                value={visibility}
                onChange={(event) => {
                  const next = event.target.value;
                  if (isVisibilityOption(next)) {
                    setVisibility(next);
                  }
                }}
              >
                {VISIBILITY_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-sm">
              <span className="text-slate-600 dark:text-zinc-300">Install status</span>
              <select
                className="rounded border border-slate-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-800"
                value={installStatus}
                onChange={(event) => setInstallStatus(event.target.value)}
              >
                {INSTALL_STATUS_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="grid gap-1 text-sm">
            <span className="text-slate-600 dark:text-zinc-300">Provider</span>
            <input
              className="rounded border border-slate-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-800"
              value={provider}
              onChange={(event) => setProvider(event.target.value)}
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-slate-600 dark:text-zinc-300">Tags (comma separated)</span>
            <input
              className="rounded border border-slate-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-800"
              value={tags}
              onChange={(event) => setTags(event.target.value)}
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-slate-600 dark:text-zinc-300">Manifest (JSON object)</span>
            <textarea
              className="rounded border border-slate-300 px-2 py-1 font-mono text-xs dark:border-zinc-700 dark:bg-zinc-800"
              value={manifest}
              onChange={(event) => setManifest(event.target.value)}
              rows={6}
            />
          </label>
        </div>
        {formError ? (
          <p className="mt-3 text-sm text-red-600 dark:text-red-400">{formError}</p>
        ) : null}
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            className="rounded border border-slate-300 px-3 py-1.5 text-sm dark:border-zinc-700"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-60"
            disabled={submitting}
          >
            Save
          </button>
        </div>
      </form>
    </div>
  );
}

/**
 * Admin surface for the plugin category registry
 * (`/backend/v3/api/plugin_categories`): list and upsert categories.
 */
export function PluginCategoriesPage() {
  const [records, setRecords] = useState<PluginCategoryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [upsertOpen, setUpsertOpen] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  const reload = useCallback(() => {
    setReloadToken((token) => token + 1);
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    listPluginCategories()
      .then((page) => {
        if (!active) return;
        setRecords(page.items);
        setError(null);
      })
      .catch((cause: unknown) => {
        if (!active) return;
        setError(errorMessage(cause));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [reloadToken]);

  const runAction = useCallback(
    async (action: () => Promise<unknown>, successNotice: string): Promise<boolean> => {
      setError(null);
      setNotice(null);
      try {
        await action();
        setNotice(successNotice);
        reload();
        return true;
      } catch (cause: unknown) {
        setError(errorMessage(cause));
        return false;
      }
    },
    [reload],
  );

  return (
    <section className="embedded-fill-page">
      <header className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-slate-900 dark:text-zinc-100">Plugin Categories</h1>
          <p className="text-sm text-slate-500 dark:text-zinc-400">
            Marketplace category registry served through the backend administration API.
          </p>
        </div>
        <button
          type="button"
          className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-500"
          onClick={() => setUpsertOpen(true)}
        >
          New category
        </button>
      </header>

      {error ? (
        <div className="mb-4 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
          {error}
        </div>
      ) : null}
      {notice ? (
        <div className="mb-4 rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
          {notice}
        </div>
      ) : null}

      <div className="data-surface">
        <div className="table-frame">
          {loading ? (
            <p className="text-sm text-slate-500 dark:text-zinc-400">Loading categories…</p>
          ) : records.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-zinc-400">No plugin categories yet</p>
          ) : (
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-slate-500 dark:text-zinc-400">
                <tr>
                  <th className="px-3 py-2">Category</th>
                  <th className="px-3 py-2">Code</th>
                  <th className="px-3 py-2">Sort order</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Updated</th>
                </tr>
              </thead>
              <tbody>
                {records.map((record) => (
                  <tr key={record.id} className="border-t border-slate-200 dark:border-zinc-800">
                    <td className="px-3 py-2">
                      <div className="font-medium text-slate-900 dark:text-zinc-100">{record.name}</div>
                      <div className="text-xs text-slate-500 dark:text-zinc-400">
                        {record.description ?? ''}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-slate-700 dark:text-zinc-300">{record.categoryCode}</td>
                    <td className="px-3 py-2 text-slate-700 dark:text-zinc-300">{record.sortOrder}</td>
                    <td className="px-3 py-2 text-slate-700 dark:text-zinc-300">{record.lifecycleStatus}</td>
                    <td className="px-3 py-2 text-xs text-slate-500 dark:text-zinc-400">{record.updatedAt}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {upsertOpen ? (
        <UpsertCategoryModal
          onClose={() => setUpsertOpen(false)}
          onUpsert={async (body) => {
            const succeeded = await runAction(
              () => upsertPluginCategory(body),
              `Category ${body.name} saved`,
            );
            if (succeeded) {
              setUpsertOpen(false);
            }
          }}
        />
      ) : null}
    </section>
  );
}

type UpsertCategoryModalProps = {
  onClose: () => void;
  onUpsert: (body: Parameters<typeof upsertPluginCategory>[0]) => Promise<unknown>;
};

function UpsertCategoryModal({ onClose, onUpsert }: UpsertCategoryModalProps) {
  const [categoryCode, setCategoryCode] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [sortOrder, setSortOrder] = useState('0');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const parsedSortOrder = Number.parseInt(sortOrder, 10);
    if (Number.isNaN(parsedSortOrder)) {
      setFormError('Sort order must be an integer');
      return;
    }
    setSubmitting(true);
    setFormError(null);
    void onUpsert({
      categoryCode: trim(categoryCode),
      name: trim(name),
      description: isBlank(description) ? undefined : trim(description),
      sortOrder: parsedSortOrder,
    })
      .catch((cause: unknown) => {
        setFormError(errorMessage(cause));
      })
      .finally(() => {
        setSubmitting(false);
      });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <form
        className="w-full max-w-md rounded-lg bg-white p-5 shadow-xl dark:bg-zinc-900"
        onSubmit={submit}
      >
        <h2 className="mb-4 text-base font-semibold text-slate-900 dark:text-zinc-100">Upsert category</h2>
        <div className="grid gap-3">
          <label className="grid gap-1 text-sm">
            <span className="text-slate-600 dark:text-zinc-300">Category code</span>
            <input
              className="rounded border border-slate-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-800"
              value={categoryCode}
              onChange={(event) => setCategoryCode(event.target.value)}
              placeholder="search-tools"
              required
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-slate-600 dark:text-zinc-300">Name</span>
            <input
              className="rounded border border-slate-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-800"
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-slate-600 dark:text-zinc-300">Description</span>
            <textarea
              className="rounded border border-slate-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-800"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={2}
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-slate-600 dark:text-zinc-300">Sort order</span>
            <input
              className="rounded border border-slate-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-800"
              value={sortOrder}
              onChange={(event) => setSortOrder(event.target.value)}
              inputMode="numeric"
            />
          </label>
        </div>
        {formError ? (
          <p className="mt-3 text-sm text-red-600 dark:text-red-400">{formError}</p>
        ) : null}
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            className="rounded border border-slate-300 px-3 py-1.5 text-sm dark:border-zinc-700"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-60"
            disabled={submitting}
          >
            Save
          </button>
        </div>
      </form>
    </div>
  );
}
