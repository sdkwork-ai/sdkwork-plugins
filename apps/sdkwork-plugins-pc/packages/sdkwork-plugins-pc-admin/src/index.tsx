import { useCallback, useEffect, useId, useMemo, useState, type FormEvent, type ReactNode } from 'react';

import { isBlank, trim } from '@sdkwork/utils';
import type {
  PluginArtifactSource,
  PluginCategoryRecord,
  PluginRecord,
} from '@sdkwork/plugins-backend-sdk';

import {
  createPlugin,
  deletePlugin,
  getPluginsAdminDriveSdkClient,
  listPluginCategories,
  listPlugins,
  updatePlugin,
  upsertPluginCategory,
  type PluginsAdminListParams,
} from './pluginsAdminService.ts';
import { usePluginsAdminCopy, usePluginsAdminLocale, type PluginsAdminCopy } from './copy/pluginsAdminCopy.ts';
import {
  AdminListPagination,
  DEFAULT_ADMIN_LIST_PAGE_SIZE,
} from './components/AdminListPagination.tsx';
import { ArtifactSourceField } from './components/ArtifactSourceField.tsx';
import { CategorySelect } from './components/CategorySelect.tsx';
import { RoleMultiSelect } from './components/RoleMultiSelect.tsx';
import { SurfaceDrawer } from './components/SurfaceOverlay.tsx';

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
 * Presentational hooks owned by the host admin shell.
 *
 * The list surface, the control geometry (`--admin-control-height`) and the
 * query toolbar are defined once by the composing application, so inputs,
 * selects, segmented switches and buttons in every admin list page share one
 * height and one card surface without this block re-declaring colors.
 */
const INPUT_CLASS = 'admin-control';
const LABEL_TEXT_CLASS = 'admin-field__label';
const SECONDARY_BUTTON_CLASS = 'admin-button admin-button--secondary';
const PRIMARY_BUTTON_CLASS = 'admin-button admin-button--primary';
const DANGER_BUTTON_CLASS = 'admin-button admin-button--danger';

type BadgeTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

function Badge({ tone, children }: { tone: BadgeTone; children: ReactNode }) {
  return <span className={`admin-badge admin-badge--${tone}`}>{children}</span>;
}

/**
 * Lifecycle, visibility and install state read as tones instead of raw text.
 *
 * `active` and `installed` are the healthy states; `draft`/`public` are
 * informational; `disabled`/`archived` are attention states. Unknown values
 * fall back to the neutral tone rather than inventing a color.
 */
function statusTone(status: string): BadgeTone {
  switch (status) {
    case 'active':
      return 'success';
    case 'draft':
      return 'info';
    case 'disabled':
      return 'warning';
    default:
      return 'neutral';
  }
}

function visibilityTone(visibility: string): BadgeTone {
  return visibility === 'public' ? 'info' : 'neutral';
}

function installTone(installStatus: string): BadgeTone {
  switch (installStatus) {
    case 'installed':
      return 'success';
    case 'disabled':
      return 'warning';
    default:
      return 'neutral';
  }
}

/**
 * Category cell label: the registry name when the code resolves, the raw code
 * otherwise, and the "uncategorized" copy when the record carries no category.
 */
function categoryLabel(
  categories: readonly PluginCategoryRecord[],
  code: string | null | undefined,
  fallback: string,
): string {
  if (!code) {
    return fallback;
  }
  return categories.find((category) => category.categoryCode === code)?.name ?? code;
}

/**
 * Wire timestamps are ISO-8601 strings; show them in the operator's locale
 * instead of the raw value, and keep the raw value in the `title` attribute so
 * the exact instant is still available on hover.
 */
function formatTimestamp(value: string, locale: 'en' | 'zh'): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat(locale === 'zh' ? 'zh-CN' : 'en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(parsed);
}

/**
 * Rows matching the active query across every page.
 *
 * `pageInfo.totalItems` is an `int64` wire field, so the generated client types
 * it as a decimal string (API_SPEC §13.6). It is a row count, never an
 * identifier, so it is the one int64 the list may turn into a number to size the
 * pagination bar; a missing or malformed value degrades to `0` instead of
 * rendering `NaN`.
 */
