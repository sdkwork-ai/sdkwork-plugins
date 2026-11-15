import { useId } from 'react';

/** A selected value rendered as a chip inside the picker trigger. */
export interface SelectionChip {
  key: string;
  label: string;
}

export interface SelectionFieldProps {
  /** Visible field label, for example "Categories". */
  label: string;
  /** Text shown when nothing is selected. */
  placeholder: string;
  selected: readonly SelectionChip[];
  onOpen: () => void;
  disabled?: boolean;
  expanded?: boolean;
  tone?: 'blue' | 'zinc';
  hint?: string;
}

const CHIP_CLASS: Record<NonNullable<SelectionFieldProps['tone']>, string> = {
  blue: 'rounded-full bg-blue-500/15 px-2 py-0.5 text-xs font-medium text-blue-300',
  zinc: 'rounded-full bg-zinc-700/70 px-2 py-0.5 text-xs font-medium text-zinc-200',
};

function ChevronDownIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      aria-hidden="true"
      className="size-4 shrink-0 text-zinc-500"
    >
      <path d="M5 7.5 10 12.5 15 7.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * Single-row selection trigger for a modal picker.
 *
 * The field keeps the form compact: selected values render as chips, and the
 * whole row opens the picker dialog. It is presentation-only — the owning form
 * stores the codes, so this component never fetches options or writes state
 * outside `onOpen`.
 */
export function SelectionField({
  label,
  placeholder,
  selected,
  onOpen,
  disabled = false,
  expanded = false,
  tone = 'zinc',
  hint,
}: SelectionFieldProps) {
  const hintId = useId();
  const summary =
    selected.length > 0 ? selected.map((chip) => chip.label).join('、') : placeholder;

  return (
    <div className="grid gap-1.5 text-sm">
      <span className="text-xs font-medium text-zinc-400">{label}</span>
      <button
        type="button"
        className="flex w-full items-center justify-between gap-3 rounded-md border border-zinc-700 bg-zinc-800/60 px-3 py-2 text-left text-zinc-100 hover:border-zinc-600 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-60"
        onClick={onOpen}
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={expanded}
        aria-label={`${label}: ${summary}`}
        aria-describedby={hint ? hintId : undefined}
      >
        <span className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
          {selected.length > 0 ? (
            selected.map((chip) => (
              <span key={chip.key} className={CHIP_CLASS[tone]}>
                {chip.label}
              </span>
            ))
          ) : (
            <span className="text-zinc-500">{placeholder}</span>
          )}
        </span>
        <ChevronDownIcon />
      </button>
      {hint ? (
        <span id={hintId} className="text-xs text-zinc-500">
          {hint}
        </span>
      ) : null}
    </div>
  );
}
