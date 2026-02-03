// Este script roda NO CONTEXTO DA PÁGINA (não no contexto isolado da extensão)
// Configurado via manifest.json com "world": "MAIN"

console.log('%c========================================', 'color: #FF0000; font-size: 20px; font-weight: bold;');
console.log('%c   INTERCEPTOR MAIN WORLD ATIVO!', 'color: #FF0000; font-size: 20px; font-weight: bold;');
console.log('%c========================================', 'color: #FF0000; font-size: 20px; font-weight: bold;');

// ===============================
// 🔧 FUNÇÕES DE DEBUG GLOBAIS
// ===============================
window.forceSaveTokenToStorage = function() {
    const token = localStorage.getItem('icecassino_token');
    if (!token) {
        console.error('%c❌ Nenhum token em localStorage!', 'color: #f44336; font-weight: bold;');
        console.log('💡 Faça uma recarga manual primeiro para capturar um token');
        return;
    }
    
    console.log('%c[DEBUG] 💾 FORÇANDO SALVAMENTO DO TOKEN', 'color: #FF9800; font-weight: bold; font-size: 14px;');
    console.log('[DEBUG] Token:', token.substring(0, 20) + '...');
    
    // Enviar mensagem para o content script (betsite.js) salvar
    window.postMessage({
        type: 'ICE_RECHARGE_TOKEN_ACTUAL',  // ✅ Usar o tipo correto que betsite.js escuta
        token: token,
        url: 'manual_force',
        source: 'manual_force',
        method: 'FORCE'
    }, '*');
    
    console.log('%c[DEBUG] ✅ Mensagem enviada para betsite.js processar!', 'color: #4CAF50; font-weight: bold;');
    console.log('[DEBUG] Aguarde ver: "[ICE] ✅ Token salvo em chrome.storage.local com sucesso!"');
};

window.checkStorageStatus = function() {
    console.log('%c[DEBUG] 📊 STATUS DO STORAGE', 'color: #9C27B0; font-weight: bold; font-size: 14px;');
    console.log('═'.repeat(80));
    
    // localStorage (acessível no MAIN world)
    const localToken = localStorage.getItem('icecassino_token');
    console.log('1️⃣ localStorage:');
    console.log('   icecassino_token:', localToken ? localToken.substring(0, 20) + '...' : '❌ VAZIO');
    console.log('   icecassino_token_source:', localStorage.getItem('icecassino_token_source') || 'N/A');
    console.log('   icecassino_token_time:', localStorage.getItem('icecassino_token_time') || 'N/A');
    
    // chrome.storage.local (apenas acessível via content script)
    console.log('\n2️⃣ chrome.storage.local:');
    console.log('   ⏳ Solicitando do betsite.js...');
    
    // Enviar mensagem para betsite.js verificar
    window.postMessage({
        type: 'CHECK_STORAGE_REQUEST'
    }, '*');
    
    console.log('   💡 A resposta aparecerá nos logs do betsite.js');
    console.log('═'.repeat(80));
};

console.log('%c[MAIN] 🔧 Funções de debug disponíveis:', 'color: #2196F3; font-weight: bold;');
console.log('  → window.forceSaveTokenToStorage()');
console.log('  → window.checkStorageStatus()');

// ===============================
// MD5 HOOK (capture input used by page)
// ===============================
window.__ice_hash_hooked = false;
window.__ice_last_recharge_ts = 0;
window.__ice_last_token = '';
window.__ice_last_token_ts = 0;
window.__ice_skip_md5_log = false;
window.__ice_storage_hooked = false;

function isTokenMatch(output) {
    if (!output || !window.__ice_last_token) return false;
    const now = Date.now();
    if (!window.__ice_last_token_ts || (now - window.__ice_last_token_ts) > 5000) return false;
    const match = String(output).toLowerCase() === String(window.__ice_last_token).toLowerCase();
    if (match) {
        console.log('[MAIN] 🎯 MD5 output MATCHES last token!');
    }
    return match;
}

function logSignMatch(source, input, output, extra) {
    console.log(`[MAIN] ✅ SIGN MATCH (${source})`);
    console.log('[MAIN] Input:', input);
    console.log('[MAIN] Output:', output);
    if (extra) console.log('[MAIN] Extra:', extra);
    window.postMessage({
        type: 'ICE_SIGN_FOUND',
        source,
        input,
        output,
        extra: extra || ''
    }, '*');
}

function hookHashFunction(obj, name, typeLabel, outputFormatter) {
    if (!obj || typeof obj[name] !== 'function') return false;
    if (obj[name].__ice_hooked) return true;
    const orig = obj[name];
    obj[name] = function(input) {
        const result = orig.apply(this, arguments);
        let output = result;
        try {
            output = outputFormatter ? outputFormatter(result) : result;
        } catch (e) {
            output = result;
        }
        
        // Log for debugging: capture all MD5 inputs
        try {
            const inputStr = typeof input === 'string' ? input : String(input);
            if (inputStr.includes('=') && (inputStr.includes('uid') || inputStr.includes('amount'))) {
                console.log(`[MAIN] 📝 ${typeLabel} input: ${inputStr.substring(0, 100)}`);
                console.log(`[MAIN]     output: ${output}`);
            }
        } catch (e) {}
        
        if (!window.__ice_skip_md5_log && isTokenMatch(output)) {
            logSignMatch(typeLabel, input, output);
        }
        return result;
    };
    obj[name].__ice_hooked = true;
    console.log(`[MAIN] ✅ Hook ${typeLabel} instalado`);
    return true;
}

function hookCryptoSubtle() {
    try {
        if (!window.crypto || !window.crypto.subtle || window.crypto.subtle.__ice_hooked) return false;
        const orig = window.crypto.subtle.digest.bind(window.crypto.subtle);
        window.crypto.subtle.digest = async function(algorithm, data) {
            const res = await orig(algorithm, data);
            try {
                const hex = Array.from(new Uint8Array(res)).map(b => b.toString(16).padStart(2, '0')).join('');
                if (!window.__ice_skip_md5_log && isTokenMatch(hex)) {
                    let input = '';
                    try {
                        input = new TextDecoder().decode(data);
                    } catch (e) {
                        input = '[binary]';
                    }
                    logSignMatch(`crypto.subtle:${algorithm?.name || 'digest'}`, input, hex);
                }
            } catch (e) {
                // ignore
            }
            return res;
        };
        window.crypto.subtle.__ice_hooked = true;
        console.log('[MAIN] ✅ Hook crypto.subtle.digest instalado');
        return true;
    } catch (e) {
        return false;
    }
}