function pageInfoTotalItems(pageInfo: { totalItems?: string } | undefined): number {
  const parsed = Number.parseInt(pageInfo?.totalItems ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

/**
 * Last page that still renders a row for `total` rows at `pageSize`.
 *
 * Both lists clamp the requested page onto it when a filtered result set,
 * a deletion or a page-size change shrinks the rows under the current page.
 */
function lastPageFor(totalItems: number, pageSize: number): number {
  return Math.max(1, Math.ceil(Math.max(0, totalItems) / Math.max(1, pageSize)));
}

function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="admin-field">
      <span className={LABEL_TEXT_CLASS}>{label}</span>
      {children}
    </label>
  );
}

/**
 * Cloud Router admin-console surface for managed plugins, owned by
 * sdkwork-plugins and consumed cross-repo through the backend-api surface
 * (`/backend/v3/api/plugins`).
 *
 * The host must bind `configurePluginsAdminRuntime({ getBackendSdkClient })`
 * before this page renders; the block never constructs transport itself.
 */
export interface PluginsPageProps {
  /**
   * IAM role codes of the signed-in operator.
   *
   * The page offers the catalog's role-scope switch with them: `All data`
   * lists the whole tenant catalog, `My roles` keeps the records this operator
   * can reach. Without role codes the switch stays on `All data`, because a
   * scope the host cannot name would silently empty the table.
   */
  roleCodes?: readonly string[];
}

type RoleScope = 'all' | 'mine';

/**
 * True when the host supplied at least one usable operator role code.
 *
 * The role-scoped view is only meaningful with a populated scope, so the
 * switch stays disabled instead of offering a view the host cannot name.
 */
function roleScopeCodesAvailable(roleCodes: readonly string[]): boolean {
  return roleCodes.some((code) => code.trim().length > 0);
}

/**
 * Active category options for the filter select.
 *
 * A category that was active when it was selected can be archived later; the
 * select must keep showing that value instead of silently rendering blank
 * while the list stays filtered by it. The retained option carries the code as
 * its label, because the registry no longer publishes a name for an archived
 * row in this view.
 */
function activeCategoryOptions(
  categories: readonly PluginCategoryRecord[],
  selected: string,
): { value: string; label: string }[] {
  const options = categories
    .filter((category) => category.lifecycleStatus === 'active')
    .slice()
    .sort((left, right) => left.sortOrder - right.sortOrder)
    .map((category) => ({ value: category.categoryCode, label: category.name }));
  if (selected.length > 0 && !options.some((option) => option.value === selected)) {
    const retained = categories.find((category) => category.categoryCode === selected);
    options.push({ value: selected, label: retained?.name ?? selected });
  }
  return options;
}

