/** @vitest-environment jsdom */

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import StatusBanner from '../../src/renderer/src/components/feedback/StatusBanner';

describe('StatusBanner', () => {
    it('uses alert for warning tone', () => {
        render(<StatusBanner tone="warning" title="T" message="M" />);
        expect(screen.getByRole('alert')).toBeInTheDocument();
    });

    it('uses status for info tone', () => {
        render(<StatusBanner title="T" message="M" />);
        expect(screen.getByRole('status')).toBeInTheDocument();
    });
});
