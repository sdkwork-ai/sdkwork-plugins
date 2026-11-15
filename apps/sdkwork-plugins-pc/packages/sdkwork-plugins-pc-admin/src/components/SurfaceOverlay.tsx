import { useEffect, useId, type ReactNode } from 'react';

import { usePluginsAdminCopy } from '../copy/pluginsAdminCopy';
import { useFocusTrap } from './useFocusTrap';

export interface SurfaceDrawerProps {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'md' | 'lg';
}

/**
 * Right-side operation drawer for list CRUD.
 *
 * Host styles target `.sdkwork-surface-drawer-*` inside skills/mcp console
 * surfaces; when the composing host does not define them (the Cloud Router
 * admin, for example), the embedded Tailwind utilities render the drawer with
 * the same professional dark surface used by the federated admin pages.
 */
export function SurfaceDrawer({
  open,
  title,
  description,
  onClose,
  children,
  footer,
  size = 'lg',
}: SurfaceDrawerProps) {
  const copy = usePluginsAdminCopy();
  const titleId = useId();
  const descriptionId = useId();
  const { containerRef, onKeyDown } = useFocusTrap<HTMLElement>(open);

  useEffect(() => {
    if (!open) return;
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.defaultPrevented) onClose();
    };
    document.addEventListener('keydown', onEscape);
    return () => document.removeEventListener('keydown', onEscape);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      className="sdkwork-surface-drawer-root fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-[2px]"
      role="presentation"
    >
      <button
        type="button"
        tabIndex={-1}
        className="sdkwork-surface-drawer-backdrop absolute inset-0 cursor-default"
        aria-label={copy.overlay.close}
        onClick={onClose}
      />
      <aside
        ref={containerRef}
        tabIndex={-1}
        onKeyDown={onKeyDown}
        className={`sdkwork-surface-drawer-panel sdkwork-surface-drawer-panel--${size} relative flex h-full w-full flex-col border-l border-zinc-800 bg-zinc-900 shadow-2xl focus:outline-none ${
          size === 'lg' ? 'max-w-2xl' : 'max-w-lg'
        }`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
      >
        <header className="sdkwork-surface-drawer-header flex items-start justify-between gap-4 border-b border-zinc-800 px-5 py-4">
          <div>
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
            className="sdkwork-surface-drawer-close rounded p-1 text-lg leading-none text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
            onClick={onClose}
            aria-label={copy.overlay.close}
          >
            ×
          </button>
        </header>
        <div className="sdkwork-surface-drawer-body flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer ? (
          <footer className="sdkwork-surface-drawer-footer border-t border-zinc-800 px-5 py-3">{footer}</footer>
        ) : null}
      </aside>
    </div>
  );
}

export interface ConfirmModalProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel: string;
  busy?: boolean;
  tone?: 'danger' | 'default';
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmModal({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel,
  busy = false,
  tone = 'danger',
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  const copy = usePluginsAdminCopy();
  const titleId = useId();
  const descriptionId = useId();
  const { containerRef, onKeyDown } = useFocusTrap<HTMLDivElement>(open);

  useEffect(() => {
    if (!open) return;
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy && !event.defaultPrevented) onCancel();
    };
    document.addEventListener('keydown', onEscape);
    return () => document.removeEventListener('keydown', onEscape);
  }, [open, busy, onCancel]);

  if (!open) return null;
  return (
    <div
      className="sdkwork-surface-modal-root fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-[2px]"
      role="presentation"
    >
      <button
        type="button"
        tabIndex={-1}
        className="sdkwork-surface-drawer-backdrop absolute inset-0 cursor-default"
        aria-label={copy.overlay.close}
        onClick={onCancel}
        disabled={busy}
      />
      <div
        ref={containerRef}
        tabIndex={-1}
        onKeyDown={onKeyDown}
        className="sdkwork-surface-modal-panel relative w-full max-w-md rounded-lg border border-zinc-800 bg-zinc-900 p-5 shadow-2xl focus:outline-none"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
      >
        <h3 id={titleId} className="text-base font-semibold text-zinc-100">
          {title}
        </h3>
        <p id={descriptionId} className="mt-2 text-sm text-zinc-400">
          {description}
        </p>
        <div className="sdkwork-surface-modal-actions mt-4 flex justify-end gap-2">
          <button
            type="button"
            className="sdkwork-surface-modal-cancel rounded-md border border-zinc-700 px-3 py-1.5 text-sm text-zinc-200 hover:bg-zinc-800 disabled:opacity-60"
            onClick={onCancel}
            disabled={busy}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className={
              tone === 'danger'
                ? 'sdkwork-surface-modal-confirm sdkwork-surface-modal-confirm--danger rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-500 disabled:opacity-60'
                : 'sdkwork-surface-modal-confirm rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-60'
            }
            onClick={onConfirm}
            disabled={busy}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
