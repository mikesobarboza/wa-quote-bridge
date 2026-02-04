// ============================================



// RECHARGE HANDLER - Processa recargas via extensÃ£o



// ============================================







console.log('[RECHARGE] Handler de recarga carregado');







// Verificar periodicamente por solicitaÃ§Ãµes de recarga



let checkInterval = null;







function startRechargeMonitoring() {



    console.log('[RECHARGE] Iniciando monitoramento de recargas...');



    



    checkInterval = setInterval(async () => {



        try {



            // Buscar solicitaÃ§Ã£o de recarga do backend



            const response = await fetch('http://127.0.0.1:8788/api/get_pending_recharge');



            



            if (!response.ok) {



                if (response.status === 404) {



                    // Sem pendÃªncias - isso Ã© normal



                    return;



                }



                console.warn('[RECHARGE] Erro ao buscar pendÃªncia:', response.status, response.statusText);



                return;



            }



            



            const data = await response.json();



            const status = data.status || '';



            const pending = data.data || data;



            



            if (status === 'pending' || status === 'success') {



                console.log('%c[RECHARGE] ðŸ”” SolicitaÃ§Ã£o de recarga recebida!', 



                          'color: #FF9800; font-weight: bold; font-size: 16px;');



                console.log('[RECHARGE] Dados:', pending);



                



                // Processar a recarga



                await processRecharge(pending.uid, pending.key, pending.amount, pending.request_id);



            }



        } catch (error) {



            // Erro silencioso apenas se for network error



            if (error.message && !error.message.includes('Failed to fetch')) {



                console.error('[RECHARGE] Erro:', error);



            }



        }



    }, 2000); // Verificar a cada 2 segundos



}