function hookHashes() {
    const md5Hooked = hookHashFunction(window, 'md5', 'window.md5', (r) => r);
    hookHashFunction(window, 'hex_md5', 'window.hex_md5', (r) => r);
    hookHashFunction(window, 'md5Hex', 'window.md5Hex', (r) => r);
    const sha1Hooked = hookHashFunction(window, 'sha1', 'window.sha1', (r) => r);
    const sha256Hooked = hookHashFunction(window, 'sha256', 'window.sha256', (r) => r);
    const sha512Hooked = hookHashFunction(window, 'sha512', 'window.sha512', (r) => r);

    if (window.SparkMD5) {
        hookHashFunction(window.SparkMD5, 'hash', 'SparkMD5.hash', (r) => r);
        if (window.SparkMD5.ArrayBuffer) {
            hookHashFunction(window.SparkMD5.ArrayBuffer, 'hash', 'SparkMD5.ArrayBuffer.hash', (r) => r);
        }
    }

    if (window.CryptoJS) {
        hookHashFunction(window.CryptoJS, 'MD5', 'CryptoJS.MD5', (r) => r && r.toString ? r.toString() : r);
        hookHashFunction(window.CryptoJS, 'SHA1', 'CryptoJS.SHA1', (r) => r && r.toString ? r.toString() : r);
        hookHashFunction(window.CryptoJS, 'SHA256', 'CryptoJS.SHA256', (r) => r && r.toString ? r.toString() : r);
        hookHashFunction(window.CryptoJS, 'SHA512', 'CryptoJS.SHA512', (r) => r && r.toString ? r.toString() : r);
        hookHashFunction(window.CryptoJS, 'HmacMD5', 'CryptoJS.HmacMD5', (r) => r && r.toString ? r.toString() : r);
        hookHashFunction(window.CryptoJS, 'HmacSHA256', 'CryptoJS.HmacSHA256', (r) => r && r.toString ? r.toString() : r);
    }

    hookCryptoSubtle();

    if (md5Hooked || sha1Hooked || sha256Hooked || sha512Hooked || window.CryptoJS) {
        window.__ice_hash_hooked = true;
    }
}

// Tentar instalar hook imediatamente e a cada 1s até achar
hookHashes();
setInterval(hookHashes, 1000);

// ===============================
// STORAGE HOOKS (capture token sources)
// ===============================
function hookStorageSetters() {
    if (window.__ice_storage_hooked) return;
    try {
        const lsSet = localStorage.setItem.bind(localStorage);
        localStorage.setItem = function(key, value) {
            try {
                if (typeof value === 'string' && /^[0-9a-f]{32}$/i.test(value)) {
                    console.log('[MAIN] 🧩 localStorage token set:', key, value);
                    window.postMessage({ type: 'ICE_TOKEN_SOURCE', source: `localStorage:${key}`, value }, '*');
                }
            } catch (e) {
                // ignore
            }
            return lsSet(key, value);
        };
    } catch (e) {
        // ignore
    }

    try {
        const ssSet = sessionStorage.setItem.bind(sessionStorage);
        sessionStorage.setItem = function(key, value) {
            try {
                if (typeof value === 'string' && /^[0-9a-f]{32}$/i.test(value)) {
                    console.log('[MAIN] 🧩 sessionStorage token set:', key, value);
                    window.postMessage({ type: 'ICE_TOKEN_SOURCE', source: `sessionStorage:${key}`, value }, '*');
                }
            } catch (e) {
                // ignore
            }
            return ssSet(key, value);
        };
    } catch (e) {
        // ignore
    }

    window.__ice_storage_hooked = true;
    console.log('[MAIN] ✅ Hook storage.setItem instalado');
}

function findTokenSources(token) {
    const sources = [];
    if (!token) return sources;
    const tokenEnc = encodeURIComponent(token);
    const tokenLower = token.toLowerCase();

    try {
        for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            const v = localStorage.getItem(k);
            if (!v) continue;
            if (v === token || v.toLowerCase() === tokenLower || v === tokenEnc) {
                sources.push(`localStorage:${k}`);
            }
        }
    } catch (e) {
        // ignore
    }

    try {
        for (let i = 0; i < sessionStorage.length; i++) {
            const k = sessionStorage.key(i);
            const v = sessionStorage.getItem(k);
            if (!v) continue;
            if (v === token || v.toLowerCase() === tokenLower || v === tokenEnc) {
                sources.push(`sessionStorage:${k}`);
            }
        }
    } catch (e) {
        // ignore
    }

    try {
        const cookies = document.cookie ? document.cookie.split(';') : [];
        for (const c of cookies) {
            const [rawK, ...rest] = c.split('=');
            const k = rawK ? rawK.trim() : '';
            const v = rest.join('=').trim();
            if (!k || !v) continue;
            if (v === token || v.toLowerCase() === tokenLower || v === tokenEnc) {
                sources.push(`cookie:${k}`);
            }
        }
    } catch (e) {
        // ignore
    }

    return sources;
}

hookStorageSetters();
setInterval(hookStorageSetters, 1000);

