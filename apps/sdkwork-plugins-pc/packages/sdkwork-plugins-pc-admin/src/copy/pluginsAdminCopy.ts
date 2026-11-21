import { useEffect, useState } from 'react';

/**
 * Local copy bundle for the managed plugin and plugin category administration
 * blocks.
 *
 * The block is mounted by several hosts, so it carries its own English and
 * Chinese copy instead of depending on host-specific translation keys. The
 * language is read from the host document language (`<html lang>`), which both
 * the Cloud Router admin shell and the Plugins shell keep in sync with their
 * i18n instance.
 */
const en = {
  overlay: {
    close: 'Close',
  },
  selection: {
    searchPlaceholder: 'Search…',
    noMatch: 'No matching options.',
    selectedCount: (count: number) => `${count} selected`,
    clear: 'Clear selection',
    cancel: 'Cancel',
    confirm: 'Apply',
  },
  roles: {
    legend: 'Visible to roles',
    allRoles: 'All roles (default)',
    customRole: 'Custom role',
    modalTitle: 'Select visible roles',
    modalDescription:
      'The plugin is visible to every selected role. Leave the selection empty to keep it visible to all roles.',
    labels: {} as Record<string, string>,
  },
  artifactSource: {
    legend: 'Artifact source',
    hint: 'Choose how the plugin package content is provided.',
    mode: {
      driveFile: 'Upload archive',
      driveDirectory: 'Drive directory',
      git: 'Git repository',
    },
    driveFile: {
      archive: 'Package archive',
      chooseHint:
        'Upload a .zip, .tar, .gz, .tgz or .skillpkg archive through sdkwork-drive.',
      upload: 'Upload archive',
      uploading: 'Uploading…',
      uploaded: (name: string) => `Uploaded: ${name}`,
      missingFile: 'Select a package archive to upload through sdkwork-drive.',
      ref: 'Drive artifact',
    },
    driveDirectory: {
      choose: 'Select a directory',
      placeholder: 'Select a sdkwork-drive directory',
      selected: (path: string) => `Selected: ${path}`,
      pickerTitle: 'Select a sdkwork-drive directory',
      pickerDescription: 'Pick the directory that contains the plugin package.',
      space: 'Drive space',
      root: 'Root',
      empty: 'No folders in this directory.',
      noSpaces: 'No sdkwork-drive spaces are available.',
      loading: 'Loading directories…',
      error: 'Unable to load sdkwork-drive directories.',
      selectCurrent: 'Select this directory',
      selectRootHint: 'Open a folder before selecting it.',
      cancel: 'Cancel',
      confirm: 'Select directory',
    },
    git: {
      repositoryUrl: 'Git repository URL',
      repositoryUrlPlaceholder: 'https://github.com/org/repo.git',
      repositoryPath: 'Path in repository',
      repositoryPathPlaceholder: 'plugins/my-plugin',
      gitRef: 'Branch, tag, or commit',
      gitRefPlaceholder: 'main (optional)',
      hint: 'Only https clone URLs are supported. The path is relative to the repository root; use . for the root.',
      invalidUrl: 'Enter a full https Git repository URL.',
      invalidPath: 'Enter a relative repository path (no leading / or ..).',
      invalidRef: 'Use a branch, tag, or commit id without spaces or ..',
    },
  },
  plugins: {
    title: 'Plugin Management',
    description: 'Managed plugins served through the backend administration API.',
    newPlugin: 'New plugin',
    refresh: 'Refresh',
    loading: 'Loading plugins…',
    empty: 'No managed plugins yet',
    emptyFiltered: 'No plugins match the current filters',
    clearFilters: 'Clear filters',
    total: (count: number) => `${count} ${count === 1 ? 'plugin' : 'plugins'}`,
    filterLabel: 'Filter by keyword',
    filterPlaceholder: 'name, key, tag, provider',
    filters: {
      categoryLabel: 'Category',
      allCategories: 'All categories',
      roleScopeLabel: 'Data scope',
      roleScopeAll: 'All data',
      roleScopeMine: 'My roles',
      roleScopeUnavailable: 'The host did not supply the operator role codes.',
    },
    table: {
      plugin: 'Plugin',
      category: 'Category',
      implementation: 'Implementation',
      visibility: 'Visibility',
      status: 'Status',
      install: 'Install',
      version: 'Version',
      updated: 'Updated',
      actions: 'Actions',
    },
    actions: {
      edit: 'Edit',
      delete: 'Delete',
    },
    transitions: {
      activate: 'Activate',
      disable: 'Disable',
      archive: 'Archive',
    },
    confirmDelete: (name: string, pluginKey: string) =>
      `Delete plugin ${name} (${pluginKey})? The record is soft-deleted and leaves the catalog.`,
    notices: {
      created: 'Plugin created',
      updated: (name: string) => `Plugin ${name} updated`,
      deleted: (name: string) => `Plugin ${name} deleted`,
      statusChanged: (name: string, status: string) => `Plugin ${name} is now ${status}`,
    },
  },
  pluginForm: {
    fields: {
      pluginKey: 'Plugin key',
      name: 'Name',
      description: 'Description',
      category: 'Category',
      versionLabel: 'Version label',
      implementation: 'Implementation',
      visibility: 'Visibility',
      installStatus: 'Install status',
      provider: 'Provider',
      tags: 'Tags (comma separated)',
      manifest: 'Manifest (JSON object)',
    },
    placeholders: {
      pluginKey: 'web-search',
    },
    uncategorized: 'Uncategorized',
    categoryPickerTitle: 'Select plugin category',
    categoryPickerDescription:
      'Choose the marketplace category this plugin is filed under.',
    cancel: 'Cancel',
    createTitle: 'Create plugin',
    create: 'Create',
    editTitle: (name: string) => `Edit plugin ${name}`,
    editSubtitle: (pluginKey: string, status: string) => `${pluginKey} · status ${status}`,
    save: 'Save',
    sourceRequired: 'Select an artifact source before creating the plugin.',
  },
  categories: {
    title: 'Plugin Categories',
    description: 'Marketplace category registry served through the backend administration API.',
    newCategory: 'New category',
    loading: 'Loading categories…',
    empty: 'No plugin categories yet',
    total: (count: number) => `${count} ${count === 1 ? 'category' : 'categories'}`,
    table: {
      category: 'Category',
      code: 'Code',
      sortOrder: 'Sort order',
      status: 'Status',
      updated: 'Updated',
    },
    notices: {
      saved: (name: string) => `Category ${name} saved`,
    },
  },
  categoryForm: {
    fields: {
      categoryCode: 'Category code',
      name: 'Name',
      description: 'Description',
      sortOrder: 'Sort order',
    },
    placeholders: {
      categoryCode: 'search-tools',
    },
    title: 'Upsert category',
    cancel: 'Cancel',
    save: 'Save',
  },
  labels: {
    status: {
      draft: 'Draft',
      active: 'Active',
      disabled: 'Disabled',
      archived: 'Archived',
      deleted: 'Deleted',
    },
    visibility: {
      private: 'Private',
      organization: 'Organization',
      tenant: 'Tenant',
      public: 'Public',
    },
    installStatus: {
      available: 'Available',
      installed: 'Installed',
      disabled: 'Disabled',
    },
  },
  errors: {
    manifestNotObject: 'Manifest must be a JSON object',
    manifestNotJson: 'Manifest is not valid JSON',
    installStatusInvalid: 'Install status must be available, installed, or disabled',
    sortOrderInvalid: 'Sort order must be an integer',
    runtimeNotConfigured:
      'Plugins admin runtime is not configured: call configurePluginsAdminRuntime({ getBackendSdkClient, getDriveSdkClient }) before rendering PluginsPage',
  },
};

