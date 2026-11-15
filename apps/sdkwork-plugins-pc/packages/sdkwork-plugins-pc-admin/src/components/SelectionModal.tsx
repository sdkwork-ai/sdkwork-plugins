import { useId, useMemo, useState, type KeyboardEvent } from 'react';

import { useFocusTrap } from './useFocusTrap';

/** One selectable row inside the picker dialog. */
export interface SelectionOption {
  value: string;
  label: string;
  /** Secondary line, for example the raw code or the required permission. */
  description?: string;
}

export interface SelectionModalProps {
  open: boolean;
  title: string;
  description?: string;
  options: readonly SelectionOption[];
  /** Committed selection; the dialog edits a draft until confirm. */
  value: readonly string[];
  onConfirm: (next: string[]) => void;
  onCancel: () => void;
  searchPlaceholder: string;
  noMatchLabel: string;
  selectedCountLabel: (count: number) => string;
  cancelLabel: string;
  confirmLabel: string;
  clearLabel?: string;
  /** Optional row that clears the selection, used for "all roles". */
  emptyOptionLabel?: string;
  /** Render a radio group instead of checkboxes for single-value fields. */
  singleSelect?: boolean;
  closeLabel: string;
}

const SECONDARY_BUTTON_CLASS =
  'rounded-md border border-zinc-700 bg-zinc-800/60 px-3 py-1.5 text-sm text-zinc-200 hover:bg-zinc-700/60 disabled:opacity-60';
const PRIMARY_BUTTON_CLASS =
  'rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-60';

/**
 * Reusable multi-select dialog for compact form fields.
 *
 * Categories, roles, and future skill metadata all share the same interaction:
 * one summary row in the drawer opens this dialog, the operator filters and
 * toggles options, and the committed value changes only on confirm. The dialog
 * traps focus, closes on Escape, and restores focus to the trigger afterwards.
 */
export function SelectionModal({
  open,
  title,
  description,
  options,
  value,
  onConfirm,
  onCancel,
  searchPlaceholder,
  noMatchLabel,
  selectedCountLabel,
  cancelLabel,
  confirmLabel,
  clearLabel,
  emptyOptionLabel,
  singleSelect = false,
  closeLabel,
}: SelectionModalProps) {
  const titleId = useId();
  const descriptionId = useId();
  const optionGroupName = useId();
  const [draft, setDraft] = useState<readonly string[]>(value);
  const [keyword, setKeyword] = useState('');
  const [wasOpen, setWasOpen] = useState(open);

  // Entering the dialog always starts from the committed selection. Adjusting
  // during render (instead of in an effect) avoids flashing stale checkboxes.
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setDraft(value);
      setKeyword('');
    }
  }

  const { containerRef, onKeyDown } = useFocusTrap<HTMLDivElement>(open, '[data-autofocus]');

  const visibleOptions = useMemo(() => {
    const query = keyword.trim().toLowerCase();
    if (!query) return options;
    return options.filter((option) => {
      const haystack = [option.label, option.value, option.description ?? '']
        .join('\n')
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [keyword, options]);

  if (!open) return null;

  function toggle(optionValue: string) {
    setDraft((current) =>
      current.includes(optionValue)
        ? current.filter((item) => item !== optionValue)
        : [...current, optionValue],
    );
  }

  function handlePanelKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      onCancel();
      return;
    }
    // The picker lives inside the drawer form. Enter inside an input must not
    // submit that outer form; the dialog has its own explicit confirm action.
    if (event.key === 'Enter' && event.target instanceof HTMLInputElement) {
      event.preventDefault();
      return;
    }
    onKeyDown(event);
  }

  return (
    <div
      className="sdkwork-selection-modal-root fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4 backdrop-blur-[2px]"
      role="presentation"
    >
      <button
        type="button"
        tabIndex={-1}
        className="sdkwork-selection-modal-backdrop absolute inset-0 cursor-default"
        aria-label={closeLabel}
        onClick={onCancel}
      />
      <div
        ref={containerRef}
        className="sdkwork-selection-modal-panel relative flex max-h-[80vh] w-full max-w-lg flex-col overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900 shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        onKeyDown={handlePanelKeyDown}
      >
        <header className="flex items-start justify-between gap-4 border-b border-zinc-800 px-5 py-4">
          <div className="min-w-0">
            <h3 id={titleId} className="text-base font-semibold text-zinc-100">
              {title}
            </h3>
            {description ? (
              <p id={descriptionId} className="mt-1 text-sm text-zinc-400">
                {description}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            className="rounded p-1 text-lg leading-none text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
            onClick={onCancel}
            aria-label={closeLabel}
          >
            ×
          </button>
        </header>

        <div className="border-b border-zinc-800 px-5 py-3">
          <input
            type="search"
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') event.preventDefault();
            }}
            placeholder={searchPlaceholder}
            aria-label={searchPlaceholder}
            data-autofocus
            className="w-full rounded-md border border-zinc-700 bg-zinc-800/60 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-3">
          <div className="grid gap-1">
            {emptyOptionLabel ? (
              <label className="flex items-center gap-2.5 rounded-md border border-zinc-700/70 bg-zinc-800/40 px-2.5 py-2 text-sm font-medium text-zinc-200">
                <input
                  type={singleSelect ? 'radio' : 'checkbox'}
                  name={singleSelect ? optionGroupName : undefined}
                  checked={draft.length === 0}
                  onChange={() => setDraft([])}
                  className="size-4 rounded border-zinc-600 bg-zinc-800"
                />
                <span>{emptyOptionLabel}</span>
              </label>
            ) : null}
            {visibleOptions.length === 0 ? (
              <p className="px-2 py-6 text-center text-sm text-zinc-500">{noMatchLabel}</p>
            ) : (
              visibleOptions.map((option) => (
                <label
                  key={option.value}
                  className="flex items-start gap-2.5 rounded-md px-2.5 py-2 text-sm hover:bg-zinc-800/60"
                >
                  <input
                    type={singleSelect ? 'radio' : 'checkbox'}
                    name={singleSelect ? optionGroupName : undefined}
                    checked={draft.includes(option.value)}
                    onChange={() =>
                      singleSelect ? setDraft([option.value]) : toggle(option.value)
                    }
                    className="mt-0.5 size-4 rounded border-zinc-600 bg-zinc-800"
                  />
                  <span className="min-w-0">
                    <span className="block text-zinc-200">{option.label}</span>
                    {option.description ? (
                      <span className="mt-0.5 block break-all font-mono text-xs text-zinc-500">
                        {option.description}
                      </span>
                    ) : null}
                  </span>
                </label>
              ))
            )}
          </div>
        </div>

        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-zinc-800 px-5 py-3">
          <div className="flex items-center gap-2 text-sm text-zinc-400">
            <span>{selectedCountLabel(draft.length)}</span>
            {clearLabel && draft.length > 0 ? (
              <button
                type="button"
                className="rounded px-2 py-1 text-xs text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
                onClick={() => setDraft([])}
              >
                {clearLabel}
              </button>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            <button type="button" className={SECONDARY_BUTTON_CLASS} onClick={onCancel}>
              {cancelLabel}
            </button>
            <button
              type="button"
              className={PRIMARY_BUTTON_CLASS}
              onClick={() => onConfirm([...draft])}
            >
              {confirmLabel}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
