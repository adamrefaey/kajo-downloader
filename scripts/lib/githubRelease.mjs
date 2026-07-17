/**
 * Shared GitHub Releases API helpers for binary pin scripts.
 */

/**
 * @param {string} userAgent
 * @returns {Record<string, string>}
 */
export function githubApiHeaders(userAgent) {
    const headers = {
        Accept: 'application/vnd.github+json',
        'User-Agent': userAgent
    };
    const token = (process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN ?? '').trim();
    if (token) {
        headers.Authorization = `Bearer ${token}`;
    }
    return headers;
}

/**
 * @param {string} owner
 * @param {string} repo
 * @param {string} tag
 * @param {string} userAgent
 */
export async function getGitHubReleaseByTag(owner, repo, tag, userAgent) {
    const encoded = encodeURIComponent(tag);
    const url = `https://api.github.com/repos/${owner}/${repo}/releases/tags/${encoded}`;
    const response = await fetch(url, { headers: githubApiHeaders(userAgent) });

    if (!response.ok) {
        const body = await response.text().catch(() => '');
        throw new Error(
            `GitHub release lookup failed for ${owner}/${repo}@${tag}: ${response.status} ${response.statusText}\n${body}`
        );
    }

    const json = await response.json();
    if (!json?.tag_name || !Array.isArray(json.assets)) {
        throw new Error(`Unexpected GitHub release payload for ${owner}/${repo}@${tag}.`);
    }
    return json;
}

/**
 * @param {string} owner
 * @param {string} repo
 * @param {string} userAgent
 * @param {number} [page]
 */
export async function listGitHubReleases(owner, repo, userAgent, page = 1) {
    const url = `https://api.github.com/repos/${owner}/${repo}/releases?per_page=30&page=${page}`;
    const response = await fetch(url, { headers: githubApiHeaders(userAgent) });
    if (!response.ok) {
        const body = await response.text().catch(() => '');
        throw new Error(
            `GitHub releases list failed: ${response.status} ${response.statusText}\n${body}`
        );
    }
    return response.json();
}
