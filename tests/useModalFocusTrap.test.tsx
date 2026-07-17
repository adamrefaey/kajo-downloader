/** @vitest-environment jsdom */

import { render } from '@testing-library/react';
import type React from 'react';
import { useRef } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { useModalFocusTrap } from '../src/renderer/src/hooks/useModalFocusTrap';

describe('useModalFocusTrap', () => {
    it('no-ops when container ref is never attached', () => {
        const raf = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
            cb(0);
            return 0;
        });
        const caf = vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});

        function Host({ open }: { open: boolean }): React.JSX.Element {
            const ref = useRef<HTMLDivElement>(null);
            useModalFocusTrap(ref, open);
            return <div data-testid="no-ref-host" />;
        }

        render(<Host open />);
        expect(raf).not.toHaveBeenCalled();

        raf.mockRestore();
        caf.mockRestore();
    });

    it('activates trap when open and ref is set', () => {
        const raf = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
            cb(0);
            return 0;
        });

        function Host({ open }: { open: boolean }): React.JSX.Element | null {
            const ref = useRef<HTMLDivElement>(null);
            useModalFocusTrap(ref, open);
            return open ? (
                <div ref={ref} tabIndex={-1}>
                    <button type="button">one</button>
                </div>
            ) : null;
        }

        render(<Host open />);
        expect(raf).toHaveBeenCalled();

        raf.mockRestore();
    });
});
