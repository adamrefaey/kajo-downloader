/** @vitest-environment jsdom */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';
import UrlInput from '../../src/renderer/src/components/UrlInput';
import urlInputStyles from '../../src/renderer/src/components/UrlInput.module.css';

describe('UrlInput', () => {
    it('does not submit on Enter (textarea uses newlines)', async () => {
        const onSubmit = vi.fn();
        const user = userEvent.setup();
        render(
            <UrlInput
                value="https://youtu.be/x"
                onChange={vi.fn()}
                onSubmit={onSubmit}
                isSubmitDisabled={false}
            />
        );
        await user.click(screen.getByRole('textbox'));
        await user.keyboard('{Enter}');
        expect(onSubmit).not.toHaveBeenCalled();
    });

    it('submits via button when enabled', async () => {
        const onSubmit = vi.fn();
        const user = userEvent.setup();
        render(
            <UrlInput value="x" onChange={vi.fn()} onSubmit={onSubmit} isSubmitDisabled={false} />
        );
        await user.click(screen.getByRole('button', { name: /Download/i }));
        expect(onSubmit).toHaveBeenCalled();
    });

    it('does not call onSubmit from button when handler is omitted', async () => {
        const user = userEvent.setup();
        render(<UrlInput value="x" onChange={vi.fn()} isSubmitDisabled={false} />);
        await user.click(screen.getByRole('button', { name: /Download/i }));
    });

    it('shows error with role alert', () => {
        render(<UrlInput value="" onChange={vi.fn()} errorText="Bad URL" isSubmitDisabled />);
        expect(screen.getByRole('alert')).toHaveTextContent('Bad URL');
    });

    it('announces clipboard hint when provided', () => {
        render(
            <UrlInput
                value=""
                onChange={vi.fn()}
                clipboardHint="https://youtu.be/x"
                isSubmitDisabled
            />
        );
        expect(screen.getByText('Clipboard URL detected')).toBeInTheDocument();
    });

    it('shows loading copy and wires aria when fetching', () => {
        render(
            <UrlInput value="https://youtu.be/x" onChange={vi.fn()} isLoading isSubmitDisabled />
        );
        expect(screen.getByText('Fetching media details')).toBeInTheDocument();
        const input = screen.getByRole('textbox');
        expect(input).toHaveAttribute('aria-busy', 'true');
        expect(input).toHaveAttribute('aria-describedby', 'download-url-loading');
    });

    it('prefers error describedby over loading when both set', () => {
        render(
            <UrlInput value="x" onChange={vi.fn()} isLoading errorText="Nope" isSubmitDisabled />
        );
        expect(screen.getByRole('textbox')).toHaveAttribute(
            'aria-describedby',
            'download-url-error'
        );
        expect(screen.queryByText('Fetching media details')).not.toBeInTheDocument();
    });

    it('omits aria-describedby when idle without error or loading', () => {
        render(<UrlInput value="" onChange={vi.fn()} isSubmitDisabled />);
        expect(screen.getByRole('textbox')).not.toHaveAttribute('aria-describedby');
    });

    it('does not submit on Enter when disabled or without onSubmit', async () => {
        const onSubmit = vi.fn();
        const user = userEvent.setup();
        const { rerender } = render(
            <UrlInput value="x" onChange={vi.fn()} onSubmit={onSubmit} isSubmitDisabled />
        );
        await user.click(screen.getByRole('textbox'));
        await user.keyboard('{Enter}');
        expect(onSubmit).not.toHaveBeenCalled();

        rerender(<UrlInput value="x" onChange={vi.fn()} isSubmitDisabled={false} />);
        await user.click(screen.getByRole('textbox'));
        await user.keyboard('{Enter}');
        expect(onSubmit).not.toHaveBeenCalled();
    });

    it('does not submit via button when disabled', async () => {
        const onSubmit = vi.fn();
        const user = userEvent.setup();
        render(<UrlInput value="x" onChange={vi.fn()} onSubmit={onSubmit} isSubmitDisabled />);
        await user.click(screen.getByRole('button', { name: /Download/i }));
        expect(onSubmit).not.toHaveBeenCalled();
    });

    it('forwards inputRef and calls onChange when typing', async () => {
        const ref = createRef<HTMLTextAreaElement>();
        const onChange = vi.fn();
        const user = userEvent.setup();
        render(<UrlInput value="" onChange={onChange} inputRef={ref} isSubmitDisabled />);
        expect(ref.current).toBeInstanceOf(HTMLTextAreaElement);
        await user.type(screen.getByRole('textbox'), 'ab');
        expect(onChange).toHaveBeenCalled();
        expect(onChange.mock.calls.at(-1)?.[0]).toContain('b');
    });

    it('applies has-error class on the row when errorText set', () => {
        const { container } = render(
            <UrlInput value="" onChange={vi.fn()} errorText="e" isSubmitDisabled />
        );
        const row = container.querySelector(`.${urlInputStyles.combo}.${urlInputStyles.hasError}`);
        expect(row).toBeTruthy();
    });
});
