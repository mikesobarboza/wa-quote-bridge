// ============================================
// 🎯 ICE CASINO - CAPTURA DE DADOS PARA API
// ============================================

// ========== FUNÇÕES DE DEBUG GLOBAIS ==========
// Definidas ANTES da IIFE para garantir disponibilidade imediata

function safeChromeStorageSet(data, callback) {
    try {
        if (!chrome || !chrome.storage || !chrome.storage.local || !chrome.runtime || !chrome.runtime.id) {
            console.warn('[ICE] ⚠️ chrome.storage indisponível (contexto inválido)');
            return;
        }
        chrome.storage.local.set(data, () => {
            if (chrome.runtime.lastError) {
                console.warn('[ICE] ⚠️ Erro chrome.storage.local.set:', chrome.runtime.lastError);
            }
            if (typeof callback === 'function') {
                callback();
            }
        });
    } catch (e) {
        console.warn('[ICE] ⚠️ Erro ao acessar chrome.storage.local.set:', e);
    }
}

window.forceSaveTokenToStorage = function() {
    const token = localStorage.getItem('icecassino_token');
    if (!token) {
        console.error('❌ Nenhum token em localStorage!');
        console.log('💡 Faça uma recarga manual primeiro para capturar um token');
        return;
    }
    
    console.log('%c[DEBUG] 💾 FORÇANDO SALVAMENTO DO TOKEN', 'color: #FF9800; font-weight: bold; font-size: 14px;');
    console.log('[DEBUG] Token:', token.substring(0, 20) + '...');
    console.log('[DEBUG] Salvando em localStorage...');
    localStorage.setItem('icecassino_token', token);
    
    // Salvar em chrome.storage.local também
    console.log('[DEBUG] Salvando em chrome.storage.local...');
    safeChromeStorageSet({
        icecassino_token: token,
        icecassino_token_source: 'manual_force',
        icecassino_token_time: Date.now()
    }, () => {
        console.log('%c[DEBUG] ✅ Token salvo com sucesso em AMBOS os storages!', 'color: #4CAF50; font-weight: bold;');
        if (chrome && chrome.storage && chrome.storage.local) {
            chrome.storage.local.get(['icecassino_token'], (result) => {
                console.log('[DEBUG] 🔍 Verificação:', result);
            });
        }
    });
};

window.checkStorageStatus = function() {
    console.log('%c[DEBUG] 📊 STATUS DO STORAGE', 'color: #9C27B0; font-weight: bold; font-size: 14px;');
    console.log('═'.repeat(80));
    
    // localStorage
    const localToken = localStorage.getItem('icecassino_token');
    console.log('1️⃣ localStorage:');
    console.log('   icecassino_token:', localToken ? localToken.substring(0, 20) + '...' : '❌ VAZIO');
    console.log('   icecassino_token_source:', localStorage.getItem('icecassino_token_source') || 'N/A');
    console.log('   icecassino_token_time:', localStorage.getItem('icecassino_token_time') || 'N/A');
    
    // chrome.storage.local
    console.log('\n2️⃣ chrome.storage.local:');
    console.log('   ⏳ Aguardando resposta...');
    
    chrome.storage.local.get(['icecassino_token', 'icecassino_token_source', 'icecassino_token_time'], (result) => {
        if (result.icecassino_token) {
            console.log('   ✅ icecassino_token:', result.icecassino_token.substring(0, 20) + '...');
            console.log('   ✅ icecassino_token_source:', result.icecassino_token_source || 'N/A');
            console.log('   ✅ icecassino_token_time:', result.icecassino_token_time || 'N/A');
            
            // Comparar
            console.log('\n3️⃣ Comparação:');
            if (localToken === result.icecassino_token) {
                console.log('   ✅ SINCRONIZADOS - Tokens são iguais!');
            } else {
                console.log('   ⚠️ DESSINCRONIZADOS - Tokens diferentes!');
                console.log('   localStorage:', localToken ? localToken.substring(0, 20) : 'VAZIO');
                console.log('   chrome.storage:', result.icecassino_token ? result.icecassino_token.substring(0, 20) : 'VAZIO');
                console.log('   💡 Execute: window.forceSaveTokenToStorage()');
            }
        } else {
            console.log('   ❌ VAZIO - Nenhum token em chrome.storage.local');
            console.log('   💡 Execute: window.forceSaveTokenToStorage()');
        }
        console.log('═'.repeat(80));
    });
};

console.log('%c[ICE] 🔧 Funções de debug disponíveis:', 'color: #2196F3; font-weight: bold;');
console.log('  → window.forceSaveTokenToStorage()');
console.log('  → window.checkStorageStatus()');