// ===============================
// MD5 IMPLEMENTATION (inline)
// ===============================
function md5(string) {
    function RotateLeft(lValue, iShiftBits) {
        return (lValue << iShiftBits) | (lValue >>> (32 - iShiftBits));
    }
    function AddUnsigned(lX, lY) {
        var lX4, lY4, lX8, lY8, lResult;
        lX8 = (lX & 0x80000000);
        lY8 = (lY & 0x80000000);
        lX4 = (lX & 0x40000000);
        lY4 = (lY & 0x40000000);
        lResult = (lX & 0x3FFFFFFF) + (lY & 0x3FFFFFFF);
        if (lX4 & lY4) {
            return (lResult ^ 0x80000000 ^ lX8 ^ lY8);
        }
        if (lX4 | lY4) {
            if (lResult & 0x40000000) {
                return (lResult ^ 0xC0000000 ^ lX8 ^ lY8);
            } else {
                return (lResult ^ 0x40000000 ^ lX8 ^ lY8);
            }
        } else {
            return (lResult ^ lX8 ^ lY8);
        }
    }
    function F(x, y, z) { return (x & y) | ((~x) & z); }
    function G(x, y, z) { return (x & z) | (y & (~z)); }
    function H(x, y, z) { return (x ^ y ^ z); }
    function I(x, y, z) { return (y ^ (x | (~z))); }
    function FF(a, b, c, d, x, s, ac) {
        a = AddUnsigned(a, AddUnsigned(AddUnsigned(F(b, c, d), x), ac));
        return AddUnsigned(RotateLeft(a, s), b);
    }
    function GG(a, b, c, d, x, s, ac) {
        a = AddUnsigned(a, AddUnsigned(AddUnsigned(G(b, c, d), x), ac));
        return AddUnsigned(RotateLeft(a, s), b);
    }
    function HH(a, b, c, d, x, s, ac) {
        a = AddUnsigned(a, AddUnsigned(AddUnsigned(H(b, c, d), x), ac));
        return AddUnsigned(RotateLeft(a, s), b);
    }
    function II(a, b, c, d, x, s, ac) {
        a = AddUnsigned(a, AddUnsigned(AddUnsigned(I(b, c, d), x), ac));
        return AddUnsigned(RotateLeft(a, s), b);
    }
    function ConvertToWordArray(string) {
        var lWordCount;
        var lMessageLength = string.length;
        var lNumberOfWords_temp1 = lMessageLength + 8;
        var lNumberOfWords_temp2 = (lNumberOfWords_temp1 - (lNumberOfWords_temp1 % 64)) / 64;
        var lNumberOfWords = (lNumberOfWords_temp2 + 1) * 16;
        var lWordArray = Array(lNumberOfWords - 1);
        var lBytePosition = 0;
        var lByteCount = 0;
        while (lByteCount < lMessageLength) {
            lWordCount = (lByteCount - (lByteCount % 4)) / 4;
            lBytePosition = (lByteCount % 4) * 8;
            lWordArray[lWordCount] = (lWordArray[lWordCount] | (string.charCodeAt(lByteCount) << lBytePosition));
            lByteCount++;
        }
        lWordCount = (lByteCount - (lByteCount % 4)) / 4;
        lBytePosition = (lByteCount % 4) * 8;
        lWordArray[lWordCount] = lWordArray[lWordCount] | (0x80 << lBytePosition);
        lWordArray[lNumberOfWords - 2] = lMessageLength << 3;
        lWordArray[lNumberOfWords - 1] = lMessageLength >>> 29;
        return lWordArray;
    }
    function WordToHex(lValue) {
        var WordToHexValue = "", WordToHexValue_temp = "", lByte, lCount;
        for (lCount = 0; lCount <= 3; lCount++) {
            lByte = (lValue >>> (lCount * 8)) & 255;
            WordToHexValue_temp = "0123456789abcdef".charAt(lByte & 15);
            WordToHexValue_temp = "0123456789abcdef".charAt((lByte >>> 4) & 15) + WordToHexValue_temp;
            WordToHexValue = WordToHexValue + WordToHexValue_temp;
        }
        return WordToHexValue;
    }
    var x = Array();
    var k, AA, BB, CC, DD, a, b, c, d;
    var S11 = 7, S12 = 12, S13 = 17, S14 = 22;
    var S21 = 5, S22 = 9, S23 = 14, S24 = 20;
    var S31 = 4, S32 = 11, S33 = 16, S34 = 23;
    var S41 = 6, S42 = 10, S43 = 15, S44 = 21;
    string = unescape(encodeURIComponent(string));
    x = ConvertToWordArray(string);
    a = 0x67452301; b = 0xefcdab89; c = 0x98badcfe; d = 0x10325476;
    for (k = 0; k < x.length; k += 16) {
        AA = a; BB = b; CC = c; DD = d;
        a = FF(a, b, c, d, x[k + 0], S11, 0xd76aa478);
        d = FF(d, a, b, c, x[k + 1], S12, 0xe8c7b756);
        c = FF(c, d, a, b, x[k + 2], S13, 0x242070db);
        b = FF(b, c, d, a, x[k + 3], S14, 0xc1bdceee);
        a = FF(a, b, c, d, x[k + 4], S11, 0xf57c0faf);
        d = FF(d, a, b, c, x[k + 5], S12, 0x4787c62a);
        c = FF(c, d, a, b, x[k + 6], S13, 0xa8304613);
        b = FF(b, c, d, a, x[k + 7], S14, 0xfd469501);
        a = FF(a, b, c, d, x[k + 8], S11, 0x698098d8);
        d = FF(d, a, b, c, x[k + 9], S12, 0x8b44f7af);
        c = FF(c, d, a, b, x[k + 10], S13, 0xffff5bb1);
        b = FF(b, c, d, a, x[k + 11], S14, 0x895cd7be);
        a = FF(a, b, c, d, x[k + 12], S11, 0x6b901122);
        d = FF(d, a, b, c, x[k + 13], S12, 0xfd987193);
        c = FF(c, d, a, b, x[k + 14], S13, 0xa679438e);
        b = FF(b, c, d, a, x[k + 15], S14, 0x49b40821);
        a = GG(a, b, c, d, x[k + 1], S21, 0xf61e2562);
        d = GG(d, a, b, c, x[k + 6], S22, 0xc040b340);
        c = GG(c, d, a, b, x[k + 11], S23, 0x265e5a51);
        b = GG(b, c, d, a, x[k + 0], S24, 0xe9b6c7aa);
        a = GG(a, b, c, d, x[k + 5], S21, 0xd62f105d);
        d = GG(d, a, b, c, x[k + 10], S22, 0x2441453);
        c = GG(c, d, a, b, x[k + 15], S23, 0xd8a1e681);
        b = GG(b, c, d, a, x[k + 4], S24, 0xe7d3fbc8);
        a = GG(a, b, c, d, x[k + 9], S21, 0x21e1cde6);
        d = GG(d, a, b, c, x[k + 14], S22, 0xc33707d6);
        c = GG(c, d, a, b, x[k + 3], S23, 0xf4d50d87);
        b = GG(b, c, d, a, x[k + 8], S24, 0x455a14ed);
        a = GG(a, b, c, d, x[k + 13], S21, 0xa9e3e905);
        d = GG(d, a, b, c, x[k + 2], S22, 0xfcefa3f8);
        c = GG(c, d, a, b, x[k + 7], S23, 0x676f02d9);
        b = GG(b, c, d, a, x[k + 12], S24, 0x8d2a4c8a);
        a = HH(a, b, c, d, x[k + 5], S31, 0xfffa3942);
        d = HH(d, a, b, c, x[k + 8], S32, 0x8771f681);
        c = HH(c, d, a, b, x[k + 11], S33, 0x6d9d6122);
        b = HH(b, c, d, a, x[k + 14], S34, 0xfde5380c);
        a = HH(a, b, c, d, x[k + 1], S31, 0xa4beea44);
        d = HH(d, a, b, c, x[k + 4], S32, 0x4bdecfa9);
        c = HH(c, d, a, b, x[k + 7], S33, 0xf6bb4b60);
        b = HH(b, c, d, a, x[k + 10], S34, 0xbebfbc70);
        a = HH(a, b, c, d, x[k + 13], S31, 0x289b7ec6);
        d = HH(d, a, b, c, x[k + 0], S32, 0xeaa127fa);
        c = HH(c, d, a, b, x[k + 3], S33, 0xd4ef3085);
        b = HH(b, c, d, a, x[k + 6], S34, 0x4881d05);
        a = HH(a, b, c, d, x[k + 9], S31, 0xd9d4d039);
        d = HH(d, a, b, c, x[k + 12], S32, 0xe6db99e5);
        c = HH(c, d, a, b, x[k + 15], S33, 0x1fa27cf8);
        b = HH(b, c, d, a, x[k + 2], S34, 0xc4ac5665);
        a = II(a, b, c, d, x[k + 0], S41, 0xf4292244);
        d = II(d, a, b, c, x[k + 7], S42, 0x432aff97);
        c = II(c, d, a, b, x[k + 14], S43, 0xab9423a7);
        b = II(b, c, d, a, x[k + 5], S44, 0xfc93a039);
        a = II(a, b, c, d, x[k + 12], S41, 0x655b59c3);
        d = II(d, a, b, c, x[k + 3], S42, 0x8f0ccc92);
        c = II(c, d, a, b, x[k + 10], S43, 0xffeff47d);
        b = II(b, c, d, a, x[k + 1], S44, 0x85845dd1);
        a = II(a, b, c, d, x[k + 8], S41, 0x6fa87e4f);
        d = II(d, a, b, c, x[k + 15], S42, 0xfe2ce6e0);
        c = II(c, d, a, b, x[k + 6], S43, 0xa3014314);
        b = II(b, c, d, a, x[k + 13], S44, 0x4e0811a1);
        a = II(a, b, c, d, x[k + 4], S41, 0xf7537e82);
        d = II(d, a, b, c, x[k + 11], S42, 0xbd3af235);
        c = II(c, d, a, b, x[k + 2], S43, 0x2ad7d2bb);
        b = II(b, c, d, a, x[k + 9], S44, 0xeb86d391);
        a = AddUnsigned(a, AA);
        b = AddUnsigned(b, BB);
        c = AddUnsigned(c, CC);
        d = AddUnsigned(d, DD);
    }
    var temp = WordToHex(a) + WordToHex(b) + WordToHex(c) + WordToHex(d);
    return temp.toLowerCase();
}

