/** @vitest-environment jsdom */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import CustomSelect from '../../src/renderer/src/components/CustomSelect';

const options = [
    { value: 'a', label: 'Alpha' },
    { value: 'b', label: 'Bravo' },
    { value: 'c', label: 'Charlie' }
];

describe('CustomSelect', () => {
    it('opens with ArrowDown and selects with Enter', async () => {
        const onChange = vi.fn();
        const user = userEvent.setup();
        render(
            <CustomSelect
                value="a"
                options={options}
                onChange={onChange}
                aria-label="Test select"
            />
        );

        const trigger = screen.getByLabelText('Test select');
        trigger.focus();
        await user.keyboard('{ArrowDown}{Enter}');

        expect(onChange).toHaveBeenCalledWith('b');
    });

    it('moves highlight with ArrowUp and Home/End', async () => {
        const user = userEvent.setup();
        render(
            <CustomSelect value="c" options={options} onChange={vi.fn()} aria-label="Test select" />
        );

        const trigger = screen.getByLabelText('Test select');
        trigger.focus();
        await user.keyboard('{ArrowDown}{Home}');
        expect(screen.getByRole('listbox')).toHaveAttribute(
            'aria-activedescendant',
            expect.stringMatching(/-option-0$/)
        );

        await user.keyboard('{End}');
        expect(screen.getByRole('listbox')).toHaveAttribute(
            'aria-activedescendant',
            expect.stringMatching(/-option-2$/)
        );
    });

    it('closes on Escape', async () => {
        const user = userEvent.setup();
        render(
            <CustomSelect value="a" options={options} onChange={vi.fn()} aria-label="Test select" />
        );

        const trigger = screen.getByLabelText('Test select');
        await user.click(trigger);
        expect(screen.getByRole('listbox')).toBeInTheDocument();

        await user.keyboard('{Escape}');
        expect(screen.queryByRole('listbox')).toBeNull();
    });

    it('selects highlighted option with Space', async () => {
        const onChange = vi.fn();
        const user = userEvent.setup();
        render(
            <CustomSelect
                value="a"
                options={options}
                onChange={onChange}
                aria-label="Test select"
            />
        );

        const trigger = screen.getByLabelText('Test select');
        trigger.focus();
        await user.keyboard('{ArrowDown} ');
        expect(onChange).toHaveBeenCalledWith('b');
    });
});