export type PluginsAdminCopy = typeof en;

const zh: PluginsAdminCopy = {
  overlay: {
    close: '关闭',
  },
  selection: {
    searchPlaceholder: '搜索…',
    noMatch: '无匹配项',
    selectedCount: (count) => `已选 ${count} 项`,
    clear: '清空选择',
    cancel: '取消',
    confirm: '确定',
  },
  roles: {
    legend: '可见角色',
    allRoles: '全部角色（默认）',
    customRole: '自定义角色',
    modalTitle: '选择可见角色',
    modalDescription: '插件对所选角色可见；不选择任何角色时，默认对全部角色可见。',
    labels: {
      app_user: '应用用户',
      org_admin: '组织管理员',
      org_assistant: '组织助理',
      org_auditor: '组织审计员',
      org_finance: '组织财务',
      org_operations: '组织运营',
      platform_system_admin: '平台系统管理员',
      platform_super_admin: '平台超级管理员',
      skills_admin_operator: '技能运营管理员',
      skills_marketplace_user: '技能市场用户',
    },
  },
  artifactSource: {
    legend: '产物来源',
    hint: '选择插件包内容的提供方式。',
    mode: {
      driveFile: '本地压缩包',
      driveDirectory: 'Drive 目录',
      git: 'Git 仓库',
    },
    driveFile: {
      archive: '插件包压缩包',
      chooseHint: '通过 sdkwork-drive 上传 .zip、.tar、.gz、.tgz 或 .skillpkg 压缩包。',
      upload: '上传压缩包',
      uploading: '上传中…',
      uploaded: (name) => `已上传：${name}`,
      missingFile: '请选择要通过 sdkwork-drive 上传的插件包压缩包。',
      ref: 'Drive 产物',
    },
    driveDirectory: {
      choose: '选择目录',
      placeholder: '选择 sdkwork-drive 目录',
      selected: (path) => `已选择：${path}`,
      pickerTitle: '选择 sdkwork-drive 目录',
      pickerDescription: '选择包含插件包内容的目录。',
      space: 'Drive 空间',
      root: '根目录',
      empty: '该目录下没有子目录。',
      noSpaces: '没有可用的 sdkwork-drive 空间。',
      loading: '正在加载目录…',
      error: '无法加载 sdkwork-drive 目录。',
      selectCurrent: '选择当前目录',
      selectRootHint: '请先进入一个目录再选择。',
      cancel: '取消',
      confirm: '选择目录',
    },
    git: {
      repositoryUrl: 'Git 仓库地址',
      repositoryUrlPlaceholder: 'https://github.com/org/repo.git',
      repositoryPath: '仓库内路径',
      repositoryPathPlaceholder: 'plugins/my-plugin',
      gitRef: '分支 / 标签 / 提交',
      gitRefPlaceholder: 'main（可选）',
      hint: '仅支持 https 克隆地址；路径相对于仓库根目录，根目录请填写 .。',
      invalidUrl: '请填写完整的 https Git 仓库地址。',
      invalidPath: '请填写相对仓库路径（不能以 / 开头，不能包含 ..）。',
      invalidRef: '请填写不含空格和 .. 的分支、标签或提交标识。',
    },
  },
  plugins: {
    title: '插件管理',
    description: '通过后端管理接口提供受管插件。',
    newPlugin: '新建插件',
    refresh: '刷新',
    loading: '正在加载插件…',
    empty: '暂无受管插件',
    emptyFiltered: '没有符合当前筛选条件的插件',
    clearFilters: '清除筛选',
    total: (count) => `共 ${count} 个插件`,
    filterLabel: '按关键词筛选',
    filterPlaceholder: '名称、标识、标签、提供方',
    filters: {
      categoryLabel: '分类',
      allCategories: '全部分类',
      roleScopeLabel: '数据范围',
      roleScopeAll: '全部数据',
      roleScopeMine: '我的角色',
      roleScopeUnavailable: '宿主未提供当前操作者的角色编码。',
    },
    table: {
      plugin: '插件',
      category: '分类',
      implementation: '实现方式',
      visibility: '可见范围',
      status: '状态',
      install: '安装状态',
      version: '版本',
      updated: '更新时间',
      actions: '操作',
    },
    actions: {
      edit: '编辑',
      delete: '删除',
    },
    transitions: {
      activate: '启用',
      disable: '停用',
      archive: '归档',
    },
    confirmDelete: (name, pluginKey) =>
      `确定删除插件 ${name}（${pluginKey}）？该记录将被软删除并移出插件目录。`,
    notices: {
      created: '插件已创建',
      updated: (name) => `插件「${name}」已更新`,
      deleted: (name) => `插件「${name}」已删除`,
      statusChanged: (name, status) => `插件「${name}」已切换为「${status}」`,
    },
  },
  pluginForm: {
    fields: {
      pluginKey: '插件标识',
      name: '名称',
      description: '描述',
      category: '插件分类',
      versionLabel: '版本标签',
      implementation: '实现方式',
      visibility: '可见范围',
      installStatus: '安装状态',
      provider: '提供方',
      tags: '标签（逗号分隔）',
      manifest: '清单（JSON 对象）',
    },
    placeholders: {
      pluginKey: 'web-search',
    },
    uncategorized: '未分类',
    categoryPickerTitle: '选择插件分类',
    categoryPickerDescription: '选择该插件归档的市场分类。',
    cancel: '取消',
    createTitle: '创建插件',
    create: '创建',
    editTitle: (name) => `编辑插件 ${name}`,
    editSubtitle: (pluginKey, status) => `${pluginKey} · 状态 ${status}`,
    save: '保存',
    sourceRequired: '创建插件前，请先选择产物来源。',
  },
  categories: {
    title: '插件分类管理',
    description: '通过后端管理接口提供插件市场分类注册表。',
    newCategory: '新建分类',
    loading: '正在加载分类…',
    empty: '暂无插件分类',
    total: (count) => `共 ${count} 个分类`,
    table: {
      category: '分类',
      code: '编码',
      sortOrder: '排序值',
      status: '状态',
      updated: '更新时间',
    },
    notices: {
      saved: (name) => `分类「${name}」已保存`,
    },
  },
  categoryForm: {
    fields: {
      categoryCode: '分类编码',
      name: '名称',
      description: '描述',
      sortOrder: '排序值',
    },
    placeholders: {
      categoryCode: 'search-tools',
    },
    title: '保存分类',
    cancel: '取消',
    save: '保存',
  },
  labels: {
    status: {
      draft: '草稿',
      active: '启用',
      disabled: '停用',
      archived: '归档',
      deleted: '已删除',
    },
    visibility: {
      private: '私有',
      organization: '组织',
      tenant: '租户',
      public: '公开',
    },
    installStatus: {
      available: '可用',
      installed: '已安装',
      disabled: '已停用',
    },
  },
  errors: {
    manifestNotObject: '清单必须是 JSON 对象',
    manifestNotJson: '清单不是合法的 JSON',
    installStatusInvalid: '安装状态必须是 available、installed 或 disabled 之一',
    sortOrderInvalid: '排序值必须是整数',
    runtimeNotConfigured:
      '插件管理运行时尚未配置：请在渲染 PluginsPage 之前调用 configurePluginsAdminRuntime({ getBackendSdkClient, getDriveSdkClient })',
  },
};

export const PLUGINS_ADMIN_COPY: Record<'en' | 'zh', PluginsAdminCopy> = { en, zh };

function documentLanguage(): 'en' | 'zh' {
  if (typeof document === 'undefined') {
    return 'en';
  }
  return document.documentElement.lang.toLowerCase().startsWith('zh') ? 'zh' : 'en';
}

/** Resolve the copy bundle for the current host document language, outside React. */
export function resolvePluginsAdminCopy(): PluginsAdminCopy {
  return PLUGINS_ADMIN_COPY[documentLanguage()];
}

export function usePluginsAdminLocale(): 'en' | 'zh' {
  const [language, setLanguage] = useState(documentLanguage);
  useEffect(() => {
    const update = () => setLanguage(documentLanguage());
    update();
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['lang'],
    });
    return () => observer.disconnect();
  }, []);
  return language;
}

export function usePluginsAdminCopy(): PluginsAdminCopy {
  const language = usePluginsAdminLocale();
  return PLUGINS_ADMIN_COPY[language];
}
