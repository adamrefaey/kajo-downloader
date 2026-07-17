import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { AdvancedDownloadDefaultsPatch } from '../../../shared/advancedDownloadSettings';
import type { AdvancedDownloadDefaults, AudioOutputFormat, VideoContainer } from '../../../types';
import CustomSelect from './CustomSelect';

export type SettingsDownloadsTabProps = {
    advancedDownloadDefaults: AdvancedDownloadDefaults;
    customFilenameTemplate: string | undefined;
    proxyUrlDraft: string;
    setProxyUrlDraft: (v: string) => void;
    proxyConfigured: boolean;
    onSaveProxyUrl: (url: string | null) => void | Promise<void>;
    onPatchAdvancedDownloadDefaults: (patch: AdvancedDownloadDefaultsPatch) => void | Promise<void>;
    onCustomFilenameTemplateChange: (value: string) => void | Promise<void>;
};

function parseSubtitleLanguagesInput(raw: string): string[] {
    return raw
        .split(/[,;\s]+/)
        .map((l) => l.trim().slice(0, 16))
        .filter(Boolean)
        .slice(0, 32);
}

export default function SettingsDownloadsTab({
    advancedDownloadDefaults,
    customFilenameTemplate,
    proxyUrlDraft,
    setProxyUrlDraft,
    proxyConfigured,
    onSaveProxyUrl,
    onPatchAdvancedDownloadDefaults,
    onCustomFilenameTemplateChange
}: SettingsDownloadsTabProps): React.JSX.Element {
    const { t } = useTranslation('components');
    const rateLimitId = useId();
    const subtitlesLanguagesId = useId();
    const filenameTemplateId = useId();

    const [languagesDraft, setLanguagesDraft] = useState(() =>
        advancedDownloadDefaults.subtitles.languages.join(', ')
    );
    const [filenameDraft, setFilenameDraft] = useState(() => customFilenameTemplate ?? '');

    const subtitleModeOptions = [
        { value: 'off', label: t('settings.subtitlesModeOff') },
        { value: 'sidecar', label: t('settings.subtitlesModeSidecar') },
        { value: 'embed', label: t('settings.subtitlesModeEmbed') }
    ];

    const sponsorBlockModeOptions = [
        { value: 'off', label: t('settings.sponsorBlockModeOff') },
        { value: 'mark', label: t('settings.sponsorBlockModeMark') },
        { value: 'remove', label: t('settings.sponsorBlockModeRemove') }
    ];

    const videoContainerOptions: Array<{ value: VideoContainer; label: string }> = [
        { value: 'mp4', label: t('settings.formatMp4') },
        { value: 'mkv', label: t('settings.formatMkv') },
        { value: 'webm', label: t('settings.formatWebm') }
    ];

    const audioFormatOptions: Array<{ value: AudioOutputFormat; label: string }> = [
        { value: 'mp3', label: t('settings.formatMp3') },
        { value: 'm4a', label: t('settings.formatM4a') },
        { value: 'flac', label: t('settings.formatFlac') },
        { value: 'wav', label: t('settings.formatWav') },
        { value: 'aac', label: t('settings.formatAac') },
        { value: 'ogg', label: t('settings.formatOgg') }
    ];

    const commitSubtitleLanguages = (raw: string): void => {
        void onPatchAdvancedDownloadDefaults({
            subtitles: { languages: parseSubtitleLanguagesInput(raw) }
        });
    };

    return (
        <div
            className="settings-tab-panel"
            id="settings-tab-panel-downloads"
            role="tabpanel"
            aria-labelledby="settings-tab-downloads"
        >
            <section
                className="settings-section settings-tab-first-in-panel"
                aria-labelledby="settings-network-heading"
            >
                <h3 id="settings-network-heading" className="settings-section-heading">
                    {t('settings.downloadsNetworkTitle')}
                </h3>
                <p className="settings-section-hint">{t('settings.downloadsNetworkHint')}</p>
                <div className="settings-modal-grid settings-quick-grid">
                    <div className="toolbar-setting-card">
                        <div className="toolbar-setting-head">
                            <label htmlFor={rateLimitId} className="toolbar-setting-eyebrow">
                                {t('settings.rateLimit')}
                            </label>
                        </div>
                        <p className="settings-field-hint">{t('settings.rateLimitHint')}</p>
                        <input
                            id={rateLimitId}
                            type="text"
                            className="input toolbar-setting-select"
                            value={advancedDownloadDefaults.network.rateLimit}
                            onChange={(e) =>
                                void onPatchAdvancedDownloadDefaults({
                                    network: { rateLimit: e.target.value }
                                })
                            }
                            placeholder="1M"
                            autoComplete="off"
                            dir="ltr"
                        />
                    </div>
                    <div className="toolbar-setting-card">
                        <div className="toolbar-setting-head">
                            <span className="toolbar-setting-eyebrow">{t('settings.proxy')}</span>
                        </div>
                        {proxyConfigured ? (
                            <p className="settings-field-hint settings-proxy-status">
                                {t('settings.proxySaved')}
                            </p>
                        ) : (
                            <p className="settings-field-hint">{t('settings.proxyNotSaved')}</p>
                        )}
                        <input
                            type="url"
                            className="input toolbar-setting-select"
                            value={proxyUrlDraft}
                            onChange={(e) => setProxyUrlDraft(e.target.value)}
                            placeholder={t('settings.proxyUrlPlaceholder')}
                            autoComplete="off"
                            dir="ltr"
                        />
                        <div className="settings-proxy-actions">
                            <button
                                type="button"
                                className="ghost-button topbar-text-action"
                                onClick={() => void onSaveProxyUrl(proxyUrlDraft.trim() || null)}
                            >
                                {t('settings.proxySave')}
                            </button>
                            <button
                                type="button"
                                className="ghost-button topbar-text-action"
                                onClick={() => void onSaveProxyUrl(null)}
                            >
                                {t('settings.proxyClear')}
                            </button>
                        </div>
                    </div>
                </div>
            </section>

            <section
                className="settings-section"
                aria-labelledby="settings-download-options-heading"
            >
                <h3 id="settings-download-options-heading" className="settings-section-heading">
                    {t('settings.downloadsAdvancedTitle')}
                </h3>
                <p className="settings-section-hint">{t('settings.downloadsAdvancedHint')}</p>
                <div className="settings-modal-grid settings-quick-grid">
                    <div className="toolbar-setting-card">
                        <div className="toolbar-setting-head">
                            <span className="toolbar-setting-eyebrow">
                                {t('settings.subtitles')}
                            </span>
                        </div>
                        <CustomSelect
                            className="toolbar-setting-select"
                            value={advancedDownloadDefaults.subtitles.mode}
                            onChange={(value) =>
                                void onPatchAdvancedDownloadDefaults({
                                    subtitles: {
                                        mode: value as AdvancedDownloadDefaults['subtitles']['mode']
                                    }
                                })
                            }
                            options={subtitleModeOptions}
                            aria-label={t('settings.subtitlesMode')}
                        />
                        <label
                            htmlFor={subtitlesLanguagesId}
                            className="toolbar-setting-eyebrow settings-field-spaced"
                        >
                            {t('settings.subtitlesLanguages')}
                        </label>
                        <p className="settings-field-hint">
                            {t('settings.subtitlesLanguagesHint')}
                        </p>
                        <input
                            id={subtitlesLanguagesId}
                            type="text"
                            className="input toolbar-setting-select"
                            value={languagesDraft}
                            onChange={(e) => setLanguagesDraft(e.target.value)}
                            onBlur={() => commitSubtitleLanguages(languagesDraft)}
                            placeholder="en, es"
                            autoComplete="off"
                            dir="ltr"
                            disabled={advancedDownloadDefaults.subtitles.mode === 'off'}
                        />
                        {advancedDownloadDefaults.subtitles.languages.length > 0 ? (
                            <ul className="settings-lang-chips">
                                {advancedDownloadDefaults.subtitles.languages.map((lang) => (
                                    <li key={lang} className="status-chip">
                                        {lang}
                                    </li>
                                ))}
                            </ul>
                        ) : null}
                    </div>

                    <div className="toolbar-setting-card">
                        <div className="toolbar-setting-head">
                            <label htmlFor={filenameTemplateId} className="toolbar-setting-eyebrow">
                                {t('settings.customFilenameTemplate')}
                            </label>
                        </div>
                        <p className="settings-field-hint">
                            {t('settings.customFilenameTemplateHint')}
                        </p>
                        <input
                            id={filenameTemplateId}
                            type="text"
                            className="input toolbar-setting-select"
                            value={filenameDraft}
                            onChange={(e) => setFilenameDraft(e.target.value)}
                            onBlur={() => void onCustomFilenameTemplateChange(filenameDraft)}
                            placeholder={t('settings.customFilenameTemplatePlaceholder')}
                            autoComplete="off"
                            dir="ltr"
                        />
                    </div>

                    <div className="toolbar-setting-card">
                        <div className="toolbar-setting-head">
                            <span className="toolbar-setting-eyebrow">
                                {t('settings.videoContainer')}
                            </span>
                        </div>
                        <CustomSelect
                            className="toolbar-setting-select"
                            value={advancedDownloadDefaults.output.videoContainer}
                            onChange={(value) =>
                                void onPatchAdvancedDownloadDefaults({
                                    output: {
                                        videoContainer: value as VideoContainer
                                    }
                                })
                            }
                            options={videoContainerOptions}
                            aria-label={t('settings.videoContainer')}
                        />
                        <span className="toolbar-setting-eyebrow settings-field-spaced">
                            {t('settings.audioFormat')}
                        </span>
                        <CustomSelect
                            className="toolbar-setting-select"
                            value={advancedDownloadDefaults.output.audioFormat}
                            onChange={(value) =>
                                void onPatchAdvancedDownloadDefaults({
                                    output: {
                                        audioFormat: value as AudioOutputFormat
                                    }
                                })
                            }
                            options={audioFormatOptions}
                            aria-label={t('settings.audioFormat')}
                        />
                    </div>

                    <div className="toolbar-setting-card">
                        <div className="toolbar-setting-head">
                            <span className="toolbar-setting-eyebrow">
                                {t('settings.sponsorBlock')}
                            </span>
                        </div>
                        <CustomSelect
                            className="toolbar-setting-select"
                            value={advancedDownloadDefaults.sponsorblock.mode}
                            onChange={(value) =>
                                void onPatchAdvancedDownloadDefaults({
                                    sponsorblock: {
                                        mode: value as AdvancedDownloadDefaults['sponsorblock']['mode']
                                    }
                                })
                            }
                            options={sponsorBlockModeOptions}
                            aria-label={t('settings.sponsorBlockMode')}
                        />
                        <p className="settings-field-hint">
                            {t('settings.sponsorBlockCategoriesHint')}
                        </p>
                    </div>

                    <div className="toolbar-setting-card settings-toggles">
                        <label className="settings-checkbox-row">
                            <input
                                type="checkbox"
                                checked={advancedDownloadDefaults.archive.enabled}
                                onChange={(e) =>
                                    void onPatchAdvancedDownloadDefaults({
                                        archive: { enabled: e.target.checked }
                                    })
                                }
                            />
                            {t('settings.archiveEnabled')}
                        </label>
                        <p className="settings-field-hint">{t('settings.archiveEnabledHint')}</p>
                    </div>
                </div>
            </section>
        </div>
    );
}