(function() {
    'use strict';
    
    // NÃO limpar console - prejudica debug do injector
    // console.clear();
    console.log('%c🎯 ICE CASINO DATA CAPTURE', 'color: #4CAF50; font-size: 16px; font-weight: bold;');
    
    // Configurações
    const CONFIG = {
        backendUrl: 'http://127.0.0.1:8788/api/icecassino_token',
        // Baseado na análise da requisição real:
        targetUrl: '/api/v1/user/recharge',
        tokenHeaderName: 'token',  // minúsculo, conforme especificação
        tokenFormat: 'hex32',      // hexadecimal de 32 caracteres
        contentType: 'application/x-www-form-urlencoded'
    };
    
    // Estado
    let loginCaptured = false;
    let tokenCaptured = false;
    let lastTokenUrl = '';

    function requestCredentialsFromBackground(url) {
        return new Promise((resolve) => {
            try {
                // Enviar requisição (não espera resposta de forma síncrona)
                chrome.runtime.sendMessage({ type: 'FETCH_CREDENTIALS', url }, (response) => {
                    // Ignorar resposta pois é processada de forma assíncrona
                });
                
                // Esperar um pouco e depois tentar recuperar do storage
                setTimeout(() => {
                    chrome.storage.local.get('last_credentials', (result) => {
                        if (result.last_credentials) {
                            console.log('[ICE] ✅ Credenciais recuperadas do storage');
                            resolve(result.last_credentials);
                        } else {
                            resolve(null);
                        }
                    });
                }, 100);
            } catch (e) {
                console.warn('[ICE] ⚠️ Exceção ao solicitar credenciais:', e);
                resolve(null);
            }
        });
    }
    
    // ========== FUNÇÃO DE ENVIO PARA API (TOKEN ONLY) ==========
    // IMPORTANTE: Este endpoint (/api/icecassino_token) é APENAS para armazenar tokens
    // NÃO enviar dados de login aqui - o backend rejeita com "Token vazio"
    function sendTokenToAPI(token, action = '', credentials = null) {
        if (!token || !isValidToken(token)) {
            console.warn('[ICE] ❌ Token inválido para envio à API:', token);
            return;
        }
        
        console.log('[ICE] 📤 Enviando token para API:', token.substring(0, 10) + '...');
        const payload = {
            token: token,
            action: action || 'store',
            timestamp: new Date().toISOString()
        };
        if (credentials) {
            payload.credentials = credentials;
        }

        fetch(CONFIG.backendUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        })
        .then(response => response.json())
        .then(result => {
            console.log('[ICE] ✅ Token armazenado com sucesso:', result);
        })
        .catch(error => {
            console.warn('[ICE] ❌ Erro ao enviar token:', error);
        });
    }
    
    // ========== CAPTURA DE LOGIN (UID E KEY) ==========
    // Apenas salva localmente, NÃO envia para API
    function captureLoginData() {
        console.log('[ICE] 🔍 Buscando dados de login...');
        
        // Método 1: Observar requisições de rede
        const observer = new PerformanceObserver((list) => {
            list.getEntries().forEach(entry => {
                try {
                    const entryName = typeof entry.name === 'string'
                        ? entry.name
                        : (entry.name && entry.name.toString ? entry.name.toString() : '');

                    if (entryName && entryName.includes('uid=') && entryName.includes('key=')) {
                        const uidMatch = entryName.match(/uid=(\d+)/);
                        const keyMatch = entryName.match(/key=([^&]+)/);
                    
                        if (uidMatch && keyMatch) {
                            const uid = uidMatch[1];
                            const key = keyMatch[1];
                        
                            if (uid && uid.length > 5 && uid.length < 20 && key && key.length > 10 && key.length < 50) {
                                console.log('%c[ICE] ✅ LOGIN ENCONTRADO!', 
                                          'color: #4CAF50; font-weight: bold;', 
                                          { uid, key: key.substring(0, 10) + '...' });
                            
                                // APENAS salvar localmente - NÃO enviar para API
                                localStorage.setItem('icecassino_uid', uid);
                                localStorage.setItem('icecassino_key', key);
                                
                                // Também salvar em chrome.storage para acesso do content.js
                                safeChromeStorageSet({
                                    casino_uid: uid,
                                    casino_key: key,
                                    casino_key_updated: Date.now()
                                });
                                
                                loginCaptured = true;
                                
                                // Atualizar UI
                                updateUI('login_captured');
                            }
                        }
                    }
                } catch (e) {
                    console.warn('[ICE] ⚠️ Falha ao processar PerformanceObserver entry:', e);
                }
            });
        });
        
        try {
            observer.observe({ entryTypes: ['resource'] });
        } catch (e) {
            console.warn('[ICE] PerformanceObserver não suportado:', e);
        }
        
        // Método 2: Verificar localStorage existente
        const savedUid = localStorage.getItem('icecassino_uid');
        const savedKey = localStorage.getItem('icecassino_key');
        
        if (savedUid && savedKey && !loginCaptured) {
            console.log('[ICE] 🔄 Dados de login recuperados do cache');
            loginCaptured = true;
            updateUI('login_captured');
        }
    }
    
    // ========== CAPTURA DE TOKEN DAS RECARGAS ==========
    function captureTokenFromRecharge() {
        console.log('[ICE] 🔧 Configurando captura de token...');
        
        // 1. Interceptar XMLHttpRequest
        const OriginalXHR = window.XMLHttpRequest;
        const originalOpen = OriginalXHR.prototype.open;
        const originalSend = OriginalXHR.prototype.send;
        const originalSetRequestHeader = OriginalXHR.prototype.setRequestHeader;
        
        const xhrHeaders = new WeakMap();
        
        // Armazenar headers e verificar token
        OriginalXHR.prototype.setRequestHeader = function(header, value) {
            let headers = xhrHeaders.get(this);
            if (!headers) {
                headers = {};
                xhrHeaders.set(this, headers);
            }
            headers[header] = value;
            
            // Verificar se é o header 'token' (exatamente como especificado: minúsculo)
            if (header === CONFIG.tokenHeaderName && value) {
                lastTokenUrl = this._iceUrl || lastTokenUrl;
                console.log('%c[ICE] 🎯 HEADER "token" DETECTADO!', 
                          'color: #FF9800; font-weight: bold;', 
                          { 
                              value: value.substring(0, 10) + '...' + value.substring(value.length - 10),
                              length: value.length,
                              url: this._iceUrl || 'URL ainda não definida'
                          });
                
                // Validar formato: hexadecimal de 32 caracteres
                if (isValidToken(value)) {
                    console.log('%c[ICE] ✅✅✅ TOKEN CAPTURADO COM SUCESSO!', 
                              'color: #4CAF50; font-weight: bold; font-size: 14px;');
                    console.log('[ICE] Token completo:', value);
                    processCapturedToken(value, 'xhr_header_token');
                }
            }
            
            return originalSetRequestHeader.call(this, header, value);
        };
        
        // Marcar requisições de recarga
        OriginalXHR.prototype.open = function(method, url) {
            this._iceUrl = url;
            this._iceMethod = method;
            const urlStr = url.toString();
            
            // Verificar especificamente o endpoint /api/v1/user/recharge
            if (method === 'POST' && urlStr.includes(CONFIG.targetUrl)) {
                console.log('%c[ICE] 🎯 REQUISIÇÃO DE RECARGA DETECTADA!', 
                          'color: #2196F3; font-weight: bold;');
                console.log('[ICE] Método:', method);
                console.log('[ICE] URL:', urlStr);
                this._iceIsRecharge = true;
            }
            return originalOpen.apply(this, arguments);
        };
        
        // Capturar token no envio
        OriginalXHR.prototype.send = function(body) {
            const url = this._iceUrl;
            const method = this._iceMethod;
            const isRecharge = this._iceIsRecharge;
            const headers = xhrHeaders.get(this) || {};
            
            if (isRecharge) {
                console.log('%c[ICE] 📤 ENVIANDO REQUISIÇÃO DE RECARGA', 'color: #2196F3; font-weight: bold;');
                console.log('[ICE] URL:', url);
                console.log('[ICE] Método:', method);
                console.log('[ICE] Content-Type:', headers['content-type'] || headers['Content-Type']);
                console.log('[ICE] Headers completos:', headers);
                
                // Verificar se o header 'token' foi definido
                const token = headers[CONFIG.tokenHeaderName];
                if (token) {
                    console.log('[ICE] ✅ Header "token" confirmado no send');
                    console.log('[ICE] Token:', token);
                    
                    if (!isValidToken(token)) {
                        console.warn('[ICE] ⚠️ ATENÇÃO: Token presente mas formato inválido!');
                    }
                } else {
                    console.warn('[ICE] ⚠️ Header "token" NÃO encontrado nos headers!');
                }
                
                // Logar body (token está no header, não no body conforme especificação)
                if (body && typeof body === 'string') {
                    console.log('[ICE] 📝 Body da requisição (form-urlencoded):', body.substring(0, 300));
                    
                    // Verificar se contém uid, amount, gameid, type conforme especificação
                    const params = new URLSearchParams(body);
                    console.log('[ICE] Parâmetros:', {
                        uid: params.get('uid'),
                        amount: params.get('amount'),
                        gameid: params.get('gameid'),
                        type: params.get('type')
                    });
                }
            }
            
            // Observar resposta (conforme especificação: não retorna novo token)
            this.addEventListener('load', function() {
                if (isRecharge) {
                    console.log('[ICE] 📦 Resposta de recarga recebida');
                    console.log('[ICE] Status:', this.status);
                    
                    if (this.status === 200) {
                        try {
                            const responseData = JSON.parse(this.responseText);
                            console.log('[ICE] ✅ Recarga bem-sucedida!');
                            console.log('[ICE] Dados da resposta:', responseData);
                        } catch (e) {
                            console.log('[ICE] Resposta (não-JSON):', this.responseText.substring(0, 200));
                        }
                    } else {
                        console.warn('[ICE] ⚠️ Recarga falhou com status:', this.status);
                    }
                }
            });
            
            return originalSend.call(this, body);
        };
        
        // 2. Interceptar Fetch
        const originalFetch = window.fetch;
        window.fetch = async function(...args) {
            const url = args[0]?.url || args[0] || '';
            const requestUrl = url.toString();
            
            // Verificar endpoints de pagamento
            if (requestUrl && (
                requestUrl.includes('/recharge') || 
                requestUrl.includes('/deposit') ||
                requestUrl.includes('/payment') ||
                requestUrl.includes('/pay')
            )) {
                console.log('[ICE] 🔄 Processando pagamento via Fetch:', requestUrl);
                
                const options = args[1] || {};
                const headers = options.headers || {};
                
                // Procurar token nos headers
                let foundToken = null;
                let foundIn = '';
                
                if (headers instanceof Headers) {
                    const token = headers.get('token') || headers.get('Token') || headers.get('TOKEN');
                    if (token && isValidToken(token)) {
                        foundToken = token;
                        foundIn = 'fetch_headers_instance';
                    }
                } else {
                    for (const key in headers) {
                        if (key.toLowerCase() === 'token' && headers[key] && isValidToken(headers[key])) {
                            foundToken = headers[key];
                            foundIn = 'fetch_headers_object';
                            break;
                        }
                    }
                }
                
                if (foundToken) {
                    console.log('%c[ICE] ✅ TOKEN CAPTURADO DO FETCH!', 
                              'color: #2196F3; font-weight: bold;', 
                              foundToken.substring(0, 15) + '...');
                    processCapturedToken(foundToken, foundIn);
                }
                
                // Verificar body
                if (options.body) {
                    try {
                        if (typeof options.body === 'string') {
                            console.log('[ICE] 📝 Fetch body:', options.body.substring(0, 200) + '...');
                            
                            // Formato form-urlencoded
                            const tokenMatch = options.body.match(/token=([^&]+)/i);
                            if (tokenMatch && tokenMatch[1]) {
                                const token = decodeURIComponent(tokenMatch[1]);
                                if (isValidToken(token)) {
                                    console.log('%c[ICE] ✅ TOKEN CAPTURADO DO FETCH BODY (form)!', 
                                              'color: #2196F3; font-weight: bold;', 
                                              token.substring(0, 15) + '...');
                                    processCapturedToken(token, 'fetch_body_form');
                                }
                            }
                            
                            // Tentar JSON
                            try {
                                const bodyData = JSON.parse(options.body);
                                if (bodyData.token && isValidToken(bodyData.token)) {
                                    console.log('%c[ICE] ✅ TOKEN CAPTURADO DO FETCH BODY (JSON)!', 
                                              'color: #2196F3; font-weight: bold;', 
                                              bodyData.token.substring(0, 15) + '...');
                                    processCapturedToken(bodyData.token, 'fetch_body_json');
                                }
                            } catch (e) {
                                // Não é JSON
                            }
                        }
                    } catch (e) {
                        console.log('[ICE] ❌ Erro ao processar fetch body:', e);
                    }
                }
                
                // Fazer a requisição original e observar a resposta
                return originalFetch.apply(this, args).then(async response => {
                    if (response.ok) {
                        try {
                            const responseData = await response.clone().json();
                            console.log('[ICE] 📊 Fetch response data:', responseData);
                            
                            // Verificar vários locais onde o token pode estar
                            const possibleTokenPaths = [
                                'token',
                                'data.token',
                                'result.token',
                                'response.token',
                                'auth_token',
                                'access_token'
                            ];
                            
                            for (const path of possibleTokenPaths) {
                                const value = getValueByPath(responseData, path);
                                if (value && isValidToken(value)) {
                                    console.log('%c[ICE] ✅ TOKEN CAPTURADO DA FETCH RESPONSE!', 
                                              'color: #4CAF50; font-weight: bold;', 
                                              { path, token: value.substring(0, 15) + '...' });
                                    processCapturedToken(value, 'fetch_response_' + path.replace('.', '_'));
                                }
                            }
                        } catch (e) {
                            // Não é JSON ou erro
                        }
                    }
                    return response;
                });
            }
            
            return originalFetch.apply(this, args);
        };
        
        console.log('[ICE] ✅ Captura de token configurada');
    }
    
    // ========== FUNÇÕES AUXILIARES ==========
    
    // Verificar se é um token válido (hexadecimal de 32 caracteres)
    function isValidToken(token) {
        if (!token || typeof token !== 'string') return false;
        
        const cleanToken = token.trim();
        
        // Formato específico: hexadecimal de 32 caracteres (ex: ec0bb3b4fc35acef44297d6db9dec661)
        if (/^[0-9a-f]{32}$/i.test(cleanToken)) {
            console.log('[ICE] ✅ Token válido detectado (hex 32 chars):', cleanToken);
            return true;
        }
        
        console.log('[ICE] ⚠️ Token não corresponde ao formato esperado:', {
            token: cleanToken.substring(0, 20) + '...',
            length: cleanToken.length,
            expected: '32 caracteres hexadecimais'
        });
        
        return false;
    }
    
    // Obter valor por caminho (ex: 'data.token')
    function getValueByPath(obj, path) {
        return path.split('.').reduce((o, p) => o && o[p], obj);
    }
    
    // ========== PROCESSAR TOKEN CAPTURADO ==========
    window.processCapturedToken = function(token, source) {
        if (!token) return;
        
        // Limpar token
        token = token.toString().trim();
        
        // Remover "Bearer " se presente
        if (token.startsWith('Bearer ')) {
            token = token.substring(7);
        }
        
        // Verificar se é válido
        if (!isValidToken(token)) {
            console.log('[ICE] ⚠️ Token não parece válido:', {
                token: token.substring(0, 20) + '...',
                length: token.length,
                source: source
            });
            return;
        }
        
        // Verificar duplicado antes de sobrescrever
        const existingToken = localStorage.getItem('icecassino_token');

        // Salvar localmente SEMPRE (atualizar timestamp mesmo se for o mesmo token)
        localStorage.setItem('icecassino_token', token);
        localStorage.setItem('icecassino_token_source', source);
        localStorage.setItem('icecassino_token_time', Date.now());

        // Salvar no storage da extensão (para o recharge_handler) - SEMPRE
        safeChromeStorageSet({
            icecassino_token: token,
            icecassino_token_source: source,
            icecassino_token_time: Date.now()
        }, () => {
            console.log('[ICE] ✅ Token salvo em chrome.storage.local com sucesso!');
            console.log('[ICE] 🔍 Verificando salvamento...');
            if (chrome && chrome.storage && chrome.storage.local) {
                chrome.storage.local.get(['icecassino_token'], (result) => {
                    console.log('[ICE] 🔍 Token em storage após salvar:', result);
                });
            }
        });
        
        // Evitar duplicados (apenas log, não retornar)
        if (existingToken === token) {
            console.log('[ICE] 🔄 Token já existe, mas foi re-salvo em ambos os storages');
        }
        
        console.log('%c[ICE] 💾 Token salvo com sucesso!', 'color: #4CAF50; font-weight: bold;', {
            tokenPreview: token.substring(0, 20) + '...',
            source: source,
            length: token.length,
            format: 'hex' + (/^[0-9a-f]{32}$/i.test(token) ? ' (32 chars)' : '')
        });
        
        // Enviar token para API (com credenciais quando possível)
        const credsUrl = lastTokenUrl || window.location.href;
        requestCredentialsFromBackground(credsUrl).then((credentials) => {
            sendTokenToAPI(token, 'captured_' + source, credentials);
        });
        
        tokenCaptured = true;
        updateUI('token_captured');
        
        // Mostrar notificação
        showNotification(`✅ Token capturado! (${token.length} chars)`);
    }
    
    // ========== INTERFACE SIMPLES ==========
    function createSimpleUI() {
        // Remover UI antiga
        const oldUI = document.getElementById('ice-data-capture-ui');
        if (oldUI) oldUI.remove();
        
        const container = document.createElement('div');
        container.id = 'ice-data-capture-ui';
        container.style.cssText = `
            position: fixed;
            top: 10px;
            right: 10px;
            z-index: 999999;
            background: #1a1a1a;
            color: white;
            padding: 12px;
            border-radius: 8px;
            font-family: Arial, sans-serif;
            font-size: 12px;
            box-shadow: 0 3px 15px rgba(0,0,0,0.5);
            border-left: 4px solid #2196F3;
            min-width: 250px;
        `;
        
        container.innerHTML = `
            <div style="margin-bottom: 10px;">
                <strong style="color: #2196F3;">🎯 ICE CASINO DATA CAPTURE</strong>
                <div style="font-size: 10px; color: #888; margin-top: 2px;">v2.0 - Token Hunter</div>
            </div>
            <div style="line-height: 1.5; margin-bottom: 10px;">
                <div>Login: <span id="ice-login-status" style="color: #FF9800;">❌</span></div>
                <div>Token: <span id="ice-token-status" style="color: #FF9800;">❌</span></div>
                <div style="font-size: 10px; margin-top: 5px;" id="ice-token-info"></div>
            </div>
            <div style="display: flex; gap: 8px; margin-bottom: 8px;">
                <button id="ice-btn-refresh" style="flex: 1; padding: 6px; background: #2196F3; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 11px;">
                    🔄 ATUALIZAR
                </button>
                <button id="ice-btn-check" style="flex: 1; padding: 6px; background: #4CAF50; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 11px;">
                    📊 STATUS
                </button>
            </div>
            <div style="display: flex; gap: 8px;">
                <button id="ice-btn-test" style="flex: 1; padding: 6px; background: #FF9800; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 11px;">
                    🧪 TESTAR
                </button>
                <button id="ice-btn-clear" style="flex: 1; padding: 6px; background: #f44336; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 11px;">
                    🗑️ LIMPAR
                </button>
            </div>
            <div style="margin-top: 10px; font-size: 10px; color: #888;">
                <div>💡 Faça uma recarga manual para capturar</div>
                <div>📁 Token salvo localmente</div>
            </div>
        `;
        
        document.body.appendChild(container);
        
        // Botão de atualizar
        document.getElementById('ice-btn-refresh').onclick = function() {
            console.log('[ICE] 🔄 Atualizando dados...');
            checkAndUpdateStatus();
            showNotification('🔄 Atualizando...');
        };
        
        // Botão de status
        document.getElementById('ice-btn-check').onclick = function() {
            const uid = localStorage.getItem('icecassino_uid');
            const key = localStorage.getItem('icecassino_key');
            const token = localStorage.getItem('icecassino_token');
            const tokenSource = localStorage.getItem('icecassino_token_source');
            const tokenTime = localStorage.getItem('icecassino_token_time');
            
            let message = '';
            
            if (uid && key) {
                message += `✅ LOGIN:\nUID: ${uid}\nKEY: ${key.substring(0, 10)}...\n\n`;
            } else {
                message += '❌ LOGIN não capturado\n\n';
            }
            
            if (token) {
                const timeAgo = tokenTime ? Math.round((Date.now() - parseInt(tokenTime)) / 1000) + 's atrás' : 'desconhecido';
                message += `✅ TOKEN (${tokenSource || 'desconhecido'}):\n${token}\n`;
                message += `\n📏 Tamanho: ${token.length} caracteres`;
                message += `\n⏰ Capturado: ${timeAgo}`;
                
                // Verificar formato
                if (/^[0-9a-f]{32}$/i.test(token)) {
                    message += '\n📋 Formato: Hexadecimal (32 chars)';
                } else if (token.includes('.')) {
                    message += '\n📋 Formato: JWT-like';
                } else {
                    message += '\n📋 Formato: Outro';
                }
            } else {
                message += '❌ TOKEN não capturado\n\n';
                message += '💡 Dicas:\n';
                message += '1. Faça uma recarga manual\n';
                message += '2. Verifique o console (F12)\n';
                message += '3. Token deve aparecer no header';
            }
            
            alert(message);
        };
        
        // Botão de teste
        document.getElementById('ice-btn-test').onclick = function() {
            console.log('[ICE] 🧪 Testando captura...');
            
            // Testar com token conhecido
            const testToken = '48acdbd6b72d6a1cebf08d82d955eff9';
            console.log('[ICE] 🧪 Token de teste:', testToken);
            console.log('[ICE] 🧪 É válido?', isValidToken(testToken));
            
            // Simular captura
            processCapturedToken(testToken, 'teste_manual');
            
            showNotification('🧪 Teste realizado!');
        };
        
        // Botão de limpar
        document.getElementById('ice-btn-clear').onclick = function() {
            if (confirm('Tem certeza que deseja limpar todos os dados?')) {
                localStorage.removeItem('icecassino_token');
                localStorage.removeItem('icecassino_token_source');
                localStorage.removeItem('icecassino_token_time');
                console.log('[ICE] 🗑️ Dados limpos');
                showNotification('🗑️ Dados limpos!');
                checkAndUpdateStatus();
            }
        };
    }
    
    function updateUI(status) {
        const loginStatus = document.getElementById('ice-login-status');
        const tokenStatus = document.getElementById('ice-token-status');
        const tokenInfo = document.getElementById('ice-token-info');
        
        if (!loginStatus || !tokenStatus) return;
        
        switch(status) {
            case 'login_captured':
                loginStatus.innerHTML = '✅';
                loginStatus.style.color = '#4CAF50';
                break;
                
            case 'token_captured':
                tokenStatus.innerHTML = '✅';
                tokenStatus.style.color = '#4CAF50';
                
                // Atualizar informações do token
                const token = localStorage.getItem('icecassino_token');
                const source = localStorage.getItem('icecassino_token_source');
                if (token && tokenInfo) {
                    tokenInfo.innerHTML = `${token.length} chars (${source || 'capturado'})`;
                    tokenInfo.style.color = '#4CAF50';
                }
                break;
        }
    }
    
    function checkAndUpdateStatus() {
        const uid = localStorage.getItem('icecassino_uid');
        const token = localStorage.getItem('icecassino_token');
        const tokenSource = localStorage.getItem('icecassino_token_source');
        
        const loginStatus = document.getElementById('ice-login-status');
        const tokenStatus = document.getElementById('ice-token-status');
        const tokenInfo = document.getElementById('ice-token-info');
        
        if (loginStatus) {
            if (uid) {
                loginStatus.innerHTML = '✅';
                loginStatus.style.color = '#4CAF50';
            } else {
                loginStatus.innerHTML = '❌';
                loginStatus.style.color = '#FF9800';
            }
        }
        
        if (tokenStatus) {
            if (token) {
                tokenStatus.innerHTML = '✅';
                tokenStatus.style.color = '#4CAF50';
                
                if (tokenInfo) {
                    tokenInfo.innerHTML = `${token.length} chars (${tokenSource || 'capturado'})`;
                    tokenInfo.style.color = '#4CAF50';
                }
            } else {
                tokenStatus.innerHTML = '❌';
                tokenStatus.style.color = '#FF9800';
                
                if (tokenInfo) {
                    tokenInfo.innerHTML = 'Aguardando captura...';
                    tokenInfo.style.color = '#FF9800';
                }
            }
        }
    }
    
    function showNotification(message) {
        // Remover notificação anterior
        const oldNotif = document.getElementById('ice-notification');
        if (oldNotif) oldNotif.remove();
        
        const notif = document.createElement('div');
        notif.id = 'ice-notification';
        notif.textContent = message;
        notif.style.cssText = `
            position: fixed;
            top: 20px;
            left: 50%;
            transform: translateX(-50%);
            z-index: 1000000;
            background: #4CAF50;
            color: white;
            padding: 12px 20px;
            border-radius: 6px;
            font-weight: bold;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            animation: slideDown 0.3s ease;
        `;
        
        // Adicionar animação
        const style = document.createElement('style');
        style.textContent = `
            @keyframes slideDown {
                from { transform: translate(-50%, -100%); opacity: 0; }
                to { transform: translate(-50%, 0); opacity: 1; }
            }
        `;
        document.head.appendChild(style);
        
        document.body.appendChild(notif);
        
        // Remover após 3 segundos
        setTimeout(() => {
            if (notif.parentNode) {
                notif.style.opacity = '0';
                notif.style.transition = 'opacity 0.5s';
                setTimeout(() => {
                    if (notif.parentNode) notif.remove();
                }, 500);
            }
        }, 3000);
    }
    
    // ========== LISTENER PARA MENSAGENS DO MAIN WORLD ==========
    window.addEventListener('message', function(event) {
        // Verificar origem
        if (event.source !== window) return;
        
        if (event.data.type === 'ICE_TOKEN_CAPTURED_MAIN') {
            console.log('%c[ICE] 🎉🎉🎉 TOKEN RECEBIDO DO MAIN WORLD!', 
                      'color: #4CAF50; font-weight: bold; font-size: 18px;');
            console.log('[ICE] Token:', event.data.token);
            console.log('[ICE] URL:', event.data.url);
            console.log('[ICE] Source:', event.data.source);
            if (event.data.url) {
                lastTokenUrl = event.data.url;
            }
            
            // Processar o token usando a função existente
            processCapturedToken(event.data.token, event.data.source);
        }

        if (event.data.type === 'ICE_RECHARGE_TOKEN_ACTUAL') {
            // Token sendo realmente enviado na requisição de recarga
            if (event.data.token) {
                console.log('[ICE] 📤 Token real de recarga capturado:', event.data.token);
                if (event.data.url) {
                    lastTokenUrl = event.data.url;
                }
                processCapturedToken(event.data.token, 'recharge_actual_' + (event.data.method || 'POST'));
            }
        }

        if (event.data.type === 'ICE_RECHARGE_TEMPLATE') {
            try {
                const template = {
                    params: event.data.params || {},
                    headers: event.data.headers || {},
                    captured_at: Date.now()
                };

                // Extract uid and key from params
                const params = event.data.params || {};
                const uid = params.uid || localStorage.getItem('icecassino_uid') || '';
                const key = params.key || localStorage.getItem('icecassino_key') || '';

                localStorage.setItem('icecassino_recharge_template', JSON.stringify(template));
                safeChromeStorageSet({ 
                    icecassino_recharge_template: template,
                    icecassino_uid: uid,
                    icecassino_key: key
                });
                console.log('[ICE] ✅ Template de recarga salvo (uid:', uid ? uid.substring(0, 5) + '...' : 'VAZIO', ')');
            } catch (e) {
                console.warn('[ICE] ⚠️ Falha ao salvar template de recarga:', e);
            }
        }

        if (event.data.type === 'ICE_MD5_INPUT') {
            try {
                const input = event.data.input || '';
                const output = event.data.output || '';
                if (input) {
                    localStorage.setItem('icecassino_last_md5_input', input);
                    localStorage.setItem('icecassino_last_md5_output', output);
                    safeChromeStorageSet({
                        icecassino_last_md5_input: input,
                        icecassino_last_md5_output: output
                    });
                    console.log('[ICE] 🔍 MD5 input capturado:', input);
                    console.log('[ICE] 🔍 MD5 output capturado:', output);
                }
            } catch (e) {
                console.warn('[ICE] ⚠️ Falha ao salvar MD5 input:', e);
            }
        }

        if (event.data.type === 'ICE_TOKEN_STACK') {
            try {
                const token = event.data.token || '';
                const stack = event.data.stack || '';
                if (token && stack) {
                    localStorage.setItem('icecassino_token_stack', stack);
                    safeChromeStorageSet({ icecassino_token_stack: stack });
                    console.log('[ICE] 🧩 Stack do token capturado');
                }
            } catch (e) {
                console.warn('[ICE] ⚠️ Falha ao salvar stack do token:', e);
            }
        }

        if (event.data.type === 'ICE_TOKEN_SOURCE') {
            try {
                const source = event.data.source || '';
                const value = event.data.value || '';
                if (source && value) {
                    localStorage.setItem('icecassino_token_source_last', source);
                    safeChromeStorageSet({ icecassino_token_source_last: source });
                    console.log('[ICE] 🧩 Token salvo em:', source);
                }
            } catch (e) {
                console.warn('[ICE] ⚠️ Falha ao salvar token source:', e);
            }
        }

        if (event.data.type === 'ICE_TOKEN_SOURCE_MATCH') {
            try {
                const sources = event.data.sources || [];
                if (sources.length) {
                    localStorage.setItem('icecassino_token_sources', JSON.stringify(sources));
                    safeChromeStorageSet({ icecassino_token_sources: sources });
                    console.log('[ICE] 🧩 Token encontrado em:', sources);
                }
            } catch (e) {
                console.warn('[ICE] ⚠️ Falha ao salvar token sources:', e);
            }
        }

        if (event.data.type === 'ICE_SIGN_FOUND') {
            try {
                const source = event.data.source || '';
                const input = event.data.input || '';
                const output = event.data.output || '';
                const extra = event.data.extra || '';
                if (input && output) {
                    localStorage.setItem('icecassino_sign_found_source', source);
                    localStorage.setItem('icecassino_sign_found_input', input);
                    localStorage.setItem('icecassino_sign_found_output', output);
                    localStorage.setItem('icecassino_sign_found_extra', extra);
                    safeChromeStorageSet({
                        icecassino_sign_found_source: source,
                        icecassino_sign_found_input: input,
                        icecassino_sign_found_output: output,
                        icecassino_sign_found_extra: extra
                    });
                    console.log('[ICE] ✅ SIGN FOUND capturado:', source);
                }
            } catch (e) {
                console.warn('[ICE] ⚠️ Falha ao salvar SIGN FOUND:', e);
            }
        }

        if (event.data.type === 'ICE_SIGN_ALGO') {
            console.log('[ICE] 📨 Recebido ICE_SIGN_ALGO do MAIN world');
            console.log('[ICE] Dados:', event.data);
            try {
                const algo = event.data.algo;
                const secret = event.data.secret;
                const secretValue = event.data.secret_value || '';
                if (algo) {
                    localStorage.setItem('icecassino_sign_algo', algo);
                    localStorage.setItem('icecassino_sign_secret', secret || '');
                    localStorage.setItem('icecassino_sign_secret_value', secretValue);
                    safeChromeStorageSet({
                        icecassino_sign_algo: algo,
                        icecassino_sign_secret: secret || '',
                        icecassino_sign_secret_value: secretValue
                    });
                    console.log('[ICE] ✅ Algoritmo de SIGN salvo:', algo, 'secret:', secret);
                } else {
                    console.warn('[ICE] ⚠️ Algo não definido no evento ICE_SIGN_ALGO');
                }
            } catch (e) {
                console.warn('[ICE] ⚠️ Falha ao salvar algoritmo de SIGN:', e);
            }
        }
        
        // ========== RESPONDER A CHECK_STORAGE_REQUEST DO MAIN WORLD ==========
        if (event.data.type === 'CHECK_STORAGE_REQUEST') {
            console.log('[ICE] 📨 Recebido CHECK_STORAGE_REQUEST do MAIN world');
            chrome.storage.local.get(['icecassino_token', 'icecassino_token_source', 'icecassino_token_time'], (result) => {
                console.log('[ICE] 📊 chrome.storage.local status:');
                if (result.icecassino_token) {
                    console.log('   ✅ icecassino_token:', result.icecassino_token.substring(0, 20) + '...');
                    console.log('   ✅ icecassino_token_source:', result.icecassino_token_source || 'N/A');
                    console.log('   ✅ icecassino_token_time:', result.icecassino_token_time || 'N/A');
                } else {
                    console.log('   ❌ VAZIO - Nenhum token em chrome.storage.local');
                    console.log('   💡 Execute: window.forceSaveTokenToStorage()');
                }
            });
        }
    });
    
    console.log('[ICE] ✅ Listener de mensagens do MAIN world ativo!');
    
    // ========== INICIALIZAÇÃO ==========
    function init() {
        console.log('[ICE] 🚀 Inicializando captura de dados...');
        console.log('[ICE] 🔍 Token conhecido do curl: 48acdbd6b72d6a1cebf08d82d955eff9');
        console.log('[ICE] 🔍 Este token é válido?', isValidToken('48acdbd6b72d6a1cebf08d82d955eff9'));
        
        // Criar UI
        createSimpleUI();
        
        // Capturar dados de login
        captureLoginData();
        
        // Configurar captura de token
        captureTokenFromRecharge();
        
        // Verificar status atual
        setTimeout(() => {
            checkAndUpdateStatus();
            
            // Se já tem token, atualizar UI
            const existingToken = localStorage.getItem('icecassino_token');
            if (existingToken) {
                tokenCaptured = true;
                updateUI('token_captured');
            }
        }, 1000);
        
        console.log('%c[ICE] ✅ Sistema de captura ativo!', 
                   'color: #4CAF50; font-size: 14px; padding: 5px;');
        console.log('[ICE] 📋 Monitorando:', {
            login: 'uid & key',
            token: 'headers/body de /recharge, /deposit, /payment',
            api: CONFIG.backendUrl
        });
        console.log('[ICE] 💡 Token esperado: 32 caracteres hexadecimais (ex: 48acdbd6b72d6a1cebf08d82d955eff9)');
    }
    
    // Aguardar DOM
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        setTimeout(init, 1000);
    }
    
})();