/** @vitest-environment jsdom */

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import InlineError from '../../src/renderer/src/components/feedback/InlineError';

describe('InlineError', () => {
    it('renders message', () => {
        render(<InlineError message="oops" />);
        expect(screen.getByRole('alert')).toHaveTextContent('oops');
    });
});
