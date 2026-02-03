// ============================================
// 🎯 ICE CASINO TOKEN MONITOR - DETECÇÃO APÓS RECARGA (APENAS TOKEN)
// ============================================
(function() {
    'use strict';
    let monitoring = false;
    let lastToken = null;

    // Função para salvar token capturado
    function saveToken(token) {
        if (token) {
            localStorage.setItem('icecassino_token', token);
            console.log('[TOKEN MONITOR] Token salvo:', token);
        }
    }

    // Função para iniciar monitoramento
    function startMonitoring() {
        if (monitoring) return;
        monitoring = true;
        console.log('%c[TOKEN MONITOR] Monitoramento de token iniciado!', 'color: #2196F3; font-weight: bold;');

        // Intercepta fetch
        const originalFetch = window.fetch;
        window.fetch = function(...args) {
            const url = args[0]?.url || args[0];
            const options = args[1] || {};
            let headers = {};
            if (options.headers) {
                if (options.headers.entries) {
                    for (const [key, value] of options.headers.entries()) {
                        headers[key.toLowerCase()] = value;
                    }
                } else {
                    Object.keys(options.headers).forEach(key => {
                        headers[key.toLowerCase()] = options.headers[key];
                    });
                }
            }
            // Detecta requisição de recarga
            if (url && url.toString().includes('/recharge')) {
                let token = headers.token || null;
                if (token && token !== lastToken) {
                    lastToken = token;
                    saveToken(token);
                    console.log('[TOKEN MONITOR] Token capturado via fetch:', token);
                }
            }
            return originalFetch.apply(this, args);
        };

        // Intercepta XHR
        const OriginalXHR = window.XMLHttpRequest;
        if (OriginalXHR) {
            const originalOpen = OriginalXHR.prototype.open;
            const originalSend = OriginalXHR.prototype.send;
            const originalSetRequestHeader = OriginalXHR.prototype.setRequestHeader;
            const xhrHeaders = new WeakMap();
            OriginalXHR.prototype.setRequestHeader = function(header, value) {
                let headers = xhrHeaders.get(this);
                if (!headers) {
                    headers = {};
                    xhrHeaders.set(this, headers);
                }
                headers[header.toLowerCase()] = value;
                return originalSetRequestHeader.call(this, header, value);
            };
            OriginalXHR.prototype.open = function(method, url) {
                this._iceUrl = url;
                this._iceMethod = method;
                return originalOpen.call(this, method, url);
            };
            OriginalXHR.prototype.send = function(body) {
                const url = this._iceUrl;
                const headers = xhrHeaders.get(this) || {};
                let token = headers.token || null;
                if (url && url.toString().includes('/recharge')) {
                    if (token && token !== lastToken) {
                        lastToken = token;
                        saveToken(token);
                        console.log('[TOKEN MONITOR] Token capturado via XHR:', token);
                    }
                }
                return originalSend.call(this, body);
            };
        }
    }

    // Cria botão para iniciar monitoramento
    setTimeout(() => {
        const btn = document.createElement('button');
        btn.innerHTML = '🎯 Monitorar Token Recarga';
        btn.style.cssText = `
            position: fixed;
            top: 120px;
            right: 10px;
            z-index: 999999;
            background: #2196F3;
            color: white;
            padding: 12px 18px;
            border: none;
            border-radius: 8px;
            cursor: pointer;
            font-weight: bold;
            font-size: 14px;
            box-shadow: 0 4px 12px rgba(33, 150, 243, 0.4);
        `;
        btn.onclick = () => {
            startMonitoring();
            alert('Monitoramento de token iniciado! Faça uma recarga para capturar o token.');
        };
        document.body.appendChild(btn);
    }, 1000);

    console.log('%c[TOKEN MONITOR] Pronto para monitorar token de recarga (apenas token).', 'color: #2196F3; font-size: 14px; font-weight: bold;');
})();
