import { createFocusTrap, type FocusTrap } from 'focus-trap';
import { type RefObject, useEffect } from 'react';

/**
 * Trap focus inside a modal root while `open` is true (Escape still reaches the app if you handle it on the trap).
 */
export function useModalFocusTrap(
    containerRef: RefObject<HTMLElement | null>,
    open: boolean
): void {
    useEffect(() => {
        if (!open) {
            return;
        }
        const el = containerRef.current;
        if (!el) {
            return;
        }
        let trap: FocusTrap | undefined;
        const id = requestAnimationFrame(() => {
            trap = createFocusTrap(el, {
                initialFocus: false,
                allowOutsideClick: true,
                fallbackFocus: el
            });
            trap.activate();
        });
        return () => {
            cancelAnimationFrame(id);
            trap?.deactivate();
        };
    }, [open, containerRef]);
}
