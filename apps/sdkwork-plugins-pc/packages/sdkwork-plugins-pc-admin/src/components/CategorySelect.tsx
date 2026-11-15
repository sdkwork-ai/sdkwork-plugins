import { useState } from 'react';

import type { PluginCategoryRecord } from '@sdkwork/plugins-backend-sdk';

import { usePluginsAdminCopy } from '../copy/pluginsAdminCopy';
import { SelectionField } from './SelectionField';
import { SelectionModal } from './SelectionModal';

/**
 * Single-row category picker for a managed plugin.
 *
 * Plugins carry one category code, so the shared selection dialog runs in
 * single-select/radio mode and the "Uncategorized" row clears the value.
 */
export function CategorySelect({
  categories,
  value,
  onChange,
  disabled = false,
}: {
  categories: readonly PluginCategoryRecord[];
  value: string;
  onChange: (categoryCode: string) => void;
  disabled?: boolean;
}) {
  const copy = usePluginsAdminCopy();
  const [open, setOpen] = useState(false);
  const selected = categories.find((category) => category.categoryCode === value);
  const chips = selected
    ? [{ key: selected.categoryCode, label: selected.name }]
    : value
      ? [{ key: value, label: value }]
      : [];

  const options = categories.map((category) => ({
    value: category.categoryCode,
    label: category.name,
    description: [category.categoryCode, category.description ?? '']
      .filter(Boolean)
      .join(' · '),
  }));

  return (
    <>
      <SelectionField
        label={copy.pluginForm.fields.category}
        placeholder={copy.pluginForm.uncategorized}
        selected={chips}
        onOpen={() => setOpen(true)}
        disabled={disabled}
        expanded={open}
        tone="blue"
      />
      <SelectionModal
        open={open}
        title={copy.pluginForm.categoryPickerTitle}
        description={copy.pluginForm.categoryPickerDescription}
        options={options}
        value={value ? [value] : []}
        onCancel={() => setOpen(false)}
        onConfirm={(next) => {
          setOpen(false);
          onChange(next[0] ?? '');
        }}
        searchPlaceholder={copy.selection.searchPlaceholder}
        noMatchLabel={copy.selection.noMatch}
        selectedCountLabel={copy.selection.selectedCount}
        cancelLabel={copy.selection.cancel}
        confirmLabel={copy.selection.confirm}
        clearLabel={copy.selection.clear}
        emptyOptionLabel={copy.pluginForm.uncategorized}
        singleSelect
        closeLabel={copy.overlay.close}
      />
    </>
  );
}
