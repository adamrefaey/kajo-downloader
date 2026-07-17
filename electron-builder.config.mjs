/**
 * electron-builder configuration.
 *
 * Signing / notarization fields are applied only when the matching env vars are
 * set. Leaving `mac.identity` unset (instead of an unresolved `${env.*}` macro)
 * lets electron-builder auto-discover a keychain identity or skip signing cleanly
 * for local/unsigned builds — see https://www.electron.build/code-signing
 *
 * Preferred env vars (electron-builder standard):
 *   CSC_NAME / APPLE_SIGNING_IDENTITY — macOS certificate CN
 *   APPLE_ID + APPLE_APP_SPECIFIC_PASSWORD + APPLE_TEAM_ID — notarization
 *   CSC_LINK + CSC_KEY_PASSWORD — Windows PFX
 *   WIN_CERTIFICATE_SUBJECT_NAME / WIN_PUBLISHER_NAME — Windows signtool extras
 */

// electron-builder substitutes these `${…}` macros at pack time — not JS templates.
// biome-ignore-all lint/suspicious/noTemplateCurlyInString: electron-builder artifact macros

function nonEmptyEnv(name) {
    const value = process.env[name];
    return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
}

const macIdentity = nonEmptyEnv('CSC_NAME') ?? nonEmptyEnv('APPLE_SIGNING_IDENTITY');
const canNotarize = Boolean(
    nonEmptyEnv('APPLE_ID') &&
        nonEmptyEnv('APPLE_APP_SPECIFIC_PASSWORD') &&
        nonEmptyEnv('APPLE_TEAM_ID')
);
const winCertificateSubjectName = nonEmptyEnv('WIN_CERTIFICATE_SUBJECT_NAME');
const winPublisherName = nonEmptyEnv('WIN_PUBLISHER_NAME');

/** @type {import('electron-builder').Configuration} */
const config = {
    appId: 'app.kajodownloader.desktop',
    productName: 'Kajo Downloader',
    directories: {
        buildResources: 'build',
        output: 'release'
    },
    // Whitelist: ship compiled output + app icon only. package.json, node_modules
    // (production deps), and extraResources are added by electron-builder automatically.
    files: ['out/**', 'resources/icon.png', '!out/**/*.map'],
    compression: 'maximum',
    asarUnpack: ['resources/**'],
    // Electron locale packs to keep (Chromium UI strings). Tags use Electron's codes
    // (pt_BR, zh_CN) while the app UI uses BCP 47 (pt, zh-CN) in supportedLocales.ts.
    electronLanguages: ['en', 'es', 'fr', 'de', 'pt_BR', 'ru', 'ja', 'zh_CN', 'ar', 'hi', 'ko'],
    win: {
        executableName: 'Kajo Downloader',
        signtoolOptions: {
            signingHashAlgorithms: ['sha256'],
            ...(winCertificateSubjectName
                ? { certificateSubjectName: winCertificateSubjectName }
                : {}),
            // publisherName must match the CN of the code-signing certificate.
            // electron-updater verifies this at update installation time.
            ...(winPublisherName ? { publisherName: winPublisherName } : {})
        }
    },
    nsis: {
        artifactName: '${productName}-${version}-setup-${arch}.${ext}',
        shortcutName: '${productName}',
        uninstallDisplayName: '${productName}',
        createDesktopShortcut: 'always'
    },
    mac: {
        // null = skip signing without keychain search / bogus identity macros.
        // Set CSC_NAME or APPLE_SIGNING_IDENTITY for Developer ID release builds.
        identity: macIdentity ?? null,
        target: ['dmg'],
        hardenedRuntime: true,
        gatekeeperAssess: false,
        entitlementsInherit: 'build/entitlements.mac.plist',
        // Only enable when Apple notarization credentials are present; otherwise
        // electron-builder may emit "skipped notarization" noise on local builds.
        notarize: canNotarize,
        extendInfo: {
            NSDocumentsFolderUsageDescription:
                'Kajo Downloader may save downloaded media to your Documents folder when you choose that location.',
            NSDownloadsFolderUsageDescription:
                'Kajo Downloader saves downloaded media to your Downloads folder by default.'
        }
    },
    extraResources: [
        {
            from: 'resources/bin',
            to: 'bin',
            filter: ['**/*']
        }
    ],
    afterPack: 'build/afterPack.mjs',
    dmg: {
        artifactName: '${productName}-${version}-${arch}.${ext}',
        format: 'ULFO'
    },
    linux: {
        artifactName: '${productName}-${version}-${arch}.${ext}',
        target: ['deb', 'rpm', 'AppImage'],
        maintainer: 'Adam Refaey <adamrefaey@users.noreply.github.com>',
        category: 'Utility'
    },
    // Scoped npm name + spaced productName otherwise become an invalid Linux package name
    // ("Kajo Downloader.spec" / fpm --name), which breaks rpmbuild on CI.
    deb: {
        packageName: 'kajo-downloader'
    },
    rpm: {
        packageName: 'kajo-downloader'
    },
    appImage: {
        artifactName: '${productName}-${version}-${arch}.${ext}'
    },
    asar: true,
    npmRebuild: false,
    // Electron Fuses — build-time binary hardening flipped by electron-builder's
    // @electron/fuses integration. Closes "living off the land" vectors (RunAsNode,
    // NODE_OPTIONS, --inspect, file:// extra privileges), encrypts the cookie store
    // at rest, and only loads the app from app.asar.
    //
    // resetAdHocDarwinSignature MUST stay true. Flipping a fuse rewrites bytes inside
    // the macOS Electron Framework binary, which invalidates its code signature. On
    // Apple Silicon every page is signature-checked at first read — an unrepaired
    // signature makes the app SIGKILL with "CODESIGNING, Code 2, Invalid Page". This
    // flag re-applies an ad-hoc signature after flipping so unsigned/local arm64 builds
    // run. For Developer ID release builds electron-builder re-signs AFTER fuse-flipping.
    //
    // enableEmbeddedAsarIntegrityValidation + onlyLoadAppFromAsar: code must load FROM
    // the asar AND the asar must match its sealed hash.
    electronFuses: {
        runAsNode: false,
        enableCookieEncryption: true,
        enableNodeOptionsEnvironmentVariable: false,
        enableNodeCliInspectArguments: false,
        enableEmbeddedAsarIntegrityValidation: true,
        onlyLoadAppFromAsar: true,
        grantFileProtocolExtraPrivileges: false,
        resetAdHocDarwinSignature: true
    },
    // Auto-update feed: GitHub Releases. electron-updater reads the generated
    // app-update.yml. Runtime override: KAJO_AUTO_UPDATE_FEED_URL (HTTPS generic feed).
    publish: {
        provider: 'github',
        owner: 'adamrefaey',
        repo: 'kajo-downloader'
    }
};

export default config;