async function processRecharge(uid, key, amount, requestId, returnResultOnly = false) {



    console.log('[RECHARGE] Processando recarga...');



    console.log('[RECHARGE] UID:', uid);



    console.log('[RECHARGE] Amount:', amount);



    console.log('[RECHARGE] ðŸ’¡ O token serÃ¡ buscado de:');



    console.log('[RECHARGE]    1. localStorage (icecassino_token) - PREFERIDO');



    console.log('[RECHARGE]    2. Se nÃ£o encontrado, serÃ¡ gerado via MD5 - âš ï¸ PODE FALHAR');



    



    try {



        // Token agora Ã© assinatura MD5 (gerado abaixo)



        

        //  CORREÇÃO CRÍTICA: Calcular e adicionar sign field
        const secretValue = getSecretValue(signSecret, signKeyDefault, key, formPayload.key, signSecretValue);
        const bodyStr = new URLSearchParams(formPayload).toString();
        let sign = null;
        
        if (signAlgo) {
            sign = md5(buildSignString(signAlgo, formPayload, bodyStr, secretValue));
            console.log('[RECHARGE]  Campo sign CALCULADO com algoritmo:', signAlgo);
        } else {
            // Fallback: usar algoritmo padrão
            sign = md5(buildOrderedQuery(formPayload, false) + (secretValue || signKeyDefault));
            console.log('[RECHARGE]  sign calculado com fallback algorithm');
        }
        
        if (sign) {
            formPayload.sign = sign;
            console.log('[RECHARGE]  Sign adicionado ao payload:', sign.substring(0, 16) + '...');
        }
        
        console.log('[RECHARGE]  Form Payload Final (COM sign):', formPayload);



        const amountCentavos = Math.round(amount * 100);







        // Carregar template de recarga (se existir)



        let template = null;



        try {



            const t = await chrome.storage.local.get(['icecassino_recharge_template']);



            template = t.icecassino_recharge_template || null;



        } catch (e) {



            // ignore



        }







        let baseParams = {};



        if (template && template.params) {



            baseParams = { ...template.params };



            delete baseParams.sign; // sempre recomputar



        }







        const timestamp = Date.now();



        const signKeyDefault = baseParams.sign_key || '8uhIUHIH323*&8';







        // âœ… CONSTRUIR PAYLOAD PARA RECARGAS AUTOMÃTICAS



        // Usar valores do template se disponÃ­vel, senÃ£o usar valores apropriados para recargas



        const formPayload = {};



        



        // ParÃ¢metros obrigatÃ³rios (sempre presentes)



        formPayload.uid = uid;



        formPayload.key = key;



        formPayload.amount = amountCentavos.toString();



        formPayload.pid = baseParams.pid !== undefined ? baseParams.pid : '0';



        formPayload.return_url = baseParams.return_url !== undefined ? baseParams.return_url : 'https://th.betbuzz.cc/PayBack/';



        



        // âœ… IMPORTANTE: Sempre usar uwin-bindcard500 para recargas automÃ¡ticas (nÃ£o herdar do template)



        formPayload.pay_method = 'uwin-bindcard500';



        



        // Alinhar com requisiÃ§Ã£o manual capturada (type=0)



        formPayload.type = '0';



        



        // Remover parÃ¢metros extras que nÃ£o aparecem na requisiÃ§Ã£o manual



        delete formPayload.gear;



        delete formPayload._t;







        console.log('[RECHARGE] ðŸ”§ Form Payload Final (antes do sign):', formPayload);



        



        // âœ… CRITICAL: Calculate and add the sign field to the payload



        let signAlgo = null;



        let signSecret = null;



        let signSecretValue = null;



        try {



            const a = await chrome.storage.local.get(['icecassino_sign_algo', 'icecassino_sign_secret', 'icecassino_sign_secret_value']);



            signAlgo = a.icecassino_sign_algo || null;



            signSecret = a.icecassino_sign_secret || null;



            signSecretValue = a.icecassino_sign_secret_value || null;



        } catch (e) {



            console.log('[RECHARGE] âš ï¸ Erro ao ler algoritmo de sign do storage:', e.message);



        }







        // CORREÇÃO CRÍTICA: Calcular e adicionar sign field
        const secretValue = getSecretValue(signSecret, signKeyDefault, key, formPayload.key, signSecretValue);
        const bodyStr = new URLSearchParams(formPayload).toString();
        let sign = null;
        
        if (signAlgo) {
            sign = md5(buildSignString(signAlgo, formPayload, bodyStr, secretValue));
            console.log('[RECHARGE]  Campo sign CALCULADO com algoritmo:', signAlgo);
        } else {
            // Fallback: usar algoritmo padrão
            sign = md5(buildOrderedQuery(formPayload, false) + (secretValue || signKeyDefault));
            console.log('[RECHARGE]  sign calculado com fallback algorithm');
        }
        
        if (sign) {
            formPayload.sign = sign;
            console.log('[RECHARGE]  Sign adicionado ao payload:', sign.substring(0, 16) + '...');
        }
        
        console.log('[RECHARGE]  Form Payload Final (COM sign):', formPayload);





        const sign = null;



        console.log('[RECHARGE] âœ… Sem campo sign (alinhado com recarga manual).');



        console.log('[RECHARGE] ðŸ”§ Form Payload Final (SEM sign):', formPayload);



        



        const formData = new URLSearchParams(formPayload);







        // Preferir token capturado da pÃ¡gina (token real usado no header)



        let token = null;



        let storageDiags = null;



        try {



            // Primeiro, verificar TUDO no storage



            const allStorage = await chrome.storage.local.get(null);



            console.log('[RECHARGE] ðŸ” TODO o storage:', allStorage);



            console.log('[RECHARGE] ðŸ” Keys disponÃ­veis:', Object.keys(allStorage));



            



            const t = await chrome.storage.local.get(['icecassino_token']);



            storageDiags = t;



            console.log('[RECHARGE] ðŸ” Verificando token em storage:', t);



            if (t.icecassino_token) {



                console.log('[RECHARGE] ðŸ” Token encontrado:', t.icecassino_token);



                if (/^[0-9a-f]{32}$/i.test(t.icecassino_token)) {



                    token = t.icecassino_token;



                    console.log('[RECHARGE] âœ… Usando token capturado da pÃ¡gina:', token);



                } else {



                    console.log('[RECHARGE] âš ï¸ Token em storage nÃ£o passa na regex:', t.icecassino_token);



                }



            } else {



                console.log('[RECHARGE] âš ï¸ Nenhum token em storage');



                console.log('[RECHARGE] ðŸ’¡ Para capturar o token: faÃ§a uma recarga MANUAL no site Ice Casino');



                console.log('[RECHARGE] ðŸ’¡ O token serÃ¡ automaticamente armazenado e usado para recargas posteriores');



            }



        } catch (e) {



            console.log('[RECHARGE] âŒ Erro ao acessar storage:', e.message);



        }







        if (!token) {



            // Gerar token (assinatura MD5) como fallback - MAS ISSO PODE NÃƒO FUNCIONAR



            // O ideal Ã© capturar o token REAL que a pÃ¡gina usa



            console.log('[RECHARGE] âš ï¸ AVISO: Nenhum token capturado! Tentando gerar via MD5 (pode falhar)');



            console.log('[RECHARGE] ðŸ’¡ DICA: Recarregue a pÃ¡gina do cassino e faÃ§a uma recarga manual para capturar o token REAL');



            



            // Use the same signAlgo/Secret we loaded earlier



            const signParams = Object.fromEntries(formData.entries());



            const bodyStr = formData.toString();



            console.log('[RECHARGE] ðŸ“Š ParÃ¢metros para MD5:', signParams);



            console.log('[RECHARGE] ðŸ“ Body string para MD5:', bodyStr);



            



            const secretValue = getSecretValue(signSecret, signKeyDefault, key, signParams.key, signSecretValue);



            token = md5(buildSignString(signAlgo || 'sorted_raw_signkey', signParams, bodyStr, secretValue));



            if (!token) {



                console.error('[RECHARGE] âŒ Falha ao gerar token MD5');



                await notifyBackend(requestId, 'error', 'Falha ao gerar token');



                return;



            }



            console.log('[RECHARGE] âš ï¸ Token MD5 gerado como fallback:', token.substring(0, 16) + '...');



        }



        



        console.log('[RECHARGE] Enviando requisiÃ§Ã£o...');







        // Tentar via MAIN world (usa axios/interceptors da pÃ¡gina)



        const mainPayload = Object.fromEntries(formData.entries());



        



        // DEBUG: Verificar se hÃ¡ diferenÃ§as



        console.log('[RECHARGE] ðŸ” DIAGNÃ“STICO DO PAYLOAD:');



        console.log('[RECHARGE]   Token:', token ? token.substring(0, 16) + '...' : 'NENHUM');



        console.log('[RECHARGE]   Pay method:', mainPayload.pay_method);



        console.log('[RECHARGE]   Type:', mainPayload.type);



        console.log('[RECHARGE]   Tem campo "sign"?:', !!mainPayload.sign);



        



        // ðŸ”´ DEBUG COMPLETO DO PAYLOAD QUE SERÃ ENVIADO



        console.log('[RECHARGE] ðŸ“‹ PAYLOAD COMPLETO PARA ENVIO:');



        console.log('â•'.repeat(80));



        console.table(mainPayload);  // mainPayload jÃ¡ Ã© um objeto, nÃ£o precisa converter



        console.log('â•'.repeat(80));



        console.log('[RECHARGE] ðŸ“ PAYLOAD STRING:', new URLSearchParams(mainPayload).toString());



        console.log('[RECHARGE] ðŸ“ PAYLOAD LENGTH:', new URLSearchParams(mainPayload).toString().length);



        



        // Enviar payload debug completo



        try {



            chrome.runtime.sendMessage({



                type: 'DEBUG_PAYLOAD_RECHARGE',



                data: mainPayload  // JÃ¡ Ã© um objeto



            });



        } catch (e) {



            console.log('[RECHARGE] âš ï¸ NÃ£o conseguiu enviar payload debug:', e.message);



        }



        



        const mainResult = await sendRechargeViaMainWorld(mainPayload, token, key);







        let result = null;



        let ok = false;



        let statusCode = 0;







        if (mainResult && mainResult.ok) {



            result = mainResult.data;



            statusCode = mainResult.status || 0;



            ok = true;



        } else if (mainResult && !mainResult.ok) {



            console.warn('[RECHARGE] MAIN world falhou:', mainResult.error);



        }







        // Fallback: fetch direto (se MAIN falhar)



        if (!ok) {



            const response = await fetch('https://d1yoh197nyhh3m.bzcfgm.com/api/v1/user/recharge', {



                method: 'POST',



                headers: {



                    'Accept': 'application/json, text/plain, */*',



                    'Content-Type': 'application/x-www-form-urlencoded',



                    'token': token,



                    'key': key,



                    'x-ice-auto': '1'



                },



                body: formData.toString()



            });



            statusCode = response.status;



            result = await response.json();



            ok = response.ok;



        }







        console.log('[RECHARGE] Status:', statusCode);



        console.log('[RECHARGE] Resposta:', result);







        const isSuccess = ok && result && (result.status === 1 || result.status === 'success');







        if (isSuccess) {



            console.log('%c[RECHARGE] âœ… Recarga realizada com sucesso!', 



                      'color: #4CAF50; font-weight: bold; font-size: 16px;');



            if (!returnResultOnly) {



                await notifyBackend(requestId, 'success', result);



            }



            return { success: true, data: result };



        } else {



            console.error('[RECHARGE] âŒ Erro na recarga:', result);



            if (!returnResultOnly) {



                await notifyBackend(requestId, 'error', result);



            }



            return { success: false, error: result };



        }



        



    } catch (error) {



        console.error('[RECHARGE] âŒ ExceÃ§Ã£o ao processar recarga:', error);



        if (!returnResultOnly) {



            await notifyBackend(requestId, 'error', error.message);



        }



        return { success: false, error: error.message || String(error) };



    }



}







