import type { SimpleIcon } from 'simple-icons';
import {
    siBandcamp,
    siBilibili,
    siDailymotion,
    siFacebook,
    siInstagram,
    siMixcloud,
    siNbc,
    siReddit,
    siRumble,
    siSoundcloud,
    siTiktok,
    siTwitch,
    siVimeo,
    siVk,
    siX,
    siYoutube
} from 'simple-icons';

/**
 * Bundled brand vectors for Site sessions quick picks (no remote favicon fetch).
 * Sites absent here use a small favicon fallback (see SiteSessionsQuickSignIn).
 */
export const SITE_QUICK_PICK_SIMPLE_ICON: Readonly<Partial<Record<string, SimpleIcon>>> = {
    youtube: siYoutube,
    tiktok: siTiktok,
    instagram: siInstagram,
    facebook: siFacebook,
    twitter: siX,
    twitch: siTwitch,
    vimeo: siVimeo,
    dailymotion: siDailymotion,
    reddit: siReddit,
    rumble: siRumble,
    bilibili: siBilibili,
    soundcloud: siSoundcloud,
    nbc: siNbc,
    vk: siVk,
    bandcamp: siBandcamp,
    mixcloud: siMixcloud
};