// Salvar XMLHttpRequest original IMEDIATAMENTE (antes de qualquer biblioteca modificar)
const OriginalXHR = XMLHttpRequest;
const origOpen = OriginalXHR.prototype.open;
const origSend = OriginalXHR.prototype.send;
const origSetHeader = OriginalXHR.prototype.setRequestHeader;

const xhrData = new WeakMap();

// ===============================
// ASSINATURA (SIGN) - DETECÇÃO E REUSO
// ===============================

const SIGN_HELPER = {
    pattern: null,
    md5: null,
    lastDetected: null,
    init() {
        // Use the inline md5 function defined above
        this.md5 = md5;
        console.log('[MAIN] 🔑 MD5 init:');
        console.log('  - md5 function available:', typeof this.md5 === 'function');
        if (this.md5) {
            // Test MD5
            try {
                const testHash = this.hash('test');
                console.log('  - Test hash("test"):', testHash);
                if (testHash === '098f6bcd4621d373cade4e832627b4f6') {
                    console.log('  - ✅ MD5 is working correctly!');
                } else {
                    console.warn('  - ⚠️ MD5 hash mismatch. Expected 098f6bcd4621d373cade4e832627b4f6, got:', testHash);
                }
            } catch (e) {
                console.error('  - Test hash failed:', e.message);
            }
        }
    },
    buildQuery(params) {
        const keys = ['uid', 'key', 'amount', 'pid', 'return_url', 'pay_method', 'type'];
        return keys
            .filter(k => params[k] !== undefined && params[k] !== null)
            .map(k => `${k}=${params[k]}`)
            .join('&');
    },
    buildSortedQuery(params) {
        return Object.keys(params)
            .filter(k => k !== 'sign')
            .sort()
            .map(k => `${k}=${params[k]}`)
            .join('&');
    },
    candidates(params, token) {
        const q = this.buildQuery(params);
        const qs = this.buildSortedQuery(params);
        return [
            { id: 'q', value: q },
            { id: 'qs', value: qs },
            { id: 'q+key', value: q + (params.key || '') },
            { id: 'key+q', value: (params.key || '') + q },
            { id: 'q+token', value: q + (token || '') },
            { id: 'token+q', value: (token || '') + q },
            { id: 'uid+amount+key', value: `${params.uid || ''}${params.amount || ''}${params.key || ''}` },
            { id: 'uid+key+amount', value: `${params.uid || ''}${params.key || ''}${params.amount || ''}` },
            { id: 'uid+amount+key+token', value: `${params.uid || ''}${params.amount || ''}${params.key || ''}${token || ''}` },
            { id: 'q+key+token', value: q + (params.key || '') + (token || '') }
        ];
    },
    hash(value) {
        if (!this.md5) {
            console.warn('[SIGN_HELPER] ⚠️ MD5 não disponível');
            return null;
        }
        try {
            const h = this.md5(value);
            const result = typeof h === 'string' ? h : (h && h.toString ? h.toString() : null);
            return result;
        } catch (e) {
            console.error('[SIGN_HELPER] Hash error:', e.message);
            return null;
        }
    },
    detect(params, token, sign) {
        if (!sign || !this.md5) return null;
        const list = this.candidates(params, token);
        for (const c of list) {
            const h = this.hash(c.value);
            if (h && h.toLowerCase() === String(sign).toLowerCase()) {
                this.pattern = c.id;
                this.lastDetected = { pattern: c.id, base: c.value };
                console.log('%c[MAIN] ✅ SIGN detectado! Padrão:', 'color:#4CAF50; font-weight:bold;', c.id);
                return c.id;
            }
        }
        console.warn('[MAIN] ⚠️ Não foi possível detectar o padrão do SIGN');
        return null;
    },
    compute(params, token) {
        if (!this.pattern || !this.md5) return null;
        const list = this.candidates(params, token);
        const match = list.find(c => c.id === this.pattern);
        if (!match) return null;
        return this.hash(match.value);
    }
};

