import { useEffect, useRef, type KeyboardEvent as ReactKeyboardEvent, type RefObject } from 'react';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

export interface FocusTrap<T extends HTMLElement> {
  containerRef: RefObject<T | null>;
  onKeyDown: (event: ReactKeyboardEvent<T>) => void;
}

/**
 * Keeps keyboard focus inside an open dialog surface and restores it on close.
 *
 * `initialFocusSelector` lets a dialog focus a meaningful control (a search
 * box, for example) instead of the first focusable element, which is usually
 * the close button. Nested dialogs stop Tab propagation so the outer trap does
 * not fight the inner one.
 */
export function useFocusTrap<T extends HTMLElement>(
  active: boolean,
  initialFocusSelector?: string,
): FocusTrap<T> {
  const containerRef = useRef<T>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!active) return;
    const container = containerRef.current;
    if (!container) return;

    previousFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const initial = initialFocusSelector
      ? container.querySelector<HTMLElement>(initialFocusSelector)
      : null;
    const first = container.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
    (initial ?? first ?? container).focus();

    return () => {
      previousFocusRef.current?.focus();
    };
  }, [active, initialFocusSelector]);

  function onKeyDown(event: ReactKeyboardEvent<T>) {
    if (event.key !== 'Tab') return;
    const container = containerRef.current;
    if (!container) return;

    const focusables = Array.from(
      container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
    ).filter((element) => element.getClientRects().length > 0);
    if (focusables.length === 0) {
      event.preventDefault();
      return;
    }

    const first = focusables[0];
    const last = focusables[focusables.length - 1] ?? first;
    if (!first || !last) return;

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
    // A nested dialog owns its own trap; do not let the drawer trap also run.
    event.stopPropagation();
  }

  return { containerRef, onKeyDown };
}
