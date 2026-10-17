/**
 * Extract download URL from various API response structures.
 * Handles: string, object with url/download properties, nested result objects.
 * Returns: string URL or null if invalid/not found.
 */
function extractDownloadUrl(src) {
    if (!src) return null;
    
    // Direct string URL
    if (typeof src === 'string') {
        if (/^https?:\/\//i.test(src)) return src;
        return null;
    }
    
    // Object: check common property names
    const candidates = [
        src.downloadURL,
        src.downloadUrl,
        src.download_url,
        src.download?.downloadURL,
        src.download?.downloadUrl,
        src.download?.download_url,
        src.download,
        src.url,
        src.link,
        src.dl,
        src.audio,
        src.video,
        // Nested structures
        src.media?.url,
        src.media?.download,
        src.result?.downloadURL,
        src.result?.downloadUrl,
        src.result?.download,
        src.result?.url,
        src.result?.media?.url,
        src.data?.downloadURL,
        src.data?.downloadUrl,
        src.data?.download,
        src.data?.url,
        src.response?.url,
        src.response?.download,
        src.result?.audio,
        src.result?.video,
        src.data?.audio,
        src.data?.video
    ];
    
    for (const val of candidates) {
        if (typeof val === 'string' && /^https?:\/\//i.test(val)) {
            return val;
        }
    }
    
    return null;
}

/**
 * Check if URL is a fake "local-converter" marker from Siputzx
 */
function isLocalConverter(url) {
    if (!url || typeof url !== 'string') return false;
    return url.includes('#local-converter') || 
           url.startsWith('/local-converter') ||
           url === '#local-converter';
}

module.exports = { extractDownloadUrl, isLocalConverter };
