// TESTE SIMPLES - Se você ver isto, o arquivo está carregando
console.log('%c========================================', 'color: #FF0000; font-size: 20px; font-weight: bold;');
console.log('%c   INJECTOR.JS CARREGOU!!!', 'color: #FF0000; font-size: 20px; font-weight: bold;');
console.log('%c========================================', 'color: #FF0000; font-size: 20px; font-weight: bold;');

// Tentar injetar imediatamente
(function() {
    const script = document.createElement('script');
    script.textContent = `
        console.log('%c[INJECTED] Script injetado diretamente na página!', 'color: #00FF00; font-size: 18px; font-weight: bold;');
        
        // Salvar XHR original IMEDIATAMENTE
        const OriginalXHR = XMLHttpRequest;
        const origOpen = OriginalXHR.prototype.open;
        const origSend = OriginalXHR.prototype.send;
        const origSetHeader = OriginalXHR.prototype.setRequestHeader;
        
        const xhrMap = new WeakMap();
        
        OriginalXHR.prototype.setRequestHeader = function(name, value) {
            let data = xhrMap.get(this);
            if (!data) {
                data = { headers: {} };
                xhrMap.set(this, data);
            }
            data.headers[name] = value;
            
            if (name === 'token') {
                console.log('%c[INJECTED] 🎯🎯🎯 TOKEN HEADER DETECTADO!', 'color: #FF0000; font-size: 20px; font-weight: bold;');
                console.log('[INJECTED] Token:', value);
                
                window.postMessage({ type: 'ICE_TOKEN', token: value, source: 'injected' }, '*');
            }
            
            return origSetHeader.call(this, name, value);
        };
        
        OriginalXHR.prototype.open = function(method, url) {
            let data = xhrMap.get(this);
            if (!data) {
                data = { headers: {} };
                xhrMap.set(this, data);
            }
            data.url = url;
            data.method = method;
            
            if (url.includes('/api/v1/user/recharge')) {
                console.log('%c[INJECTED] 🎯 RECARGA!', 'color: #00FF00; font-size: 16px; font-weight: bold;');
            }
            
            return origOpen.apply(this, arguments);
        };
        
        console.log('[INJECTED] ✅ XHR interceptor ativo!');
    `;
    
    (document.head || document.documentElement).prepend(script);
    console.log('%c[INJECTOR] ✅ Script foi inserido no DOM!', 'color: #00BCD4; font-size: 16px; font-weight: bold;');
})();

// Listener para mensagens
window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    
    if (event.data.type === 'ICE_TOKEN') {
        console.log('%c[INJECTOR] 🎉 TOKEN RECEBIDO!', 'color: #4CAF50; font-size: 18px; font-weight: bold;');
        console.log('[INJECTOR] Token:', event.data.token);
        
        // Enviar ao backend
        fetch('http://127.0.0.1:8788/api/icecassino_token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                type: 'token',
                token: event.data.token,
                source: 'injected_interceptor',
                timestamp: new Date().toISOString()
            })
        }).then(() => console.log('[INJECTOR] ✅ Enviado ao backend!'))
          .catch(e => console.error('[INJECTOR] ❌ Erro:', e));
    }
});

console.log('%c[INJECTOR] ✅ Tudo configurado!', 'color: #00BCD4; font-size: 16px; font-weight: bold;');
