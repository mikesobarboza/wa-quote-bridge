/**
 * Generic credential extraction utilities
 * Supports extracting credentials from localStorage, cookies, and sessionStorage
 * 
 * @typedef {Object} StorageCredentials
 * @property {Record<string, any>} localStorage - localStorage data
 * @property {Record<string, any>} sessionStorage - sessionStorage data
 * @property {Array<{name: string, value: string, domain: string}>} cookies - Cookies array
 */

/**
 * Extracts all available storage data from a domain
 * Useful for discovering where a site stores authentication tokens
 * 
 * @param {string} url - The URL or domain to extract credentials from
 * @returns {Promise<{localStorage: Record<string, any>, sessionStorage: Record<string, any>, cookies: Array}>}
 */
async function extractAllCredentials(url) {
    const domain = new URL(url).hostname;

    // Get cookies for the domain
    const cookies = await chrome.cookies.getAll({ domain });

    // Get localStorage and sessionStorage via content script injection
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab?.id) {
        console.warn('[credentialExtractor] No active tab found, returning cookies only');
        return {
            localStorage: {},
            sessionStorage: {},
            cookies: cookies
        };
    }

    try {
        const result = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => {
                const local = {};
                const session = {};

                // Extract localStorage
                for (let i = 0; i < localStorage.length; i++) {
                    const key = localStorage.key(i);
                    if (key) {
                        try {
                            local[key] = JSON.parse(localStorage.getItem(key) || '');
                        } catch {
                            local[key] = localStorage.getItem(key);
                        }
                    }
                }

                // Extract sessionStorage
                for (let i = 0; i < sessionStorage.length; i++) {
                    const key = sessionStorage.key(i);
                    if (key) {
                        try {
                            session[key] = JSON.parse(sessionStorage.getItem(key) || '');
                        } catch {
                            session[key] = sessionStorage.getItem(key);
                        }
                    }
                }

                return { local, session };
            }
        });

        const storageData = result[0]?.result || { local: {}, session: {} };

        return {
            localStorage: storageData.local,
            sessionStorage: storageData.session,
            cookies: cookies,
        };
    } catch (e) {
        console.warn('[credentialExtractor] Error executing script:', e);
        return {
            localStorage: {},
            sessionStorage: {},
            cookies: cookies
        };
    }
}

/**
 * Searches for a specific key in all storage locations
 * 
 * @param {string} url - The URL or domain to search
 * @param {string} searchKey - The key to search for
 * @returns {Promise<{location: string, value: any} | null>}
 */
async function findCredential(url, searchKey) {
    const data = await extractAllCredentials(url);

    // Search in localStorage
    if (data.localStorage[searchKey]) {
        return { location: 'localStorage', value: data.localStorage[searchKey] };
    }

    // Search in sessionStorage
    if (data.sessionStorage[searchKey]) {
        return { location: 'sessionStorage', value: data.sessionStorage[searchKey] };
    }

    // Search in cookies
    const cookie = data.cookies.find(c => c.name === searchKey);
    if (cookie) {
        return { location: 'cookie', value: cookie.value };
    }

    return null;
}

/**
 * Gets cookies for a specific domain
 * 
 * @param {string} domain - The domain to get cookies for
 * @returns {Promise<Array>} Array of cookie objects
 */
async function getCookiesForDomain(domain) {
    return await chrome.cookies.getAll({ domain });
}
