import type { SVGProps } from 'react';

/** Page sizes offered by the list pagination bar. */
export const ADMIN_LIST_PAGE_SIZE_OPTIONS = [10, 20, 50, 100] as const;

/** Default page size of every AI-foundation administration list. */
export const DEFAULT_ADMIN_LIST_PAGE_SIZE = 20;

/**
 * Localized labels of the list pagination bar.
 *
 * The bar renders no literal copy of its own: every user-visible string comes
 * from the owning page's copy module, so it stays translatable in a Chinese
 * console and the AI-foundation i18n gate keeps passing.
 */
export interface AdminListPaginationCopy {
  /** Accessible name and tooltip of the previous-page button. */
  previous: string;
  /** Accessible name and tooltip of the next-page button. */
  next: string;
  /** Label rendered in front of the page-size selector. */
  pageSize: string;
  /** Current position summary, for example `Page 1 / 4`. */
  page: (page: number, totalPages: number) => string;
  /** Row-range summary, for example `Showing 1 - 20 of 128`. */
  showing: (start: number, end: number, total: number) => string;
}

export interface AdminListPaginationProps {
  /** 1-based page currently rendered. */
  page: number;
  /** Rows requested per page. */
  pageSize: number;
  /** Rows the current page renders. */
  itemCount: number;
  /** Rows matching the active query across every page. */
  totalItems: number;
  /** Whether a page exists after the current one. */
  hasNextPage: boolean;
  /** Localized labels owned by the page's copy module. */
  copy: AdminListPaginationCopy;
  /** Disables every control while a request is in flight. */
  disabled?: boolean;
  pageSizeOptions?: readonly number[];
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
}

const CHEVRON_PATHS = { left: 'm15 6-6 6 6 6', right: 'm9 6 6 6-6 6' } as const;

function ChevronIcon({
  direction,
  ...props
}: SVGProps<SVGSVGElement> & { direction: 'left' | 'right' }) {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={1.8}
      viewBox="0 0 24 24"
      {...props}
    >
      <path d={CHEVRON_PATHS[direction]} />
    </svg>
  );
}

const CONTROL_CLASS =
  'h-8 rounded-md border border-slate-300 bg-white px-2 text-xs font-medium text-slate-700 outline-none transition-colors hover:border-slate-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-400 disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/10 dark:bg-zinc-900 dark:text-zinc-200';
const ICON_BUTTON_CLASS =
  'inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-300 text-slate-600 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-400 dark:border-white/10 dark:text-zinc-300 dark:hover:bg-white/5';
const PAGE_BADGE_CLASS =
  'inline-flex h-8 items-center justify-center rounded-md border border-slate-200 bg-slate-50 px-2.5 text-xs font-medium tabular-nums text-slate-600 dark:border-white/10 dark:bg-white/[0.03] dark:text-zinc-300';

/**
 * Bottom pagination bar shared by the AI-foundation administration lists.
 *
 * It renders the row range, a page-size selector, the current position and
 * previous/next controls inside the host's `.admin-list-footer` band, so every
 * catalog ends its table the same way.
 */
export function AdminListPagination({
  page,
  pageSize,
  itemCount,
  totalItems,
  hasNextPage,
  copy,
  disabled = false,
  pageSizeOptions = ADMIN_LIST_PAGE_SIZE_OPTIONS,
  onPageChange,
  onPageSizeChange,
}: AdminListPaginationProps) {
  const safePageSize = Math.max(1, pageSize);
  const safeTotal = Math.max(0, totalItems);
  const totalPages = Math.max(1, Math.ceil(safeTotal / safePageSize));
  const currentPage = Math.min(Math.max(1, page), totalPages);
  const start = itemCount > 0 ? (currentPage - 1) * safePageSize + 1 : 0;
  const end = itemCount > 0 ? start + itemCount - 1 : 0;
  const canPrevious = currentPage > 1 && !disabled;
  const canNext = hasNextPage && !disabled;

  return (
    <div className="admin-list-footer">
      <span className="text-xs">{copy.showing(start, end, safeTotal)}</span>
      <div className="flex flex-wrap items-center gap-2">
        <label className="inline-flex items-center gap-2">
          <span className="text-xs">{copy.pageSize}</span>
          <select
            aria-label={copy.pageSize}
            className={CONTROL_CLASS}
            disabled={disabled}
            onChange={(event) => onPageSizeChange(Number(event.target.value))}
            value={safePageSize}
          >
            {pageSizeOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
        <span className={PAGE_BADGE_CLASS}>{copy.page(currentPage, totalPages)}</span>
        <button
          aria-label={copy.previous}
          className={ICON_BUTTON_CLASS}
          disabled={!canPrevious}
          onClick={() => onPageChange(currentPage - 1)}
          title={copy.previous}
          type="button"
        >
          <ChevronIcon direction="left" className="h-4 w-4" />
        </button>
        <button
          aria-label={copy.next}
          className={ICON_BUTTON_CLASS}
          disabled={!canNext}
          onClick={() => onPageChange(currentPage + 1)}
          title={copy.next}
          type="button"
        >
          <ChevronIcon direction="right" className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