export function PluginsPage({ roleCodes = [] }: PluginsPageProps = {}) {
  const copy = usePluginsAdminCopy();
  const locale = usePluginsAdminLocale();
  const [records, setRecords] = useState<PluginRecord[]>([]);
  const [categories, setCategories] = useState<PluginCategoryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<PluginRecord | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [keyword, setKeyword] = useState('');
  /**
   * The keyword that actually reaches the list endpoint.
   *
   * Typing must not fire one request per keystroke: the list runs straight
   * against the backend and re-renders the whole table, so the field is
   * debounced by 250 ms before it becomes part of the request parameters.
   */
  const [appliedKeyword, setAppliedKeyword] = useState('');
  const [categoryCode, setCategoryCode] = useState('');
  const [roleScope, setRoleScope] = useState<RoleScope>('all');
  /** 1-based page requested from the list endpoint. */
  const [page, setPage] = useState(1);
  /** Rows requested per page; the bar offers the shared size options. */
  const [pageSize, setPageSize] = useState(DEFAULT_ADMIN_LIST_PAGE_SIZE);
  /** Rows matching the active query across every page (`pageInfo.totalItems`). */
  const [totalItems, setTotalItems] = useState(0);

  /**
   * The applied keyword is the one that reaches the list endpoint, so the page
   * restarts there: a new query renumbers the result set, and keeping the old
   * page would land on rows the query no longer has.
   */
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setAppliedKeyword(keyword);
      setPage(1);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [keyword]);

  const roleScopeCodes = useMemo(
    () => (roleScope === 'mine' ? roleCodes.map((code) => code.trim()).filter(Boolean) : []),
    [roleScope, roleCodes],
  );

  const listParams = useMemo<PluginsAdminListParams | undefined>(() => {
    // The table pages on the server: `page`/`pageSize` bound the requested
    // window and `pageInfo.totalItems` reports the size of the whole filtered
    // set, so the page no longer has to over-fetch to stay complete.
    const params: NonNullable<PluginsAdminListParams> = { page, pageSize };
    if (appliedKeyword.trim().length > 0) {
      params.q = appliedKeyword;
    }
    if (categoryCode.length > 0) {
      params.categoryCode = categoryCode;
    }
    if (roleScopeCodes.length > 0) {
      params.roleCodes = [...roleScopeCodes].sort().join(',');
    }
    return params;
  }, [page, pageSize, appliedKeyword, categoryCode, roleScopeCodes]);

  const reload = useCallback(() => {
    setReloadToken((token) => token + 1);
  }, []);

  /** True when a query control narrows the list, so the empty state can say so. */
  const filtersActive =
    appliedKeyword.trim().length > 0 || categoryCode.length > 0 || roleScope === 'mine';

  const clearFilters = useCallback(() => {
    setKeyword('');
    setAppliedKeyword('');
    setCategoryCode('');
    setRoleScope('all');
    setPage(1);
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    Promise.all([
      listPlugins(listParams),
      // The category filter needs the full registry, not the default window.
      listPluginCategories({ pageSize: 200 }),
    ])
      .then(([pluginPage, categoryPage]) => {
        if (!active) return;
        const total = pageInfoTotalItems(pluginPage.pageInfo);
        setRecords(pluginPage.items);
        setCategories(categoryPage.items);
        setTotalItems(total);
        setError(null);
        // A deletion, a narrowed filter or a larger page size can leave the
        // current page past the end of the result set: fall back to the last
        // populated page. The clamp targets a page the response already
        // covers, so the follow-up load is in range and cannot loop.
        const lastPage = lastPageFor(total, pageSize);
        if (page > lastPage) {
          setPage(lastPage);
        }
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
  }, [reloadToken, listParams, page, pageSize]);

  /**
   * A different page size renumbers every row, so the list restarts at page 1.
   */
  const changePageSize = (next: number) => {
    setPageSize(next);
    setPage(1);
  };

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
      <header className="admin-page-header">
        <div>
          <h1 className="admin-page-header__title">{copy.plugins.title}</h1>
          <p className="admin-page-header__description">{copy.plugins.description}</p>
        </div>
        <div className="admin-page-header__actions">
          <button
            type="button"
            className={PRIMARY_BUTTON_CLASS}
            onClick={() => setCreateOpen(true)}
          >
            {copy.plugins.newPlugin}
          </button>
        </div>
      </header>

      {error ? (
        <div role="alert" className="admin-alert admin-alert--error">
          {error}
        </div>
      ) : null}
      {notice ? (
        <div role="status" className="admin-alert admin-alert--success">
          {notice}
        </div>
      ) : null}

      <div className="data-surface">
        <div className="admin-list-toolbar">
          <div className="admin-list-toolbar__filters">
            <label className="admin-field admin-field--search">
              <span className={LABEL_TEXT_CLASS}>{copy.plugins.filterLabel}</span>
              <input
                className={INPUT_CLASS}
                value={keyword}
                onChange={(event) => setKeyword(event.target.value)}
                placeholder={copy.plugins.filterPlaceholder}
              />
            </label>
            <label className="admin-field admin-field--compact">
              <span className={LABEL_TEXT_CLASS}>{copy.plugins.filters.categoryLabel}</span>
              <select
                className={INPUT_CLASS}
                value={categoryCode}
                onChange={(event) => {
                  setCategoryCode(event.target.value);
                  setPage(1);
                }}
              >
                <option value="">{copy.plugins.filters.allCategories}</option>
                {activeCategoryOptions(categories, categoryCode).map((category) => (
                  <option key={category.value} value={category.value}>
                    {category.label}
                  </option>
                ))}
              </select>
            </label>
            <div className="admin-field">
              <span className={LABEL_TEXT_CLASS}>{copy.plugins.filters.roleScopeLabel}</span>
              <div
                className="admin-segmented"
                role="group"
                aria-label={copy.plugins.filters.roleScopeLabel}
              >
                {(['all', 'mine'] as const).map((scope) => {
                  const disabled = scope === 'mine' && roleScopeCodesAvailable(roleCodes) === false;
                  return (
                    <button
                      key={scope}
                      type="button"
                      className="admin-segmented__item"
                      aria-pressed={roleScope === scope}
                      disabled={disabled}
                      title={disabled ? copy.plugins.filters.roleScopeUnavailable : undefined}
                      onClick={() => {
                        setRoleScope(scope);
                        setPage(1);
                      }}
                    >
                      {scope === 'all'
                        ? copy.plugins.filters.roleScopeAll
                        : copy.plugins.filters.roleScopeMine}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
          <div className="admin-list-toolbar__actions">
            <button
              type="button"
              className={SECONDARY_BUTTON_CLASS}
              onClick={reload}
              disabled={loading}
            >
              {copy.plugins.refresh}
            </button>
          </div>
        </div>

        <div className="table-frame">
          {records.length === 0 ? (
            <div className="admin-list-state">
              <span>
                {loading
                  ? copy.plugins.loading
                  : filtersActive
                    ? copy.plugins.emptyFiltered
                    : copy.plugins.empty}
              </span>
              {!loading && filtersActive ? (
                <button type="button" className={SECONDARY_BUTTON_CLASS} onClick={clearFilters}>
                  {copy.plugins.clearFilters}
                </button>
              ) : null}
            </div>
          ) : (
            <table className="admin-list-table">
              <thead>
                <tr>
                  <th>{copy.plugins.table.plugin}</th>
                  <th>{copy.plugins.table.category}</th>
                  <th>{copy.plugins.table.implementation}</th>
                  <th>{copy.plugins.table.visibility}</th>
                  <th>{copy.plugins.table.status}</th>
                  <th>{copy.plugins.table.install}</th>
                  <th>{copy.plugins.table.version}</th>
                  <th>{copy.plugins.table.updated}</th>
                  <th className="text-right">{copy.plugins.table.actions}</th>
                </tr>
              </thead>
              <tbody>
                {records.map((record) => (
                  <tr key={record.id}>
                    <td>
                      <span className="admin-list-table__primary">{record.name}</span>
                      <span className="admin-list-table__secondary font-mono">{record.pluginKey}</span>
                    </td>
                    <td>
                      {categoryLabel(categories, record.categoryCode, copy.pluginForm.uncategorized)}
                    </td>
                    <td>
                      <code className="font-mono text-xs">{record.implementationType}</code>
                    </td>
                    <td>
                      <Badge tone={visibilityTone(record.visibility)}>
                        {copy.labels.visibility[record.visibility]}
                      </Badge>
                    </td>
                    <td>
                      <Badge tone={statusTone(record.status)}>
                        {copy.labels.status[record.status]}
                      </Badge>
                    </td>
                    <td>
                      <Badge tone={installTone(record.installStatus)}>
                        {copy.labels.installStatus[record.installStatus]}
                      </Badge>
                    </td>
                    <td className="text-xs">{record.versionLabel}</td>
                    <td className="text-xs" title={record.updatedAt}>
                      {formatTimestamp(record.updatedAt, locale)}
                    </td>
                    <td>
                      <div className="flex flex-wrap justify-end gap-2">
                        <button
                          type="button"
                          className={SECONDARY_BUTTON_CLASS}
                          onClick={() => setEditTarget(record)}
                        >
                          {copy.plugins.actions.edit}
                        </button>
                        {(STATUS_TRANSITIONS[record.status] ?? []).map((transition) => (
                          <button
                            key={transition.label}
                            type="button"
                            className={SECONDARY_BUTTON_CLASS}
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
                          className={DANGER_BUTTON_CLASS}
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
        {records.length > 0 ? (
          <AdminListPagination
            page={page}
            pageSize={pageSize}
            itemCount={records.length}
            totalItems={totalItems}
            hasNextPage={page * pageSize < totalItems}
            copy={copy.pagination}
            disabled={loading}
            onPageChange={setPage}
            onPageSizeChange={changePageSize}
          />
        ) : null}
      </div>

      {createOpen ? (
        <PluginEditorDrawer
          mode="create"
          categories={categories}
          onClose={() => setCreateOpen(false)}
          onSubmit={async (body) => {
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
        <PluginEditorDrawer
          mode="edit"
          record={editTarget}
          categories={categories}
          onClose={() => setEditTarget(null)}
          onSubmit={async (body) => {
            const succeeded = await runAction(
              () => updatePlugin(editTarget.pluginKey, body),
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

type PluginEditorDrawerProps =
  | {
      mode: 'create';
      categories: PluginCategoryRecord[];
      onClose: () => void;
      onSubmit: (body: Parameters<typeof createPlugin>[0]) => Promise<unknown>;
    }
  | {
      mode: 'edit';
      record: PluginRecord;
      categories: PluginCategoryRecord[];
      onClose: () => void;
      onSubmit: (body: Parameters<typeof updatePlugin>[1]) => Promise<unknown>;
    };

/**
 * Create/edit drawer shared by both plugin mutations.
 *
 * Category and role assignment use the same single-row modal pickers as the
 * Skills admin surface, and the artifact section uses the same three-mode
 * source editor (Drive archive, Drive directory, Git repository).
 */
function PluginEditorDrawer(props: PluginEditorDrawerProps) {
  const copy = usePluginsAdminCopy();
  const isEdit = props.mode === 'edit';
  const record = isEdit ? props.record : null;
  const formId = useId();
  const [pluginKey, setPluginKey] = useState(record?.pluginKey ?? '');
  const [name, setName] = useState(record?.name ?? '');
  const [description, setDescription] = useState(record?.description ?? '');
  const [categoryCode, setCategoryCode] = useState(record?.categoryCode ?? '');
  const [versionLabel, setVersionLabel] = useState(record?.versionLabel ?? '0.0.1');
  const [provider, setProvider] = useState(record?.provider ?? '');
  const [implementationType, setImplementationType] = useState<ImplementationOption>(
    record && isImplementationOption(record.implementationType)
      ? record.implementationType
      : 'sdkwork-native',
  );
  const [visibility, setVisibility] = useState<VisibilityOption>(
    record && isVisibilityOption(record.visibility) ? record.visibility : 'tenant',
  );
  const [installStatus, setInstallStatus] = useState<string>(
    record?.installStatus ?? 'available',
  );
  const [manifest, setManifest] = useState(
    record ? JSON.stringify(record.manifest, null, 2) : '{}',
  );
  const [tags, setTags] = useState(record?.tags.join(', ') ?? '');
  const [allowedRoleCodes, setAllowedRoleCodes] = useState<string[]>(
    record?.allowedRoleCodes ?? [],
  );
  const [source, setSource] = useState<PluginArtifactSource | null>(
    record?.source ?? null,
  );
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const parsedManifest = parseManifest(manifest, copy);
    if (typeof parsedManifest === 'string') {
      setFormError(parsedManifest);
      return;
    }
    if (props.mode === 'create' && !source) {
      setFormError(copy.pluginForm.sourceRequired);
      return;
    }
    if (isEdit && !(INSTALL_STATUS_OPTIONS as readonly string[]).includes(installStatus)) {
      setFormError(copy.errors.installStatusInvalid);
      return;
    }
    setSubmitting(true);
    setFormError(null);
    const common = {
      name: trim(name),
      description: isBlank(description) ? undefined : trim(description),
      categoryCode: isBlank(categoryCode) ? undefined : trim(categoryCode),
      versionLabel: trim(versionLabel),
      provider: isBlank(provider) ? undefined : trim(provider),
      visibility,
      tags: parseTags(tags),
      allowedRoleCodes,
      manifest: parsedManifest,
      ...(source ? { source } : {}),
    };
    const action =
      props.mode === 'create'
        ? props.onSubmit({
            pluginKey: trim(pluginKey),
            implementationType,
            ...common,
          })
        : props.onSubmit({
            ...common,
            installStatus: installStatus as Parameters<typeof updatePlugin>[1]['installStatus'],
          });
    void action
      .catch((cause: unknown) => {
        setFormError(errorMessage(cause));
      })
      .finally(() => {
        setSubmitting(false);
      });
  };

  return (
    <SurfaceDrawer
      open
      title={
        isEdit && record
          ? copy.pluginForm.editTitle(record.name)
          : copy.pluginForm.createTitle
      }
      description={
        isEdit && record
          ? copy.pluginForm.editSubtitle(record.pluginKey, copy.labels.status[record.status])
          : undefined
      }
      onClose={() => {
        if (!submitting) props.onClose();
      }}
      footer={
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            className={SECONDARY_BUTTON_CLASS}
            onClick={props.onClose}
            disabled={submitting}
          >
            {copy.pluginForm.cancel}
          </button>
          <button
            type="submit"
            form={formId}
            className={PRIMARY_BUTTON_CLASS}
            disabled={submitting || (props.mode === 'create' && !source)}
          >
            {isEdit ? copy.pluginForm.save : copy.pluginForm.create}
          </button>
        </div>
      }
    >
      <form id={formId} onSubmit={submit} className="grid gap-4">
        {formError ? (
          <p role="alert" className="text-sm text-red-400">
            {formError}
          </p>
        ) : null}
        {!isEdit ? (
          <Field label={copy.pluginForm.fields.pluginKey}>
            <input
              className={INPUT_CLASS}
              value={pluginKey}
              onChange={(event) => setPluginKey(event.target.value)}
              placeholder={copy.pluginForm.placeholders.pluginKey}
              required
            />
          </Field>
        ) : null}
        <Field label={copy.pluginForm.fields.name}>
          <input
            className={INPUT_CLASS}
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
          />
        </Field>
        <Field label={copy.pluginForm.fields.description}>
          <textarea
            className={`${INPUT_CLASS} min-h-20`}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            rows={3}
          />
        </Field>
        <CategorySelect
          categories={props.categories}
          value={categoryCode}
          onChange={setCategoryCode}
          disabled={submitting}
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={copy.pluginForm.fields.versionLabel}>
            <input
              className={INPUT_CLASS}
              value={versionLabel}
              onChange={(event) => setVersionLabel(event.target.value)}
            />
          </Field>
          {isEdit ? (
            <Field label={copy.pluginForm.fields.installStatus}>
              <select
                className={INPUT_CLASS}
                value={installStatus}
                onChange={(event) => setInstallStatus(event.target.value)}
              >
                {INSTALL_STATUS_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {copy.labels.installStatus[option]}
                  </option>
                ))}
              </select>
            </Field>
          ) : (
            <Field label={copy.pluginForm.fields.implementation}>
              <select
                className={INPUT_CLASS}
                value={implementationType}
                onChange={(event) => {
                  const next = event.target.value;
                  if (isImplementationOption(next)) setImplementationType(next);
                }}
              >
                {IMPLEMENTATION_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </Field>
          )}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={copy.pluginForm.fields.visibility}>
            <select
              className={INPUT_CLASS}
              value={visibility}
              onChange={(event) => {
                const next = event.target.value;
                if (isVisibilityOption(next)) setVisibility(next);
              }}
            >
              {VISIBILITY_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {copy.labels.visibility[option]}
                </option>
              ))}
            </select>
          </Field>
          <Field label={copy.pluginForm.fields.provider}>
            <input
              className={INPUT_CLASS}
              value={provider}
              onChange={(event) => setProvider(event.target.value)}
            />
          </Field>
        </div>
        <Field label={copy.pluginForm.fields.tags}>
          <input
            className={INPUT_CLASS}
            value={tags}
            onChange={(event) => setTags(event.target.value)}
          />
        </Field>
        <RoleMultiSelect
          value={allowedRoleCodes}
          onChange={setAllowedRoleCodes}
          disabled={submitting}
        />
        <ArtifactSourceField
          driveClient={getPluginsAdminDriveSdkClient()}
          value={source}
          onChange={setSource}
          disabled={submitting}
        />
        <Field label={copy.pluginForm.fields.manifest}>
          <textarea
            className={`${INPUT_CLASS} font-mono text-xs`}
            value={manifest}
            onChange={(event) => setManifest(event.target.value)}
            rows={5}
          />
        </Field>
      </form>
    </SurfaceDrawer>
  );
}

/**
 * (`/backend/v3/api/plugin_categories`): list and upsert categories.
 *
 * The list pages on the server: the table renders exactly the rows the endpoint
 * returns and derives nothing from the whole registry (no parent options, no
 * counts, no client-side overwrite detection — the upsert modal is a free-text
 * form), so the requested `page`/`pageSize` window is the complete view and
 * `pageInfo.totalItems` supplies the size of the registry.
 */
export function PluginCategoriesPage() {
  const copy = usePluginsAdminCopy();
  const locale = usePluginsAdminLocale();
  const [records, setRecords] = useState<PluginCategoryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [upsertOpen, setUpsertOpen] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  /** 1-based page requested from the category endpoint. */
  const [page, setPage] = useState(1);
  /** Rows requested per page; the bar offers the shared size options. */
  const [pageSize, setPageSize] = useState(DEFAULT_ADMIN_LIST_PAGE_SIZE);
  /** Rows in the registry across every page (`pageInfo.totalItems`). */
  const [totalItems, setTotalItems] = useState(0);

  const reload = useCallback(() => {
    setReloadToken((token) => token + 1);
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    listPluginCategories({ page, pageSize })
      .then((categoryPage) => {
        if (!active) return;
        const total = pageInfoTotalItems(categoryPage.pageInfo);
        setRecords(categoryPage.items);
        setTotalItems(total);
        setError(null);
        // An upsert that reshapes the registry or a larger page size can leave
        // the current page past the end of the result set: fall back to the
        // last populated page. The clamp targets a page the response already
        // covers, so the follow-up load is in range and cannot loop.
        const lastPage = lastPageFor(total, pageSize);
        if (page > lastPage) {
          setPage(lastPage);
        }
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
  }, [reloadToken, page, pageSize]);

  /**
   * A different page size renumbers every row, so the list restarts at page 1.
   */
  const changePageSize = (next: number) => {
    setPageSize(next);
    setPage(1);
  };

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
      <header className="admin-page-header">
        <div>
          <h1 className="admin-page-header__title">{copy.categories.title}</h1>
          <p className="admin-page-header__description">{copy.categories.description}</p>
        </div>
        <div className="admin-page-header__actions">
          <button
            type="button"
            className={PRIMARY_BUTTON_CLASS}
            onClick={() => setUpsertOpen(true)}
          >
            {copy.categories.newCategory}
          </button>
        </div>
      </header>

      {error ? (
        <div role="alert" className="admin-alert admin-alert--error">
          {error}
        </div>
      ) : null}
      {notice ? (
        <div role="status" className="admin-alert admin-alert--success">
          {notice}
        </div>
      ) : null}

      <div className="data-surface">
        <div className="table-frame">
          {records.length === 0 ? (
            <p className="admin-list-state">
              {loading ? copy.categories.loading : copy.categories.empty}
            </p>
          ) : (
            <table className="admin-list-table">
              <thead>
                <tr>
                  <th>{copy.categories.table.category}</th>
                  <th>{copy.categories.table.code}</th>
                  <th>{copy.categories.table.sortOrder}</th>
                  <th>{copy.categories.table.status}</th>
                  <th>{copy.categories.table.updated}</th>
                </tr>
              </thead>
              <tbody>
                {records.map((record) => (
                  <tr key={record.id}>
                    <td>
                      <span className="admin-list-table__primary">{record.name}</span>
                      {record.description ? (
                        <span className="admin-list-table__secondary">{record.description}</span>
                      ) : null}
                    </td>
                    <td>
                      <code className="font-mono text-xs">{record.categoryCode}</code>
                    </td>
                    <td>{record.sortOrder}</td>
                    <td>
                      <Badge tone={statusTone(record.lifecycleStatus)}>
                        {copy.labels.status[record.lifecycleStatus]}
                      </Badge>
                    </td>
                    <td className="text-xs" title={record.updatedAt}>
                      {formatTimestamp(record.updatedAt, locale)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        {records.length > 0 ? (
          <AdminListPagination
            page={page}
            pageSize={pageSize}
            itemCount={records.length}
            totalItems={totalItems}
            hasNextPage={page * pageSize < totalItems}
            copy={copy.pagination}
            disabled={loading}
            onPageChange={setPage}
            onPageSizeChange={changePageSize}
          />
        ) : null}
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
          <label className="admin-field">
            <span className={LABEL_TEXT_CLASS}>{copy.categoryForm.fields.categoryCode}</span>
            <input
              className={INPUT_CLASS}
              value={categoryCode}
              onChange={(event) => setCategoryCode(event.target.value)}
              placeholder={copy.categoryForm.placeholders.categoryCode}
              required
            />
          </label>
          <label className="admin-field">
            <span className={LABEL_TEXT_CLASS}>{copy.categoryForm.fields.name}</span>
            <input
              className={INPUT_CLASS}
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
            />
          </label>
          <label className="admin-field">
            <span className={LABEL_TEXT_CLASS}>{copy.categoryForm.fields.description}</span>
            <textarea
              className={INPUT_CLASS}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={2}
            />
          </label>
          <label className="admin-field">
            <span className={LABEL_TEXT_CLASS}>{copy.categoryForm.fields.sortOrder}</span>
            <input
              className={INPUT_CLASS}
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
          <button type="button" className={SECONDARY_BUTTON_CLASS} onClick={onClose}>
            {copy.categoryForm.cancel}
          </button>
          <button type="submit" className={PRIMARY_BUTTON_CLASS} disabled={submitting}>
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
