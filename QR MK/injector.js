// ============================================
// INJECTOR - Injeta script ANTES de tudo
// ============================================

console.log('%c[INJECTOR] 🔧 Carregando injector.js...', 'color: #00BCD4; font-weight: bold; font-size: 14px;');

(function() {
    'use strict';
    
    console.log('%c[INJECTOR] 🚀 Iniciando injeção de script...', 'color: #00BCD4; font-weight: bold;');
    
    // Script que será injetado na página ANTES de qualquer código do site
    const scriptContent = `
(function() {
    console.log('%c[INJECTED] 🚀 Interceptor injetado ANTES do código do site!', 'color: #00BCD4; font-weight: bold; font-size: 14px;');
    
    // Salvar referências originais IMEDIATAMENTE
    const OriginalXHR = window.XMLHttpRequest;
    const originalOpen = OriginalXHR.prototype.open;
    const originalSend = OriginalXHR.prototype.send;
    const originalSetRequestHeader = OriginalXHR.prototype.setRequestHeader;
    
    const xhrHeaders = new WeakMap();
    
    // Interceptar setRequestHeader
    OriginalXHR.prototype.setRequestHeader = function(header, value) {
        let headers = xhrHeaders.get(this);
        if (!headers) {
            headers = {};
            xhrHeaders.set(this, headers);
        }
        headers[header] = value;
        
        // Detectar header 'token'
        if (header === 'token' && value && /^[0-9a-f]{32}$/i.test(value)) {
            console.log('%c[INJECTED] 🎯 HEADER TOKEN DETECTADO!', 'color: #FF9800; font-weight: bold; font-size: 14px;');
            console.log('[INJECTED] Token:', value);
            console.log('[INJECTED] URL:', this._injectedUrl || 'ainda não definida');
            
            // Enviar mensagem para o content script
            window.postMessage({
                type: 'ICE_TOKEN_CAPTURED',
                token: value,
                url: this._injectedUrl,
                source: 'injected_xhr_header'
            }, '*');
        }
        
        return originalSetRequestHeader.call(this, header, value);
    };
    
    // Interceptar open
    OriginalXHR.prototype.open = function(method, url) {
        this._injectedUrl = url;
        this._injectedMethod = method;
        
        if (method === 'POST' && url.includes('/api/v1/user/recharge')) {
            console.log('%c[INJECTED] 🎯 REQUISIÇÃO DE RECARGA!', 'color: #2196F3; font-weight: bold; font-size: 14px;');
            console.log('[INJECTED] Method:', method);
            console.log('[INJECTED] URL:', url);
            this._injectedIsRecharge = true;
        }
        
        return originalOpen.apply(this, arguments);
    };
    
    // Interceptar send
    OriginalXHR.prototype.send = function(body) {
        if (this._injectedIsRecharge) {
            const headers = xhrHeaders.get(this) || {};
            console.log('[INJECTED] 📤 Enviando requisição de recarga');
            console.log('[INJECTED] Headers:', headers);
            console.log('[INJECTED] Body:', body?.substring(0, 200));
            
            const token = headers.token || headers.Token || headers.TOKEN;
            if (token) {
                console.log('%c[INJECTED] ✅✅✅ TOKEN CONFIRMADO NO SEND!', 'color: #4CAF50; font-weight: bold; font-size: 16px;');
                console.log('[INJECTED] Token:', token);
            } else {
                console.warn('%c[INJECTED] ⚠️ Token não encontrado!', 'color: #FF9800; font-weight: bold;');
            }
        }
        
        return originalSend.apply(this, arguments);
    };
    
    console.log('[INJECTED] ✅ XHR interceptor instalado com sucesso!');
    console.log('[INJECTED] ⏳ Aguardando requisições de recarga...');
})();
`;
    
    // Injetar o script na página
    try {
        console.log('[INJECTOR] 📝 Criando elemento script...');
        const script = document.createElement('script');
        script.textContent = scriptContent;
        script.setAttribute('data-injected', 'ice-token-interceptor');
        
        const target = document.head || document.documentElement;
        console.log('[INJECTOR] 🎯 Target:', target?.tagName || 'null');
        
        if (target) {
            target.appendChild(script);
            console.log('[INJECTOR] ✅ Script anexado ao', target.tagName);
            script.remove();
            console.log('[INJECTOR] ✅ Script injetado e removido com sucesso!');
        } else {
            console.error('[INJECTOR] ❌ Nenhum target disponível (head/documentElement)!');
        }
    } catch (error) {
        console.error('[INJECTOR] ❌ Erro ao injetar script:', error);
    }
    
    // Listener para mensagens do script injetado
    window.addEventListener('message', function(event) {
        // Verificar origem
        if (event.source !== window) return;
        
        if (event.data.type === 'ICE_TOKEN_CAPTURED') {
            console.log('%c[INJECTOR] 🎉 TOKEN RECEBIDO DO SCRIPT INJETADO!', 'color: #4CAF50; font-weight: bold; font-size: 16px;');
            console.log('[INJECTOR] Token:', event.data.token);
            console.log('[INJECTOR] URL:', event.data.url);
            console.log('[INJECTOR] Source:', event.data.source);
            
            // Enviar para o backend
            fetch('http://127.0.0.1:8788/api/icecassino_token', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    type: 'token',
                    token: event.data.token,
                    source: event.data.source,
                    url: event.data.url,
                    timestamp: new Date().toISOString()
                })
            }).then(r => {
                if (r.ok) {
                    console.log('[INJECTOR] ✅ Token enviado ao backend!');
                    return r.json();
                } else {
                    console.warn('[INJECTOR] ⚠️ Backend status:', r.status);
                    throw new Error('Backend error');
                }
            }).then(data => {
                console.log('[INJECTOR] 📦 Resposta do backend:', data);
            }).catch(e => {
                console.error('[INJECTOR] ❌ Erro ao enviar ao backend:', e);
            });
        }
    });
    
    console.log('[INJECTOR] ✅ Listener de mensagens ativo!');
})();
