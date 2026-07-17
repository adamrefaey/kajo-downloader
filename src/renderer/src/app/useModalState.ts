import { useReducer } from 'react';
import type { SiteAuthManualOpenContext } from '../components/SiteAuthBrowserModal';

type ModalValue =
    | { kind: 'none' }
    | { kind: 'settings' }
    | { kind: 'siteSessions' }
    | { kind: 'downloadHistory' }
    | { kind: 'siteAuth'; manual: SiteAuthManualOpenContext | null };

type ModalAction =
    | { type: 'open'; modal: ModalValue }
    | { type: 'close' }
    | { type: 'setSiteAuthManual'; manual: SiteAuthManualOpenContext | null };

function modalReducer(_state: ModalValue, action: ModalAction): ModalValue {
    switch (action.type) {
        case 'open':
            return action.modal;
        case 'close':
            return { kind: 'none' };
        case 'setSiteAuthManual':
            return { kind: 'siteAuth', manual: action.manual };
        default:
            return _state;
    }
}

export function useModalState(): {
    settingsOpen: boolean;
    setSettingsOpen: (open: boolean | ((prev: boolean) => boolean)) => void;
    siteSessionsModalOpen: boolean;
    setSiteSessionsModalOpen: (open: boolean | ((prev: boolean) => boolean)) => void;
    historyModalOpen: boolean;
    setHistoryModalOpen: (open: boolean | ((prev: boolean) => boolean)) => void;
    siteAuthModalOpen: boolean;
    setSiteAuthModalOpen: (open: boolean | ((prev: boolean) => boolean)) => void;
    siteAuthManualOpen: SiteAuthManualOpenContext | null;
    setSiteAuthManualOpen: (
        ctx:
            | SiteAuthManualOpenContext
            | null
            | ((prev: SiteAuthManualOpenContext | null) => SiteAuthManualOpenContext | null)
    ) => void;
    closeSiteAuthModals: () => void;
} {
    const [modal, dispatch] = useReducer(modalReducer, { kind: 'none' });

    // Backward-compatible boolean getters
    const settingsOpen = modal.kind === 'settings';
    const siteSessionsModalOpen = modal.kind === 'siteSessions';
    const historyModalOpen = modal.kind === 'downloadHistory';
    const siteAuthModalOpen = modal.kind === 'siteAuth';
    const siteAuthManualOpen = modal.kind === 'siteAuth' ? modal.manual : null;

    // Backward-compatible setters that map to dispatch calls
    const setSettingsOpen = (open: boolean | ((prev: boolean) => boolean)): void => {
        const value = typeof open === 'function' ? open(false) : open;
        dispatch(value ? { type: 'open', modal: { kind: 'settings' } } : { type: 'close' });
    };

    const setSiteSessionsModalOpen = (open: boolean | ((prev: boolean) => boolean)): void => {
        const value = typeof open === 'function' ? open(false) : open;
        dispatch(value ? { type: 'open', modal: { kind: 'siteSessions' } } : { type: 'close' });
    };

    const setHistoryModalOpen = (open: boolean | ((prev: boolean) => boolean)): void => {
        const value = typeof open === 'function' ? open(false) : open;
        dispatch(value ? { type: 'open', modal: { kind: 'downloadHistory' } } : { type: 'close' });
    };

    const setSiteAuthModalOpen = (open: boolean | ((prev: boolean) => boolean)): void => {
        const value = typeof open === 'function' ? open(false) : open;
        dispatch(
            value ? { type: 'open', modal: { kind: 'siteAuth', manual: null } } : { type: 'close' }
        );
    };

    const setSiteAuthManualOpen = (
        ctx:
            | SiteAuthManualOpenContext
            | null
            | ((prev: SiteAuthManualOpenContext | null) => SiteAuthManualOpenContext | null)
    ): void => {
        const value = typeof ctx === 'function' ? ctx(null) : ctx;
        if (value) {
            dispatch({ type: 'setSiteAuthManual', manual: value });
        } else {
            dispatch({ type: 'close' });
        }
    };

    const closeSiteAuthModals = (): void => {
        dispatch({ type: 'close' });
    };

    return {
        settingsOpen,
        setSettingsOpen,
        siteSessionsModalOpen,
        setSiteSessionsModalOpen,
        historyModalOpen,
        setHistoryModalOpen,
        siteAuthModalOpen,
        setSiteAuthModalOpen,
        siteAuthManualOpen,
        setSiteAuthManualOpen,
        closeSiteAuthModals
    };
}

export type ModalState = ReturnType<typeof useModalState>;
