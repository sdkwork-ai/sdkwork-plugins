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
import { usePluginsAdminCopy, type PluginsAdminCopy } from './copy/pluginsAdminCopy.ts';

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

type TransitionLabelKey = 'activate' | 'disable' | 'archive';

type StatusTransition = {
  label: TransitionLabelKey;
  targetStatus: LifecycleTarget;
};

const STATUS_TRANSITIONS: Record<string, readonly StatusTransition[]> = {
  draft: [
    { label: 'activate', targetStatus: 'active' },
    { label: 'archive', targetStatus: 'archived' },
  ],
  active: [
    { label: 'disable', targetStatus: 'disabled' },
    { label: 'archive', targetStatus: 'archived' },
  ],
  disabled: [
    { label: 'activate', targetStatus: 'active' },
    { label: 'archive', targetStatus: 'archived' },
  ],
  archived: [{ label: 'activate', targetStatus: 'active' }],
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

function parseManifest(
  value: string,
  copy: PluginsAdminCopy,
): Record<string, unknown> | string {
  if (isBlank(value)) {
    return {};
  }
  try {
    const parsed: unknown = JSON.parse(value);
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return copy.errors.manifestNotObject;
    }
    return parsed as Record<string, unknown>;
  } catch {
    return copy.errors.manifestNotJson;
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
  const copy = usePluginsAdminCopy();
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
        copy.plugins.confirmDelete(record.name, record.pluginKey),
      );
      if (!confirmed) {
        return;
      }
      void runAction(
        () => deletePlugin(record.pluginKey),
        copy.plugins.notices.deleted(record.name),
      );
    },
    [runAction, copy],
  );

  return (
    <section className="embedded-fill-page">
      <header className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-slate-900 dark:text-zinc-100">{copy.plugins.title}</h1>
          <p className="text-sm text-slate-500 dark:text-zinc-400">
            {copy.plugins.description}
          </p>
        </div>
        <button
          type="button"
          className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-500"
          onClick={() => setCreateOpen(true)}
        >
          {copy.plugins.newPlugin}
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
            <p className="text-sm text-slate-500 dark:text-zinc-400">{copy.plugins.loading}</p>
          ) : records.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-zinc-400">{copy.plugins.empty}</p>
          ) : (
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-slate-500 dark:text-zinc-400">
                <tr>
                  <th className="px-3 py-2">{copy.plugins.table.plugin}</th>
                  <th className="px-3 py-2">{copy.plugins.table.category}</th>
                  <th className="px-3 py-2">{copy.plugins.table.implementation}</th>
                  <th className="px-3 py-2">{copy.plugins.table.visibility}</th>
                  <th className="px-3 py-2">{copy.plugins.table.status}</th>
                  <th className="px-3 py-2">{copy.plugins.table.install}</th>
                  <th className="px-3 py-2">{copy.plugins.table.version}</th>
                  <th className="px-3 py-2">{copy.plugins.table.updated}</th>
                  <th className="px-3 py-2">{copy.plugins.table.actions}</th>
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
                    <td className="px-3 py-2 text-slate-700 dark:text-zinc-300">{copy.labels.visibility[record.visibility]}</td>
                    <td className="px-3 py-2 text-slate-700 dark:text-zinc-300">{copy.labels.status[record.status]}</td>
                    <td className="px-3 py-2 text-slate-700 dark:text-zinc-300">{copy.labels.installStatus[record.installStatus]}</td>
                    <td className="px-3 py-2 text-slate-700 dark:text-zinc-300">{record.versionLabel}</td>
                    <td className="px-3 py-2 text-xs text-slate-500 dark:text-zinc-400">{record.updatedAt}</td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          className="rounded border border-slate-300 px-2 py-0.5 text-xs hover:bg-slate-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
                          onClick={() => setEditTarget(record)}
                        >
                          {copy.plugins.actions.edit}
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
                                copy.plugins.notices.statusChanged(
                                  record.name,
                                  copy.labels.status[transition.targetStatus],
                                ),
                              )
                            }
                          >
                            {copy.plugins.transitions[transition.label]}
                          </button>
                        ))}
                        <button
                          type="button"
                          className="rounded border border-red-300 px-2 py-0.5 text-xs text-red-700 hover:bg-red-50 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-950"
                          onClick={() => handleDelete(record)}
                        >
                          {copy.plugins.actions.delete}
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
          <span className="text-slate-600 dark:text-zinc-300">{copy.plugins.filterLabel}</span>
          <input
            className="rounded border border-slate-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-800"
            value={listParams?.q ?? ''}
            onChange={(event) => {
              const keyword = event.target.value;
              setListParams(keyword.trim().length > 0 ? { q: keyword } : undefined);
            }}
            placeholder={copy.plugins.filterPlaceholder}
          />
        </label>
      </div>

      {createOpen ? (
        <CreatePluginModal
          categories={categories}
          onClose={() => setCreateOpen(false)}
          onCreate={async (body) => {
            const succeeded = await runAction(
              () => createPlugin(body),
              copy.plugins.notices.created,
            );
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
              copy.plugins.notices.updated(editTarget.name),
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
  const copy = usePluginsAdminCopy();
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
    const parsedManifest = parseManifest(manifest, copy);
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
        <h2 className="mb-4 text-base font-semibold text-slate-900 dark:text-zinc-100">{copy.pluginForm.createTitle}</h2>
        <div className="grid gap-3">
          <label className="grid gap-1 text-sm">
            <span className="text-slate-600 dark:text-zinc-300">{copy.pluginForm.fields.pluginKey}</span>
            <input
              className="rounded border border-slate-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-800"
              value={pluginKey}
              onChange={(event) => setPluginKey(event.target.value)}
              placeholder={copy.pluginForm.placeholders.pluginKey}
              required
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-slate-600 dark:text-zinc-300">{copy.pluginForm.fields.name}</span>
            <input
              className="rounded border border-slate-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-800"
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-slate-600 dark:text-zinc-300">{copy.pluginForm.fields.description}</span>
            <textarea
              className="rounded border border-slate-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-800"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={2}
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="grid gap-1 text-sm">
              <span className="text-slate-600 dark:text-zinc-300">{copy.pluginForm.fields.category}</span>
              <select
                className="rounded border border-slate-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-800"
                value={categoryCode}
                onChange={(event) => setCategoryCode(event.target.value)}
              >
                <option value="">{copy.pluginForm.uncategorized}</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.categoryCode}>
                    {category.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-sm">
              <span className="text-slate-600 dark:text-zinc-300">{copy.pluginForm.fields.versionLabel}</span>
              <input
                className="rounded border border-slate-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-800"
                value={versionLabel}
                onChange={(event) => setVersionLabel(event.target.value)}
              />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="grid gap-1 text-sm">
              <span className="text-slate-600 dark:text-zinc-300">{copy.pluginForm.fields.implementation}</span>
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
              <span className="text-slate-600 dark:text-zinc-300">{copy.pluginForm.fields.visibility}</span>
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
                    {copy.labels.visibility[option]}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="grid gap-1 text-sm">
            <span className="text-slate-600 dark:text-zinc-300">{copy.pluginForm.fields.provider}</span>
            <input
              className="rounded border border-slate-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-800"
              value={provider}
              onChange={(event) => setProvider(event.target.value)}
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-slate-600 dark:text-zinc-300">{copy.pluginForm.fields.tags}</span>
            <input
              className="rounded border border-slate-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-800"
              value={tags}
              onChange={(event) => setTags(event.target.value)}
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-slate-600 dark:text-zinc-300">{copy.pluginForm.fields.manifest}</span>
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
            {copy.pluginForm.cancel}
          </button>
          <button
            type="submit"
            className="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-60"
            disabled={submitting}
          >
            {copy.pluginForm.create}
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
  const copy = usePluginsAdminCopy();
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
    const parsedManifest = parseManifest(manifest, copy);
    if (typeof parsedManifest === 'string') {
      setFormError(parsedManifest);
      return;
    }
    const isInstallStatusOption = (INSTALL_STATUS_OPTIONS as readonly string[]).includes(installStatus);
    if (!isInstallStatusOption) {
      setFormError(copy.errors.installStatusInvalid);
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
          {copy.pluginForm.editTitle(record.name)}
        </h2>
        <p className="mb-4 text-xs text-slate-500 dark:text-zinc-400">
          {copy.pluginForm.editSubtitle(record.pluginKey, copy.labels.status[record.status])}
        </p>
        <div className="grid gap-3">
          <label className="grid gap-1 text-sm">
            <span className="text-slate-600 dark:text-zinc-300">{copy.pluginForm.fields.name}</span>
            <input
              className="rounded border border-slate-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-800"
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-slate-600 dark:text-zinc-300">{copy.pluginForm.fields.description}</span>
            <textarea
              className="rounded border border-slate-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-800"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={2}
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="grid gap-1 text-sm">
              <span className="text-slate-600 dark:text-zinc-300">{copy.pluginForm.fields.category}</span>
              <select
                className="rounded border border-slate-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-800"
                value={categoryCode}
                onChange={(event) => setCategoryCode(event.target.value)}
              >
                <option value="">{copy.pluginForm.uncategorized}</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.categoryCode}>
                    {category.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-sm">
              <span className="text-slate-600 dark:text-zinc-300">{copy.pluginForm.fields.versionLabel}</span>
              <input
                className="rounded border border-slate-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-800"
                value={versionLabel}
                onChange={(event) => setVersionLabel(event.target.value)}
              />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="grid gap-1 text-sm">
              <span className="text-slate-600 dark:text-zinc-300">{copy.pluginForm.fields.visibility}</span>
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
                    {copy.labels.visibility[option]}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-sm">
              <span className="text-slate-600 dark:text-zinc-300">{copy.pluginForm.fields.installStatus}</span>
              <select
                className="rounded border border-slate-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-800"
                value={installStatus}
                onChange={(event) => setInstallStatus(event.target.value)}
              >
                {INSTALL_STATUS_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {copy.labels.installStatus[option]}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="grid gap-1 text-sm">
            <span className="text-slate-600 dark:text-zinc-300">{copy.pluginForm.fields.provider}</span>
            <input
              className="rounded border border-slate-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-800"
              value={provider}
              onChange={(event) => setProvider(event.target.value)}
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-slate-600 dark:text-zinc-300">{copy.pluginForm.fields.tags}</span>
            <input
              className="rounded border border-slate-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-800"
              value={tags}
              onChange={(event) => setTags(event.target.value)}
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-slate-600 dark:text-zinc-300">{copy.pluginForm.fields.manifest}</span>
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
            {copy.pluginForm.cancel}
          </button>
          <button
            type="submit"
            className="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-60"
            disabled={submitting}
          >
            {copy.pluginForm.save}
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
  const copy = usePluginsAdminCopy();
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
          <h1 className="text-lg font-semibold text-slate-900 dark:text-zinc-100">{copy.categories.title}</h1>
          <p className="text-sm text-slate-500 dark:text-zinc-400">
            {copy.categories.description}
          </p>
        </div>
        <button
          type="button"
          className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-500"
          onClick={() => setUpsertOpen(true)}
        >
          {copy.categories.newCategory}
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
            <p className="text-sm text-slate-500 dark:text-zinc-400">{copy.categories.loading}</p>
          ) : records.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-zinc-400">{copy.categories.empty}</p>
          ) : (
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-slate-500 dark:text-zinc-400">
                <tr>
                  <th className="px-3 py-2">{copy.categories.table.category}</th>
                  <th className="px-3 py-2">{copy.categories.table.code}</th>
                  <th className="px-3 py-2">{copy.categories.table.sortOrder}</th>
                  <th className="px-3 py-2">{copy.categories.table.status}</th>
                  <th className="px-3 py-2">{copy.categories.table.updated}</th>
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
                    <td className="px-3 py-2 text-slate-700 dark:text-zinc-300">{copy.labels.status[record.lifecycleStatus]}</td>
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
              copy.categories.notices.saved(body.name),
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
  const copy = usePluginsAdminCopy();
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
      setFormError(copy.errors.sortOrderInvalid);
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
        <h2 className="mb-4 text-base font-semibold text-slate-900 dark:text-zinc-100">{copy.categoryForm.title}</h2>
        <div className="grid gap-3">
          <label className="grid gap-1 text-sm">
            <span className="text-slate-600 dark:text-zinc-300">{copy.categoryForm.fields.categoryCode}</span>
            <input
              className="rounded border border-slate-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-800"
              value={categoryCode}
              onChange={(event) => setCategoryCode(event.target.value)}
              placeholder={copy.categoryForm.placeholders.categoryCode}
              required
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-slate-600 dark:text-zinc-300">{copy.categoryForm.fields.name}</span>
            <input
              className="rounded border border-slate-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-800"
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-slate-600 dark:text-zinc-300">{copy.categoryForm.fields.description}</span>
            <textarea
              className="rounded border border-slate-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-800"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={2}
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-slate-600 dark:text-zinc-300">{copy.categoryForm.fields.sortOrder}</span>
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
            {copy.categoryForm.cancel}
          </button>
          <button
            type="submit"
            className="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-60"
            disabled={submitting}
          >
            {copy.categoryForm.save}
          </button>
        </div>
      </form>
    </div>
  );
}

export {
  PLUGINS_ADMIN_COPY,
  resolvePluginsAdminCopy,
  usePluginsAdminCopy,
  usePluginsAdminLocale,
  type PluginsAdminCopy,
} from './copy/pluginsAdminCopy.ts';
