import { parseHttpMediaUrl } from './mediaUrlResolver';

/**
 * User-visible explanation when a URL is rejected (keep in sync with
 * `errors:prohibitedAdultContentHost` / `validation:mediaUrlProhibitedContent` in i18n).
 */
export const PROHIBITED_ADULT_CONTENT_REASON =
    'Downloads from adult video sites are not supported in this app.';

/**
 * Registrable host suffixes for adult tube / cam sites that yt-dlp ships extractors for
 * (see https://github.com/yt-dlp/yt-dlp/blob/master/supportedsites.md), including the
 * Txxx / PornTop network domains from `yt_dlp/extractor/txxx.py`, `fourtube.py`, and
 * `xhamster.py` public host variants, plus common mirrors. Subdomains match via suffix
 * (e.g. m.pornhub.com, embed.redtube.com).
 */
const PROHIBITED_HOST_SUFFIXES: readonly string[] = [
    '4tube.com',
    'alphaporno.com',
    'ashemaletube.com',
    'beeg.com',
    'behindkink.com',
    'cam4.com',
    'cammodels.com',
    'camsoda.com',
    'chaturbate.com',
    'chaturbate.eu',
    'chaturbate.global',
    'drtuber.com',
    'empflix.com',
    'eporner.com',
    'erocast.me',
    'eroprofile.com',
    'fux.com',
    'goshgay.com',
    'hclips.com',
    'hdzog.com',
    'hdzog.tube',
    'hellporno.com',
    'hellporno.net',
    'hotmovs.com',
    'hotmovs.tube',
    'hqporner.com',
    'inporn.com',
    'lovehomeporn.com',
    'manyvids.com',
    'motherless.com',
    'moviefap.com',
    'murrtube.net',
    'noodlemagazine.com',
    'nonktube.com',
    'nubiles-porn.com',
    'onlyfans.com',
    'peekvids.com',
    'playvids.com',
    'pornbox.com',
    'pornerbros.com',
    'pornflip.com',
    'pornhub.com',
    'pornhub.net',
    'pornhub.org',
    'pornhubpremium.com',
    'pornmd.com',
    'pornovoisines.com',
    'pornotube.com',
    'pornoxo.com',
    'porntop.com',
    'porntrex.com',
    'porntube.com',
    'privatehomeclips.com',
    'redgifs.com',
    'redtube.com',
    'redtube.com.br',
    'rule34video.com',
    'sexu.com',
    'share-videos.se',
    'slutload.com',
    'spankbang.com',
    'stripchat.com',
    'sunporno.com',
    'thumbzilla.com',
    'thisvid.com',
    'tnaflix.com',
    'toypics.net',
    'tube8.com',
    'tubepornclassic.com',
    'txxx.com',
    'txxx.tube',
    'upornia.com',
    'upornia.tube',
    'vjav.com',
    'vjav.tube',
    'voyeurhit.com',
    'voyeurhit.tube',
    'vxxx.com',
    'xhday.com',
    'xhms.pro',
    'xhvid.com',
    'xhamster.com',
    'xhamster.desi',
    'xhamster.one',
    'xnxx.com',
    'xnxx3.com',
    'xvideos.com',
    'xvideos.es',
    'xvideos.red',
    'xvideos2.com',
    'xxxymovies.com',
    'youjizz.com',
    'youporn.com',
    'youporngay.com',
    'zenporn.com'
];

/** Hosts matching these patterns are blocked (locale TLDs / numbered brand hosts). */
const PROHIBITED_HOST_REGEXES: readonly RegExp[] = [
    /^(.+\.)?bongacams\d*\.(com|net)$/i,
    /^(.+\.)?xhamster\d+\.(com|desi)$/i
];

function normalizeHostname(hostname: string): string {
    return hostname
        .trim()
        .replace(/\.$/, '')
        .replace(/^www\./i, '')
        .toLowerCase();
}

function hostMatchesProhibitedSuffix(host: string, suffix: string): boolean {
    return host === suffix || host.endsWith(`.${suffix}`);
}

/**
 * Returns true when the URL's host is on the adult-content denylist (explicit suffixes,
 * dynamic patterns above, or `.xxx` / `xxx` registry host).
 */
export function isProhibitedAdultMediaUrl(rawInput: string): boolean {
    const parsed = parseHttpMediaUrl(rawInput.trim());
    if (!parsed) {
        return false;
    }
    const host = normalizeHostname(parsed.hostname);
    if (!host) {
        return false;
    }
    if (host === 'xxx' || host.endsWith('.xxx')) {
        return true;
    }
    for (const re of PROHIBITED_HOST_REGEXES) {
        if (re.test(host)) {
            return true;
        }
    }
    for (const suffix of PROHIBITED_HOST_SUFFIXES) {
        if (hostMatchesProhibitedSuffix(host, suffix)) {
            return true;
        }
    }
    return false;
}