function sendRechargeViaMainWorld(data, token, key, url = 'https://d1yoh197nyhh3m.bzcfgm.com/api/v1/user/recharge', method = 'POST') {



    return new Promise((resolve) => {



        const mainRequestId = 'main_' + Date.now() + '_' + Math.random().toString(36).slice(2);







        function handler(event) {



            if (event.source !== window) return;



            const msg = event.data;



            if (!msg || msg.type !== 'ICE_RECHARGE_RESPONSE_MAIN') return;



            if (msg.requestId !== mainRequestId) return;







            window.removeEventListener('message', handler);



            resolve(msg);



        }







        window.addEventListener('message', handler);







        window.postMessage({



            type: 'ICE_RECHARGE_REQUEST_MAIN',



            requestId: mainRequestId,



            data,



            token,



            key,



            url,



            method



        }, '*');







        setTimeout(() => {



            window.removeEventListener('message', handler);



            resolve({ ok: false, error: 'MAIN world timeout' });



        }, 15000);



    });



}







function buildSortedQuery(params) {



    return Object.keys(params)



        .sort()



        .map(k => `${encodeURIComponent(k)}=${encodeURIComponent(params[k])}`)



        .join('&');



}







function buildSortedQueryRaw(params) {



    return Object.keys(params)



        .sort()



        .map(k => `${k}=${params[k]}`)



        .join('&');



}