SIGN_HELPER.init();

const SIGN_KEY_DEFAULT = '8uhIUHIH323*&8';

function buildSortedQuery(params, encode) {
    return Object.keys(params)
        .sort()
        .map(k => {
            const key = encode ? encodeURIComponent(k) : k;
            const val = encode ? encodeURIComponent(params[k]) : params[k];
            return `${key}=${val}`;
        })
        .join('&');
}

const SIGN_PARAM_ORDER = ['uid', 'key', 'amount', 'pid', 'return_url', 'pay_method', 'type', 'gear', '_t'];

function buildOrderedQuery(params, encode, excludeKeys) {
    const exclude = excludeKeys ? new Set(excludeKeys) : null;
    return SIGN_PARAM_ORDER
        .filter(k => params[k] !== undefined && params[k] !== null && (!exclude || !exclude.has(k)))
        .map(k => {
            const key = encode ? encodeURIComponent(k) : k;
            const val = encode ? encodeURIComponent(params[k]) : params[k];
            return `${key}=${val}`;
        })
        .join('&');
}

function buildBodyRawFromString(bodyStr) {
    if (!bodyStr || typeof bodyStr !== 'string') return '';
    return bodyStr
        .split('&')
        .map(pair => {
            const eqIdx = pair.indexOf('=');
            if (eqIdx === -1) return pair;
            const k = pair.slice(0, eqIdx);
            const v = pair.slice(eqIdx + 1);
            let dec = v;
            try {
                dec = decodeURIComponent(v.replace(/\+/g, '%20'));
            } catch (e) {
                // keep original if decode fails
            }
            return `${k}=${dec}`;
        })
        .join('&');
}

