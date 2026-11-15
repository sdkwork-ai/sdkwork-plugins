/**
 * IAM roles assignable to a managed plugin.
 *
 * Mirrors the Skill package role catalog so both admin surfaces offer the same
 * default role set. Unknown organization-defined codes remain selectable when
 * they already exist on a record.
 */
export interface PluginAssignableRole {
  code: string;
  label: string;
}

export const PLUGIN_ASSIGNABLE_ROLES: readonly PluginAssignableRole[] = [
  { code: 'app_user', label: 'App user' },
  { code: 'org_admin', label: 'Organization admin' },
  { code: 'org_assistant', label: 'Organization assistant' },
  { code: 'org_auditor', label: 'Organization auditor' },
  { code: 'org_finance', label: 'Organization finance' },
  { code: 'org_operations', label: 'Organization operations' },
  { code: 'platform_system_admin', label: 'Platform system admin' },
  { code: 'platform_super_admin', label: 'Platform super admin' },
  { code: 'skills_admin_operator', label: 'Skills admin operator' },
  { code: 'skills_marketplace_user', label: 'Skills marketplace user' },
];

const ROLE_CODE_PATTERN = /^[a-z][a-z0-9_.-]{0,127}$/;

export function normalizeAllowedRoleCodes(codes: readonly string[]): string[] {
  const unique = new Set<string>();
  for (const code of codes) {
    const normalized = code.trim();
    if (ROLE_CODE_PATTERN.test(normalized)) {
      unique.add(normalized);
    }
  }
  return [...unique].sort();
}
