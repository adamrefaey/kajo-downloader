import ElectronStore from 'electron-store';

/**
 * Resolves the ElectronStore constructor across CJS/ESM interop boundaries.
 * Some bundler configurations wrap the default export; this normalizes access.
 */
const ResolvedElectronStore: typeof ElectronStore =
    (ElectronStore as unknown as { default?: typeof ElectronStore }).default ?? ElectronStore;

export default ResolvedElectronStore;