function collectSecretCandidates(params, headers) {
    const list = [];
    const headerKey = headers && (headers.key || headers.Key || headers.KEY);

    list.push({ id: 'sign_key', value: SIGN_KEY_DEFAULT });
    if (headerKey) list.push({ id: 'header_key', value: headerKey });
    if (params && params.key) list.push({ id: 'param_key', value: params.key });
    list.push({ id: 'none', value: '' });

    // Local/session storage heuristics
    try {
        for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (!k) continue;
            if (!/sign|secret|salt|key/i.test(k)) continue;
            const v = localStorage.getItem(k);
            if (v && typeof v === 'string' && v.length >= 4 && v.length <= 128) {
                list.push({ id: `storage:${k}`, value: v });
            }
        }
    } catch (e) {
        // ignore
    }

    try {
        for (let i = 0; i < sessionStorage.length; i++) {
            const k = sessionStorage.key(i);
            if (!k) continue;
            if (!/sign|secret|salt|key/i.test(k)) continue;
            const v = sessionStorage.getItem(k);
            if (v && typeof v === 'string' && v.length >= 4 && v.length <= 128) {
                list.push({ id: `session:${k}`, value: v });
            }
        }
    } catch (e) {
        // ignore
    }

    // Cookies heuristics
    try {
        const cookies = document.cookie ? document.cookie.split(';') : [];
        for (const c of cookies) {
            const [rawK, ...rest] = c.split('=');
            const k = rawK ? rawK.trim() : '';
            if (!k || !/sign|secret|salt|key/i.test(k)) continue;
            const v = rest.join('=').trim();
            if (v && v.length >= 4 && v.length <= 128) {
                list.push({ id: `cookie:${k}`, value: v });
            }
        }
    } catch (e) {
        // ignore
    }

    // Deduplicate by value
    const seen = new Set();
    return list.filter(s => {
        if (s.value === undefined || s.value === null) return false;
        const key = String(s.value);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

function detectTokenAlgo(token, params, body, headers) {
    console.log('[MAIN] 🔍 detectTokenAlgo() INICIADO');
    console.log('[MAIN] Token:', token);
    console.log('[MAIN] MD5 disponível:', !!SIGN_HELPER.md5);
    console.log('[MAIN] Params:', params);
    
    if (!token || !SIGN_HELPER.md5 || !params) {
        console.warn('[MAIN] ⚠️ Faltam dados: token=', !!token, 'md5=', !!SIGN_HELPER.md5, 'params=', !!params);
        return null;
    }

    const bodyStr = typeof body === 'string' ? body : new URLSearchParams(params).toString();
    const bodyDecoded = (() => {
        try {
            return decodeURIComponent(bodyStr.replace(/\+/g, '%20'));
        } catch (e) {
            return bodyStr;
        }
    })();
    const bodyRaw = buildBodyRawFromString(bodyStr);
    const secrets = collectSecretCandidates(params, headers);

    console.log('[MAIN] 🔐 Secrets para testar:', secrets.map(s => s.id).join(', '));

    const candidates = [];

    for (const secret of secrets) {
        const paramsWithKey = secret.id === 'none' ? { ...params } : { ...params, sign_key: secret.value };
        const orderedRaw = buildOrderedQuery(params, false);
        const orderedEnc = buildOrderedQuery(params, true);
        const orderedRawNoReturn = buildOrderedQuery(params, false, ['return_url']);
        const orderedEncNoReturn = buildOrderedQuery(params, true, ['return_url']);
        const orderedRawNoKey = buildOrderedQuery(params, false, ['key']);
        const orderedEncNoKey = buildOrderedQuery(params, true, ['key']);

        candidates.push(
            { algo: 'sorted_raw_signkey', secret: secret.id, str: buildSortedQuery(paramsWithKey, false) },
            { algo: 'sorted_enc_signkey', secret: secret.id, str: buildSortedQuery(paramsWithKey, true) },
            { algo: 'sorted_raw_no_signkey', secret: secret.id, str: buildSortedQuery(params, false) },
            { algo: 'sorted_enc_no_signkey', secret: secret.id, str: buildSortedQuery(params, true) },

            { algo: 'sorted_raw_concat', secret: secret.id, str: `${buildSortedQuery(params, false)}${secret.value}` },
            { algo: 'sorted_raw_concat_prefix', secret: secret.id, str: `${secret.value}${buildSortedQuery(params, false)}` },
            { algo: 'sorted_enc_concat', secret: secret.id, str: `${buildSortedQuery(params, true)}${secret.value}` },
            { algo: 'sorted_enc_concat_prefix', secret: secret.id, str: `${secret.value}${buildSortedQuery(params, true)}` },

            { algo: 'body_signkey_param', secret: secret.id, str: secret.id === 'none' ? bodyStr : `${bodyStr}&sign_key=${secret.value}` },
            { algo: 'body_signkey_param_enc', secret: secret.id, str: secret.id === 'none' ? bodyStr : `${bodyStr}&sign_key=${encodeURIComponent(secret.value)}` },
            { algo: 'body_raw_param', secret: secret.id, str: secret.id === 'none' ? bodyRaw : `${bodyRaw}&sign_key=${secret.value}` },

            { algo: 'body_enc', secret: secret.id, str: bodyStr },
            { algo: 'body_decoded', secret: secret.id, str: bodyDecoded },
            { algo: 'body_raw', secret: secret.id, str: bodyRaw },

            { algo: 'body_enc_concat', secret: secret.id, str: `${bodyStr}${secret.value}` },
            { algo: 'body_enc_concat_prefix', secret: secret.id, str: `${secret.value}${bodyStr}` },
            { algo: 'body_decoded_concat', secret: secret.id, str: `${bodyDecoded}${secret.value}` },
            { algo: 'body_decoded_concat_prefix', secret: secret.id, str: `${secret.value}${bodyDecoded}` },
            { algo: 'body_raw_concat', secret: secret.id, str: `${bodyRaw}${secret.value}` },
            { algo: 'body_raw_concat_prefix', secret: secret.id, str: `${secret.value}${bodyRaw}` }
            ,
            { algo: 'ordered_raw', secret: secret.id, str: orderedRaw },
            { algo: 'ordered_enc', secret: secret.id, str: orderedEnc },
            { algo: 'ordered_raw_signkey_param', secret: secret.id, str: secret.id === 'none' ? orderedRaw : `${orderedRaw}&sign_key=${secret.value}` },
            { algo: 'ordered_enc_signkey_param', secret: secret.id, str: secret.id === 'none' ? orderedEnc : `${orderedEnc}&sign_key=${encodeURIComponent(secret.value)}` },
            { algo: 'ordered_raw_concat', secret: secret.id, str: `${orderedRaw}${secret.value}` },
            { algo: 'ordered_raw_concat_prefix', secret: secret.id, str: `${secret.value}${orderedRaw}` },
            { algo: 'ordered_enc_concat', secret: secret.id, str: `${orderedEnc}${secret.value}` },
            { algo: 'ordered_enc_concat_prefix', secret: secret.id, str: `${secret.value}${orderedEnc}` },
            { algo: 'ordered_raw_no_return', secret: secret.id, str: orderedRawNoReturn },
            { algo: 'ordered_enc_no_return', secret: secret.id, str: orderedEncNoReturn },
            { algo: 'ordered_raw_no_return_signkey_param', secret: secret.id, str: secret.id === 'none' ? orderedRawNoReturn : `${orderedRawNoReturn}&sign_key=${secret.value}` },
            { algo: 'ordered_enc_no_return_signkey_param', secret: secret.id, str: secret.id === 'none' ? orderedEncNoReturn : `${orderedEncNoReturn}&sign_key=${encodeURIComponent(secret.value)}` },
            { algo: 'ordered_raw_no_key', secret: secret.id, str: orderedRawNoKey },
            { algo: 'ordered_enc_no_key', secret: secret.id, str: orderedEncNoKey }
        );
    }

    console.log('[MAIN] 🧪 Testando', candidates.length, 'candidatos...');

    window.__ice_skip_md5_log = true;
    for (let i = 0; i < candidates.length; i++) {
        const c = candidates[i];
        const h = SIGN_HELPER.hash(c.str);
        
        if ((i % 8) === 0) {
            console.log(`[MAIN] 🧪 Testando candidato ${i}/${candidates.length}...`);
        }
        
        if (h && h.toLowerCase() === String(token).toLowerCase()) {
            console.log('%c[MAIN] ✅ Algo de SIGN detectado:', 'color:#4CAF50; font-weight:bold;', c.algo, 'secret:', c.secret);
            console.log('[MAIN] String assinado:', c.str);
            console.log('[MAIN] Hash calculado:', h);
            console.log('[MAIN] Token esperado:', token);
            
            const isBuiltin = ['sign_key', 'header_key', 'param_key', 'none'].includes(c.secret);
            window.postMessage({
                type: 'ICE_SIGN_ALGO',
                algo: c.algo,
                secret: isBuiltin ? c.secret : 'custom',
                secret_value: isBuiltin ? '' : (secrets.find(s => s.id === c.secret)?.value || '')
            }, '*');
            window.__ice_skip_md5_log = false;
            return c.algo;
        }
    }
    window.__ice_skip_md5_log = false;

    console.warn('[MAIN] ⚠️ Nenhum dos', candidates.length, 'candidatos correspondeu ao token');
    
    // Log dos 3 primeiros hashes para debug
    console.log('[MAIN] Amostra de hashes testados:');
    for (let i = 0; i < Math.min(3, candidates.length); i++) {
        const c = candidates[i];
        const h = SIGN_HELPER.hash(c.str);
        console.log(`  [${i}] ${c.algo}/${c.secret}: "${h}" vs "${token}"`);
    }
    
    // ✅ NOVA ESTRATÉGIA: Usar token do primeiro request como padrão
    // Se não conseguimos detectar, usar o padrão "sorted_raw_signkey" com "sign_key"
    console.log('[MAIN] 💡 Usando padrão fallback: sorted_raw_signkey com sign_key');
    window.postMessage({
        type: 'ICE_SIGN_ALGO',
        algo: 'sorted_raw_signkey',
        secret: 'sign_key'
    }, '*');
    
    return null;
}

function extractSignFromHeaders(headers) {
    if (!headers) return null;
    const entries = Object.entries(headers);
    for (const [k, v] of entries) {
        const key = String(k).toLowerCase();
        if (key.includes('sign')) {
            return { name: k, value: v };
        }
    }
    return null;
}

function parseBodyToParams(body) {
    try {
        if (typeof body !== 'string') return null;
        return Object.fromEntries(new URLSearchParams(body));
    } catch (e) {
        return null;
    }
}

function postRechargeTemplate(params, headers) {
    window.postMessage({
        type: 'ICE_RECHARGE_TEMPLATE',
        params,
        headers
    }, '*');
}

// Interceptar setRequestHeader
OriginalXHR.prototype.setRequestHeader = function(name, value) {
    let data = xhrData.get(this);
    if (!data) {
        data = { headers: {}, url: '', method: '' };
        xhrData.set(this, data);
    }
    data.headers[name] = value;
    
    // Detectar header 'token' APENAS em requisições de recarga
    if (name === 'token' && value && /^[0-9a-f]{32}$/i.test(value)) {
        // Verificar se é requisição de recarga
        if (data.url && data.url.includes('/api/v1/user/recharge')) {
            console.log('%c[MAIN] 🎯🎯🎯 TOKEN DE RECARGA DETECTADO!', 'color: #FF0000; font-size: 20px; font-weight: bold;');
            console.log('[MAIN] Token:', value);
            console.log('[MAIN] URL:', data.url);
            window.__ice_last_token = value;
            window.__ice_last_token_ts = Date.now();

            let stack = '';
            try {
                throw new Error('TokenHeaderTrace');
            } catch (e) {
                stack = e && e.stack ? e.stack : '';
            }
            if (stack) {
                console.log('[MAIN] 🔎 Token header stack:', stack);
            }
            
            // Enviar mensagem para ISOLATED world (content script normal)
            window.postMessage({
                type: 'ICE_TOKEN_CAPTURED_MAIN',
                token: value,
                url: data.url,
                method: data.method,
                source: 'recharge_token'
            }, '*');

            if (stack) {
                window.postMessage({
                    type: 'ICE_TOKEN_STACK',
                    token: value,
                    url: data.url,
                    stack
                }, '*');
            }

            const tokenSources = findTokenSources(value);
            if (tokenSources.length) {
                console.log('[MAIN] 🧩 Token encontrado em:', tokenSources);
                window.postMessage({
                    type: 'ICE_TOKEN_SOURCE_MATCH',
                    token: value,
                    sources: tokenSources
                }, '*');
            }
        }
    }
    
    return origSetHeader.call(this, name, value);
};

// Interceptar open
OriginalXHR.prototype.open = function(method, url) {
    let data = xhrData.get(this);
    if (!data) {
        data = { headers: {}, url: '', method: '' };
        xhrData.set(this, data);
    }
    data.url = url;
    data.method = method;
    
    if (method === 'POST' && url.includes('/api/v1/user/recharge')) {
        console.log('%c[MAIN] 🎯 REQUISIÇÃO DE RECARGA!', 'color: #2196F3; font-size: 16px; font-weight: bold;');
        console.log('[MAIN] Method:', method);
        console.log('[MAIN] URL:', url);
        data.isRecharge = true;
    }
    
    return origOpen.apply(this, arguments);
};

// Interceptar send
OriginalXHR.prototype.send = function(body) {
    const data = xhrData.get(this);
    
    if (data && data.isRecharge) {
        window.__ice_last_recharge_ts = Date.now();
        console.log('%c[MAIN] 📤 ENVIANDO REQUISIÇÃO DE RECARGA', 'color: #FF9800; font-size: 14px; font-weight: bold;');
        console.log('[MAIN] URL:', data.url);
        console.log('[MAIN] Method:', data.method);
        console.log('[MAIN] Headers:', data.headers);
        console.log('[MAIN] Body length:', typeof body === 'string' ? body.length : 'unknown');
        console.log('[MAIN] Body:', typeof body === 'string' ? body : body);
        
        // Parse and log body params
        try {
            if (typeof body === 'string' && body.includes('=')) {
                const params = new URLSearchParams(body);
                console.log('[MAIN] 📊 Body params:');
                for (const [key, value] of params.entries()) {
                    console.log(`  ${key}: ${value}`);
                }
            }
        } catch (e) {
            // ignore
        }
        
        const token = data.headers.token || data.headers.Token || data.headers.TOKEN;
        if (token) {
            console.log('%c[MAIN] ✅✅✅ TOKEN CONFIRMADO!', 'color: #4CAF50; font-size: 18px; font-weight: bold;');
            console.log('[MAIN] Token:', token);
            console.log('[MAIN] 🔍 Investigando origem do token...');
            
            // Log se o token parece ser MD5
            if (/^[0-9a-f]{32}$/i.test(token)) {
                console.log('[MAIN] ✅ Token é válido (32 chars hex)');
            }
            
            // Log para debug: verificar se é a mesma request
            const isAuto = !!(data.headers && (data.headers['x-ice-auto'] || data.headers['X-ICE-AUTO'] || data.headers['x-ICE-auto']));
            if (isAuto) {
                console.log('[MAIN] 🔴 Requisição AUTO detectada');
                console.log('[MAIN] ⚠️ IMPORTANTE: O token pode estar vindo de uma requisição anterior!');
            }
            
            // Enviar token para storage via content script
            window.postMessage({
                type: 'ICE_RECHARGE_TOKEN_ACTUAL',
                token: token,
                url: data.url,
                method: data.method,
                isAuto: isAuto,
                timestamp: Date.now()
            }, '*');
        } else {
            console.warn('%c[MAIN] ⚠️ Token NÃO encontrado nos headers!', 'color: #FF9800; font-weight: bold;');
            console.log('[MAIN] Headers disponíveis:', Object.keys(data.headers));
        }

        const params = parseBodyToParams(body);
        const isAuto = !!(data.headers && (data.headers['x-ice-auto'] || data.headers['X-ICE-AUTO'] || data.headers['x-ICE-auto']));
        if (params && !isAuto) {
            postRechargeTemplate(params, data.headers);
            const sign = params.sign;
            if (sign) {
                console.log('[MAIN] 🔑 SIGN recebido no body:', sign);
                console.log('[MAIN] 📤 Enviando SIGN para betsite.js...');
                // Send the actual sign value that Ice Casino calculated
                window.postMessage({
                    type: 'ICE_MD5_INPUT',
                    input: `uid=${params.uid}&key=${params.key}&amount=${params.amount}&pid=${params.pid}&pay_method=${params.pay_method}&type=${params.type}&return_url=${params.return_url}`,
                    output: sign
                }, '*');
                SIGN_HELPER.detect(params, token, sign);
            } else {
                console.log('[MAIN] ⚠️ Nenhum SIGN encontrado no body da requisição');
                console.log('[MAIN] 📋 Body params:', Object.keys(params));
            }
            detectTokenAlgo(token, params, body, data.headers);
        }

        const signHeader = extractSignFromHeaders(data.headers);
        if (signHeader && signHeader.value) {
            console.log('[MAIN] 🔑 SIGN recebido no header:', signHeader.name);
            if (params) {
                SIGN_HELPER.detect(params, token, signHeader.value);
            }
        }
    }
    
    return origSend.apply(this, arguments);
};

console.log('%c[MAIN] ✅ XHR Interceptor instalado com sucesso!', 'color: #4CAF50; font-size: 16px; font-weight: bold;');
console.log('[MAIN] ⏳ Aguardando requisições de recarga...');
console.log('[MAIN] 📡 Endpoint monitorado: /api/v1/user/recharge');
console.log('[MAIN] 🔑 Header monitorado: "token"');

// ===============================
// RECEBER PEDIDO DE RECARGA DO CONTENT SCRIPT
// ===============================

window.addEventListener('message', async (event) => {
    if (event.source !== window) return;
    const payload = event.data;
    if (!payload || payload.type !== 'ICE_RECHARGE_REQUEST_MAIN') return;

    const { requestId, data, token, key } = payload;

    try {
        const axiosInstance = window.axios || window.$axios || window.http;
        const url = 'https://d1yoh197nyhh3m.bzcfgm.com/api/v1/user/recharge';
        let responseData = null;
        let statusCode = 0;

        // Se já detectamos padrão de SIGN, calcular
        if (SIGN_HELPER.pattern && !data.sign) {
            const computed = SIGN_HELPER.compute(data, token);
            if (computed) {
                data.sign = computed;
                console.log('[MAIN] ✅ SIGN aplicado automaticamente:', SIGN_HELPER.pattern);
            }
        }

        if (axiosInstance && typeof axiosInstance.post === 'function') {
            const formBody = new URLSearchParams(data).toString();
            const axiosResp = await axiosInstance.post(url, formBody, {
                headers: {
                    'Accept': 'application/json, text/plain, */*',
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'token': token,
                    'key': key,
                    'x-ice-auto': '1'
                }
            });
            responseData = axiosResp?.data ?? null;
            statusCode = axiosResp?.status ?? 0;
        } else {
            const fetchResp = await fetch(url, {
                method: 'POST',
                headers: {
                    'Accept': 'application/json, text/plain, */*',
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'token': token,
                    'key': key,
                    'x-ice-auto': '1'
                },
                body: new URLSearchParams(data).toString()
            });
            statusCode = fetchResp.status;
            responseData = await fetchResp.json();
        }

        window.postMessage({
            type: 'ICE_RECHARGE_RESPONSE_MAIN',
            requestId,
            ok: true,
            status: statusCode,
            data: responseData
        }, '*');
    } catch (err) {
        window.postMessage({
            type: 'ICE_RECHARGE_RESPONSE_MAIN',
            requestId,
            ok: false,
            error: err?.message || String(err)
        }, '*');
    }
});

// ===============================
// AXIOS INTERCEPTOR (CAPTURA SIGN/HEADERS)
// ===============================

function setupAxiosInterceptor() {
    if (window.__ICE_AXIOS_INTERCEPTOR_INSTALLED) return;
    const axiosInstance = window.axios || window.$axios || window.http;
    if (!axiosInstance || !axiosInstance.interceptors || !axiosInstance.interceptors.request) return;

    window.__ICE_AXIOS_INTERCEPTOR_INSTALLED = true;

    axiosInstance.interceptors.request.use((config) => {
        try {
            const url = config?.url || '';
            if (url.includes('/api/v1/user/recharge')) {
                const headers = config.headers || {};
                const data = typeof config.data === 'string' ? config.data : null;
                const params = parseBodyToParams(data);

                const isAuto = !!(headers && (headers['x-ice-auto'] || headers['X-ICE-AUTO'] || headers['x-ICE-auto']));
                if (params && !isAuto) {
                    postRechargeTemplate(params, headers);
                }

                const token = headers.token || headers.Token || headers.TOKEN;
                const signHeader = extractSignFromHeaders(headers);
                if (params && signHeader && signHeader.value) {
                    console.log('[MAIN] 🔑 SIGN header (axios):', signHeader.name);
                    SIGN_HELPER.detect(params, token, signHeader.value);
                }

                if (params && params.sign) {
                    console.log('[MAIN] 🔑 SIGN body (axios):', params.sign);
                    SIGN_HELPER.detect(params, token, params.sign);
                }
            }
        } catch (e) {
            console.warn('[MAIN] ⚠️ Erro no interceptor axios:', e);
        }
        return config;
    });

    console.log('%c[MAIN] ✅ Axios interceptor instalado', 'color:#4CAF50; font-weight:bold;');
}

setInterval(setupAxiosInterceptor, 2000);
