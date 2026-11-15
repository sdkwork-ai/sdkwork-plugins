import { useState } from 'react';

import { usePluginsAdminCopy } from '../copy/pluginsAdminCopy';
import {
  PLUGIN_ASSIGNABLE_ROLES,
  normalizeAllowedRoleCodes,
  type PluginAssignableRole,
} from './pluginsRoleCatalog';
import { SelectionField } from './SelectionField';
import { SelectionModal } from './SelectionModal';

/**
 * Multi-select for the IAM roles a managed plugin is assigned to.
 *
 * An empty selection means every role can see the plugin, so "All roles" is
 * the first row of the picker and clears every specific role.
 */
export function RoleMultiSelect({
  value,
  onChange,
  disabled = false,
}: {
  value: readonly string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
}) {
  const copy = usePluginsAdminCopy();
  const [open, setOpen] = useState(false);
  const selected = new Set(value);
  const known = new Set(PLUGIN_ASSIGNABLE_ROLES.map((role) => role.code));
  const extras: PluginAssignableRole[] = [...selected]
    .filter((code) => !known.has(code))
    .sort()
    .map((code) => ({ code, label: copy.roles.customRole }));
  const roles = [...PLUGIN_ASSIGNABLE_ROLES, ...extras];
  const localizedLabels: Record<string, string> = copy.roles.labels;

  function labelFor(code: string): string {
    return localizedLabels[code] ?? roles.find((role) => role.code === code)?.label ?? code;
  }

  const chips = roles
    .filter((role) => selected.has(role.code))
    .map((role) => ({ key: role.code, label: labelFor(role.code) }));
  const options = roles.map((role) => ({
    value: role.code,
    label: labelFor(role.code),
    description: role.code,
  }));

  return (
    <>
      <SelectionField
        label={copy.roles.legend}
        placeholder={copy.roles.allRoles}
        selected={chips}
        onOpen={() => setOpen(true)}
        disabled={disabled}
        expanded={open}
        tone="zinc"
      />
      <SelectionModal
        open={open}
        title={copy.roles.modalTitle}
        description={copy.roles.modalDescription}
        options={options}
        value={value}
        onCancel={() => setOpen(false)}
        onConfirm={(next) => {
          setOpen(false);
          onChange(normalizeAllowedRoleCodes(next));
        }}
        searchPlaceholder={copy.selection.searchPlaceholder}
        noMatchLabel={copy.selection.noMatch}
        selectedCountLabel={copy.selection.selectedCount}
        cancelLabel={copy.selection.cancel}
        confirmLabel={copy.selection.confirm}
        clearLabel={copy.selection.clear}
        emptyOptionLabel={copy.roles.allRoles}
        closeLabel={copy.overlay.close}
      />
    </>
  );
}