function buildSignString(algo, params, bodyStr, signKey) {



    const bodyRaw = buildBodyRawFromString(bodyStr);



    const paramsWithKey = { ...params, sign_key: signKey };



    const orderedRaw = buildOrderedQuery(params, false);



    const orderedEnc = buildOrderedQuery(params, true);



    const orderedRawNoReturn = buildOrderedQuery(params, false, ['return_url']);



    const orderedEncNoReturn = buildOrderedQuery(params, true, ['return_url']);



    const orderedRawNoKey = buildOrderedQuery(params, false, ['key']);



    const orderedEncNoKey = buildOrderedQuery(params, true, ['key']);



    switch (algo) {



        case 'sorted_raw_signkey':



            return buildSortedQueryRaw(paramsWithKey);



        case 'sorted_enc_signkey':



            return buildSortedQuery(paramsWithKey);



        case 'sorted_raw_no_signkey':



            return buildSortedQueryRaw(params);



        case 'sorted_enc_no_signkey':



            return buildSortedQuery(params);



        case 'sorted_raw_concat':



            return `${buildSortedQueryRaw(params)}${signKey}`;



        case 'sorted_raw_concat_prefix':



            return `${signKey}${buildSortedQueryRaw(params)}`;



        case 'sorted_enc_concat':



            return `${buildSortedQuery(params)}${signKey}`;



        case 'sorted_enc_concat_prefix':



            return `${signKey}${buildSortedQuery(params)}`;



        case 'body_signkey_param':



            return `${bodyStr}&sign_key=${signKey}`;



        case 'body_signkey_param_enc':



            return `${bodyStr}&sign_key=${encodeURIComponent(signKey)}`;



        case 'body_raw_param':



            return `${bodyRaw}&sign_key=${signKey}`;



        case 'body_signkey_concat':



            return `${bodyStr}${signKey}`;



        case 'body_signkey_concat_enc':



            return `${bodyStr}${encodeURIComponent(signKey)}`;



        case 'body_enc':



            return bodyStr;



        case 'body_decoded':



            try {



                return decodeURIComponent(bodyStr.replace(/\+/g, '%20'));



            } catch (e) {



                return bodyStr;



            }



        case 'body_raw':



            return bodyRaw;



        case 'body_enc_concat':



            return `${bodyStr}${signKey}`;



        case 'body_enc_concat_prefix':



            return `${signKey}${bodyStr}`;



        case 'body_decoded_concat':



            try {



                return `${decodeURIComponent(bodyStr.replace(/\+/g, '%20'))}${signKey}`;



            } catch (e) {



                return `${bodyStr}${signKey}`;



            }



        case 'body_decoded_concat_prefix':



            try {



                return `${signKey}${decodeURIComponent(bodyStr.replace(/\+/g, '%20'))}`;



            } catch (e) {



                return `${signKey}${bodyStr}`;



            }



        case 'body_raw_concat':



            return `${bodyRaw}${signKey}`;



        case 'body_raw_concat_prefix':



            return `${signKey}${bodyRaw}`;



        case 'ordered_raw':



            return orderedRaw;



        case 'ordered_enc':



            return orderedEnc;



        case 'ordered_raw_signkey_param':



            return `${orderedRaw}&sign_key=${signKey}`;



        case 'ordered_enc_signkey_param':



            return `${orderedEnc}&sign_key=${encodeURIComponent(signKey)}`;



        case 'ordered_raw_concat':



            return `${orderedRaw}${signKey}`;



        case 'ordered_raw_concat_prefix':



            return `${signKey}${orderedRaw}`;



        case 'ordered_enc_concat':



            return `${orderedEnc}${signKey}`;



        case 'ordered_enc_concat_prefix':



            return `${signKey}${orderedEnc}`;



        case 'ordered_raw_no_return':



            return orderedRawNoReturn;



        case 'ordered_enc_no_return':



            return orderedEncNoReturn;



        case 'ordered_raw_no_return_signkey_param':



            return `${orderedRawNoReturn}&sign_key=${signKey}`;



        case 'ordered_enc_no_return_signkey_param':



            return `${orderedEncNoReturn}&sign_key=${encodeURIComponent(signKey)}`;



        case 'ordered_raw_no_key':



            return orderedRawNoKey;



        case 'ordered_enc_no_key':



            return orderedEncNoKey;



        default:



            return buildSortedQueryRaw(paramsWithKey);



    }



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







function getSecretValue(secretId, defaultSignKey, headerKey, paramKey, customValue) {



    switch (secretId) {



        case 'header_key':



            return headerKey || defaultSignKey;



        case 'param_key':



            return paramKey || defaultSignKey;



        case 'sign_key':



            return defaultSignKey;



        case 'custom':



            return customValue || defaultSignKey;



        case 'none':



            return '';



        default:



            return defaultSignKey;



    }



}







// Minimal MD5 implementation (ASCII input)



function md5(input) {



    try {



        // Prefer any existing library if present



        if (window.md5) return window.md5(input);



        if (window.CryptoJS && window.CryptoJS.MD5) {



            return window.CryptoJS.MD5(input).toString();



        }



    } catch (e) {



        // fallback below



    }







    function toUtf8(str) {



        return unescape(encodeURIComponent(str));



    }



    function rrot(x, n) {



        return (x << n) | (x >>> (32 - n));



    }



    function cmn(q, a, b, x, s, t) {



        return rrot((a + q + x + t) | 0, s) + b;



    }



    function ff(a, b, c, d, x, s, t) {



        return cmn((b & c) | (~b & d), a, b, x, s, t);



    }



    function gg(a, b, c, d, x, s, t) {



        return cmn((b & d) | (c & ~d), a, b, x, s, t);



    }



    function hh(a, b, c, d, x, s, t) {



        return cmn(b ^ c ^ d, a, b, x, s, t);



    }



    function ii(a, b, c, d, x, s, t) {



        return cmn(c ^ (b | ~d), a, b, x, s, t);



    }







    const data = toUtf8(input);



    const len = data.length;



    const words = [];



    for (let i = 0; i < len; i++) {



        words[i >> 2] |= data.charCodeAt(i) << ((i % 4) << 3);



    }



    words[len >> 2] |= 0x80 << ((len % 4) << 3);



    words[(((len + 8) >> 6) << 4) + 14] = len * 8;







    let a = 0x67452301;



    let b = 0xefcdab89;



    let c = 0x98badcfe;



    let d = 0x10325476;







    for (let i = 0; i < words.length; i += 16) {



        const oa = a;



        const ob = b;



        const oc = c;



        const od = d;







        a = ff(a, b, c, d, words[i + 0], 7, 0xd76aa478);



        d = ff(d, a, b, c, words[i + 1], 12, 0xe8c7b756);



        c = ff(c, d, a, b, words[i + 2], 17, 0x242070db);



        b = ff(b, c, d, a, words[i + 3], 22, 0xc1bdceee);



        a = ff(a, b, c, d, words[i + 4], 7, 0xf57c0faf);



        d = ff(d, a, b, c, words[i + 5], 12, 0x4787c62a);



        c = ff(c, d, a, b, words[i + 6], 17, 0xa8304613);



        b = ff(b, c, d, a, words[i + 7], 22, 0xfd469501);



        a = ff(a, b, c, d, words[i + 8], 7, 0x698098d8);



        d = ff(d, a, b, c, words[i + 9], 12, 0x8b44f7af);



        c = ff(c, d, a, b, words[i + 10], 17, 0xffff5bb1);



        b = ff(b, c, d, a, words[i + 11], 22, 0x895cd7be);



        a = ff(a, b, c, d, words[i + 12], 7, 0x6b901122);



        d = ff(d, a, b, c, words[i + 13], 12, 0xfd987193);



        c = ff(c, d, a, b, words[i + 14], 17, 0xa679438e);



        b = ff(b, c, d, a, words[i + 15], 22, 0x49b40821);







        a = gg(a, b, c, d, words[i + 1], 5, 0xf61e2562);



        d = gg(d, a, b, c, words[i + 6], 9, 0xc040b340);



        c = gg(c, d, a, b, words[i + 11], 14, 0x265e5a51);



        b = gg(b, c, d, a, words[i + 0], 20, 0xe9b6c7aa);



        a = gg(a, b, c, d, words[i + 5], 5, 0xd62f105d);



        d = gg(d, a, b, c, words[i + 10], 9, 0x02441453);



        c = gg(c, d, a, b, words[i + 15], 14, 0xd8a1e681);



        b = gg(b, c, d, a, words[i + 4], 20, 0xe7d3fbc8);



        a = gg(a, b, c, d, words[i + 9], 5, 0x21e1cde6);



        d = gg(d, a, b, c, words[i + 14], 9, 0xc33707d6);



        c = gg(c, d, a, b, words[i + 3], 14, 0xf4d50d87);



        b = gg(b, c, d, a, words[i + 8], 20, 0x455a14ed);



        a = gg(a, b, c, d, words[i + 13], 5, 0xa9e3e905);



        d = gg(d, a, b, c, words[i + 2], 9, 0xfcefa3f8);



        c = gg(c, d, a, b, words[i + 7], 14, 0x676f02d9);



        b = gg(b, c, d, a, words[i + 12], 20, 0x8d2a4c8a);







        a = hh(a, b, c, d, words[i + 5], 4, 0xfffa3942);



        d = hh(d, a, b, c, words[i + 8], 11, 0x8771f681);



        c = hh(c, d, a, b, words[i + 11], 16, 0x6d9d6122);



        b = hh(b, c, d, a, words[i + 14], 23, 0xfde5380c);



        a = hh(a, b, c, d, words[i + 1], 4, 0xa4beea44);



        d = hh(d, a, b, c, words[i + 4], 11, 0x4bdecfa9);



        c = hh(c, d, a, b, words[i + 7], 16, 0xf6bb4b60);



        b = hh(b, c, d, a, words[i + 10], 23, 0xbebfbc70);



        a = hh(a, b, c, d, words[i + 13], 4, 0x289b7ec6);



        d = hh(d, a, b, c, words[i + 0], 11, 0xeaa127fa);



        c = hh(c, d, a, b, words[i + 3], 16, 0xd4ef3085);



        b = hh(b, c, d, a, words[i + 6], 23, 0x04881d05);



        a = hh(a, b, c, d, words[i + 9], 4, 0xd9d4d039);



        d = hh(d, a, b, c, words[i + 12], 11, 0xe6db99e5);



        c = hh(c, d, a, b, words[i + 15], 16, 0x1fa27cf8);



        b = hh(b, c, d, a, words[i + 2], 23, 0xc4ac5665);







        a = ii(a, b, c, d, words[i + 0], 6, 0xf4292244);



        d = ii(d, a, b, c, words[i + 7], 10, 0x432aff97);



        c = ii(c, d, a, b, words[i + 14], 15, 0xab9423a7);



        b = ii(b, c, d, a, words[i + 5], 21, 0xfc93a039);



        a = ii(a, b, c, d, words[i + 12], 6, 0x655b59c3);



        d = ii(d, a, b, c, words[i + 3], 10, 0x8f0ccc92);



        c = ii(c, d, a, b, words[i + 10], 15, 0xffeff47d);



        b = ii(b, c, d, a, words[i + 1], 21, 0x85845dd1);



        a = ii(a, b, c, d, words[i + 8], 6, 0x6fa87e4f);



        d = ii(d, a, b, c, words[i + 15], 10, 0xfe2ce6e0);



        c = ii(c, d, a, b, words[i + 6], 15, 0xa3014314);



        b = ii(b, c, d, a, words[i + 13], 21, 0x4e0811a1);



        a = ii(a, b, c, d, words[i + 4], 6, 0xf7537e82);



        d = ii(d, a, b, c, words[i + 11], 10, 0xbd3af235);



        c = ii(c, d, a, b, words[i + 2], 15, 0x2ad7d2bb);



        b = ii(b, c, d, a, words[i + 9], 21, 0xeb86d391);







        a = (a + oa) | 0;



        b = (b + ob) | 0;



        c = (c + oc) | 0;



        d = (d + od) | 0;



    }







    function toHex(n) {



        const s = (n >>> 0).toString(16);



        return '00000000'.substring(s.length) + s;



    }







    return toHex(a) + toHex(b) + toHex(c) + toHex(d);



}







async function notifyBackend(requestId, status, data) {



    try {



        await fetch('http://127.0.0.1:8788/api/recharge_result', {



            method: 'POST',



            headers: {



                'Content-Type': 'application/json'



            },



            body: JSON.stringify({



                request_id: requestId,



                status: status,



                data: data



            })



        });



        



        console.log('[RECHARGE] Backend notificado:', status);



    } catch (error) {



        console.error('[RECHARGE] Erro ao notificar backend:', error);



    }



}







// ========== LISTENER PARA MENSAGENS ==========



chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {



    if (message.type === 'GENERATE_PIX_AUTO') {



        (async () => {



            try {



                const amountCentavos = Number(message.amount || 0);



                if (!amountCentavos || amountCentavos <= 0) {



                    sendResponse({ success: false, error: 'Valor invÃ¡lido' });



                    return;



                }







                const uid = localStorage.getItem('icecassino_uid');



                const key = localStorage.getItem('icecassino_key');



                if (!uid || !key) {



                    sendResponse({ success: false, error: 'Credenciais nÃ£o encontradas no Ice Cassino' });



                    return;



                }







                const amountReais = amountCentavos / 100;



                const requestId = `wa_${Date.now()}_${Math.random().toString(36).slice(2)}`;







                const result = await processRecharge(uid, key, amountReais, requestId, true);



                if (!result || !result.success) {



                    sendResponse({ success: false, error: result && result.error ? result.error : 'Falha na recarga' });



                    return;



                }







                const data = result.data || {};



                const pixCode = data?.data?.QRcode || data?.data?.qrCode || data?.QRcode || data?.qrCode || null;







                sendResponse({



                    success: true,



                    pixCode: pixCode,



                    qrCode: pixCode,



                    raw: data



                });



            } catch (e) {



                sendResponse({ success: false, error: e?.message || String(e) });



            }



        })();







        return true;



    }







    if (message.type === 'CHECK_STORAGE') {



        console.log('[RECHARGE] ðŸ” SolicitaÃ§Ã£o de verificaÃ§Ã£o de storage recebida');



        



        chrome.storage.local.get(['icecassino_token', 'icecassino_token_source', 'icecassino_token_time'], (result) => {



            console.log('[RECHARGE] ðŸ“Š Storage atual:', result);



            



            sendResponse({



                token: result.icecassino_token || null,



                source: result.icecassino_token_source || null,



                time: result.icecassino_token_time || null



            });



        });



        



        return true; // Manter o canal de mensagem aberto para resposta assÃ­ncrona



    }



});







// Iniciar monitoramento quando a pÃ¡gina carregar



if (document.readyState === 'loading') {



    document.addEventListener('DOMContentLoaded', startRechargeMonitoring);



} else {



    startRechargeMonitoring();



}







console.log('[RECHARGE] âœ… Sistema de recarga ativo!');










