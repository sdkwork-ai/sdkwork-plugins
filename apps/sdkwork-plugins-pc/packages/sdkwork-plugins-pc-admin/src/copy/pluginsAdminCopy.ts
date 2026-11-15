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
  plugins: {
    title: 'Plugin Management',
    description: 'Managed plugins served through the backend administration API.',
    newPlugin: 'New plugin',
    loading: 'Loading plugins…',
    empty: 'No managed plugins yet',
    filterLabel: 'Filter by keyword',
    filterPlaceholder: 'name, key, tag, provider',
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
    cancel: 'Cancel',
    createTitle: 'Create plugin',
    create: 'Create',
    editTitle: (name: string) => `Edit plugin ${name}`,
    editSubtitle: (pluginKey: string, status: string) => `${pluginKey} · status ${status}`,
    save: 'Save',
  },
  categories: {
    title: 'Plugin Categories',
    description: 'Marketplace category registry served through the backend administration API.',
    newCategory: 'New category',
    loading: 'Loading categories…',
    empty: 'No plugin categories yet',
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
      'Plugins admin runtime is not configured: call configurePluginsAdminRuntime({ getBackendSdkClient }) before rendering PluginsPage',
  },
};

export type PluginsAdminCopy = typeof en;

const zh: PluginsAdminCopy = {
  plugins: {
    title: '插件管理',
    description: '通过后端管理接口提供受管插件。',
    newPlugin: '新建插件',
    loading: '正在加载插件…',
    empty: '暂无受管插件',
    filterLabel: '按关键词筛选',
    filterPlaceholder: '名称、标识、标签、提供方',
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
    cancel: '取消',
    createTitle: '创建插件',
    create: '创建',
    editTitle: (name) => `编辑插件 ${name}`,
    editSubtitle: (pluginKey, status) => `${pluginKey} · 状态 ${status}`,
    save: '保存',
  },
  categories: {
    title: '插件分类管理',
    description: '通过后端管理接口提供插件市场分类注册表。',
    newCategory: '新建分类',
    loading: '正在加载分类…',
    empty: '暂无插件分类',
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
      '插件管理运行时尚未配置：请在渲染 PluginsPage 之前调用 configurePluginsAdminRuntime({ getBackendSdkClient })',
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
