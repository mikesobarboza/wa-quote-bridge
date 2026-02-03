// ========== INTERCEPTOR DE DEBUG ULTRA SIMPLES ==========
// Cole este código no console do DevTools do site Ice Casino
// para ver TODAS as requisições em tempo real

(function() {
    console.log('%c========================================', 'color: #00BCD4; font-size: 16px; font-weight: bold;');
    console.log('%c   DEBUG INTERCEPTOR ATIVADO!', 'color: #00BCD4; font-size: 16px; font-weight: bold;');
    console.log('%c========================================', 'color: #00BCD4; font-size: 16px; font-weight: bold;');
    
    // Contador de requisições
    let reqCount = 0;
    
    // ========== INTERCEPTAR XMLHttpRequest ==========
    const XHR = XMLHttpRequest.prototype;
    const origOpen = XHR.open;
    const origSend = XHR.send;
    const origSetHeader = XHR.setRequestHeader;
    
    const xhrData = new WeakMap();
    
    XHR.open = function(method, url) {
        xhrData.set(this, { method, url, headers: {} });
        return origOpen.apply(this, arguments);
    };
    
    XHR.setRequestHeader = function(name, value) {
        const data = xhrData.get(this);
        if (data) {
            data.headers[name] = value;
        }
        return origSetHeader.apply(this, arguments);
    };
    
    XHR.send = function(body) {
        const data = xhrData.get(this);
        reqCount++;
        
        console.log(`%c[${reqCount}] XHR REQUEST`, 'background: #FF9800; color: white; padding: 2px 5px; font-weight: bold;');
        console.log('  Method:', data?.method || 'GET');
        console.log('  URL:', data?.url || 'unknown');
        console.log('  Headers:', data?.headers || {});
        if (body) console.log('  Body:', typeof body === 'string' ? body.substring(0, 200) : body);
        
        // Verificar se é recarga
        const url = data?.url || '';
        if (url.includes('/recharge') || url.includes('/api/v1/user/recharge')) {
            console.log('%c  ►►► RECARGA DETECTADA! ◄◄◄', 'color: #FF0000; font-size: 14px; font-weight: bold;');
            
            // Verificar header token
            const token = data?.headers?.token || data?.headers?.Token || data?.headers?.TOKEN;
            if (token) {
                console.log('%c  ►►► TOKEN FOUND: ' + token, 'color: #4CAF50; font-size: 14px; font-weight: bold;');
            } else {
                console.log('%c  ►►► NO TOKEN HEADER!', 'color: #F44336; font-size: 14px; font-weight: bold;');
                console.log('  Available headers:', Object.keys(data?.headers || {}));
            }
        }
        
        return origSend.apply(this, arguments);
    };
    
    // ========== INTERCEPTAR FETCH ==========
    const origFetch = window.fetch;
    
    window.fetch = function(...args) {
        reqCount++;
        const url = typeof args[0] === 'string' ? args[0] : args[0]?.url || 'unknown';
        const options = args[1] || {};
        const method = (options.method || 'GET').toUpperCase();
        
        console.log(`%c[${reqCount}] FETCH REQUEST`, 'background: #2196F3; color: white; padding: 2px 5px; font-weight: bold;');
        console.log('  Method:', method);
        console.log('  URL:', url);
        console.log('  Options:', options);
        
        // Verificar se é recarga
        if (url.includes('/recharge') || url.includes('/api/v1/user/recharge')) {
            console.log('%c  ►►► RECARGA DETECTADA! ◄◄◄', 'color: #FF0000; font-size: 14px; font-weight: bold;');
            
            // Verificar headers
            let headers = {};
            if (options.headers) {
                if (options.headers instanceof Headers) {
                    options.headers.forEach((value, key) => {
                        headers[key] = value;
                    });
                } else {
                    headers = options.headers;
                }
            }
            
            console.log('  Headers:', headers);
            
            const token = headers.token || headers.Token || headers.TOKEN;
            if (token) {
                console.log('%c  ►►► TOKEN FOUND: ' + token, 'color: #4CAF50; font-size: 14px; font-weight: bold;');
            } else {
                console.log('%c  ►►► NO TOKEN HEADER!', 'color: #F44336; font-size: 14px; font-weight: bold;');
                console.log('  Available headers:', Object.keys(headers));
            }
            
            if (options.body) {
                console.log('  Body:', typeof options.body === 'string' ? options.body.substring(0, 200) : options.body);
            }
        }
        
        return origFetch.apply(this, arguments);
    };
    
    console.log('%c✅ Interceptors ativos! Faça uma recarga para ver os dados.', 'color: #4CAF50; font-size: 14px;');
    console.log('%cProcure por "►►► RECARGA DETECTADA! ◄◄◄" nos logs', 'color: #FFC107; font-size: 12px;');
})();
