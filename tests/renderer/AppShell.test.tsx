/** @vitest-environment jsdom */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import {
    AppShell,
    AppShellQueueAnchor,
    AppShellTitlebar,
    AppShellWorkspace
} from '../../src/renderer/src/components/layout/AppShell';

describe('AppShell', () => {
    it('renders shell regions', () => {
        render(
            <AppShell platformClassName="platform-macos">
                <AppShellTitlebar title="T" subtitle="S" />
                <AppShellWorkspace primary={<p>Main</p>} secondary={<p>Side</p>} />
            </AppShell>
        );
        expect(screen.getByText('T')).toBeInTheDocument();
        expect(screen.getByText('Main')).toBeInTheDocument();
        expect(screen.getByText('Side')).toBeInTheDocument();
    });

    it('renders queue anchor', () => {
        render(<AppShellQueueAnchor>Q</AppShellQueueAnchor>);
        expect(screen.getByText('Q')).toBeInTheDocument();
    });

    it('renders titlebar meta, badge, controls, and notice', () => {
        render(
            <AppShellTitlebar
                title="App"
                subtitle=""
                toolbarClassName="app-toolbar"
                badge="β"
                meta={<span>Meta line</span>}
                controls={<button type="button">Action</button>}
                notice={<p className="notice">Update available</p>}
            />
        );
        expect(screen.getByText('Meta line')).toBeInTheDocument();
        expect(screen.getByText('β')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Action' })).toBeInTheDocument();
        expect(screen.getByText('Update available')).toBeInTheDocument();
    });

    it('opens author link via preload when openExternal is available', async () => {
        const openExternal = vi.fn().mockResolvedValue(undefined);
        Object.assign(window, {
            api: { openExternal }
        });
        const user = userEvent.setup();
        render(
            <AppShell platformClassName="platform-macos">
                <AppShellTitlebar title="T" subtitle="S" />
            </AppShell>
        );
        const link = screen.getByRole('link', { name: /adam refaey/i });
        await user.click(link);
        expect(openExternal).toHaveBeenCalledWith('https://www.linkedin.com/in/adamrefaey');
        Reflect.deleteProperty(window, 'api');
    });

    it('does not require preload when openExternal is missing', async () => {
        Reflect.deleteProperty(window, 'api');
        const user = userEvent.setup();
        render(
            <AppShell platformClassName="platform-macos">
                <AppShellTitlebar title="T" subtitle="S" />
            </AppShell>
        );
        const link = screen.getByRole('link', { name: /adam refaey/i });
        await user.click(link);
    });
});
