/** @vitest-environment jsdom */

import { waitFor } from '@testing-library/react';
import { createElement } from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@fontsource/ibm-plex-sans/300.css', () => ({}));
vi.mock('@fontsource/ibm-plex-sans/400.css', () => ({}));
vi.mock('@fontsource/ibm-plex-sans/600.css', () => ({}));
vi.mock('../src/renderer/src/assets/global.css', () => ({}));

vi.mock('../src/renderer/src/App.tsx', () => ({
    default: () => createElement('div', { 'data-testid': 'boot-app' }, 'boot')
}));

describe('src/renderer/src/main', () => {
    it('mounts App into #root', async () => {
        document.body.innerHTML = '<div id="root"></div>';
        vi.resetModules();
        await import('../src/renderer/src/main');
        await waitFor(() => {
            expect(document.getElementById('root')).toHaveTextContent('boot');
        });
    });
});
