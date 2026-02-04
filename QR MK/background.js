// ========== CREDENTIAL EXTRACTION UTILITIES ==========
/**
 * Extracts all available storage data from a domain
 */
async function extractAllCredentials(url, tabId, extraUrls = []) {
  const cookieUrlCandidates = new Set();
  if (url) {
    cookieUrlCandidates.add(url);
  }
  for (const u of extraUrls) {
    if (u) {
      cookieUrlCandidates.add(u);
    }
  }

  const cookies = [];
  const cookieKeySet = new Set();
  for (const candidate of cookieUrlCandidates) {
    try {
      const list = await chrome.cookies.getAll({ url: candidate });
      for (const c of list) {
        const key = `${c.name}|${c.domain}|${c.path}`;
        if (cookieKeySet.has(key)) continue;
        cookieKeySet.add(key);
        cookies.push(c);
      }
    } catch (e) {
      // ignore invalid URLs
    }
  }
  const targetTabId = tabId || (await chrome.tabs.query({ active: true, currentWindow: true }))[0]?.id;

  if (!targetTabId) {
        return { localStorage: {}, sessionStorage: {}, cookies };
    }

    try {
        const result = await chrome.scripting.executeScript({
      target: { tabId: targetTabId },
            func: () => {
                const local = {}, session = {};
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
        return { localStorage: storageData.local, sessionStorage: storageData.session, cookies };
    } catch (e) {
        console.warn('[BACKGROUND] Erro ao extrair credenciais:', e);
        return { localStorage: {}, sessionStorage: {}, cookies };
    }
}

async function getCfg() {
  return await chrome.storage.sync.get({
    enabled: false
  });
}

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== "toggle-enabled") return;

  const cfg = await getCfg();
  const next = !cfg.enabled;
  await chrome.storage.sync.set({ enabled: next });

  // avisa as abas do WhatsApp
  const tabs = await chrome.tabs.query({ url: "https://web.whatsapp.com/*" });
  for (const t of tabs) {
    if (!t.id) continue;
    chrome.tabs.sendMessage(t.id, { type: "setEnabled", enabled: next }).catch(() => {});
  }
});

// ========== INTERCEPTAÇÃO DE TOKEN (ICE CASINO) ==========
// Captura headers de requisições para /api/v1/user/recharge
chrome.webRequest.onBeforeSendHeaders.addListener(
  async function(details) {
    // Verificar especificamente POST para /api/v1/user/recharge
    if (details.method === 'POST' && details.url.includes('/api/v1/user/recharge')) {
      console.log('%c[BACKGROUND] 🎯 REQUISIÇÃO DE RECARGA INTERCEPTADA!', 
                 'color: #2196F3; font-weight: bold; font-size: 14px;');
      console.log('[BACKGROUND] URL:', details.url);
      console.log('[BACKGROUND] Método:', details.method);
      
      // Procurar header 'token' (exatamente minúsculo conforme especificação)
      const tokenHeader = details.requestHeaders.find(h => h.name === 'token');
      
      if (tokenHeader && tokenHeader.value) {
        const token = tokenHeader.value;
        
        console.log('%c[BACKGROUND] ✅✅✅ TOKEN CAPTURADO!', 
                   'color: #4CAF50; font-weight: bold; font-size: 16px;');
        console.log('[BACKGROUND] Token completo:', token);
        console.log('[BACKGROUND] Tamanho:', token.length, 'chars (esperado: 32)');
        console.log('[BACKGROUND] Formato:', /^[0-9a-f]{32}$/i.test(token) ? 'hex 32 ✅' : 'formato inesperado ⚠️');
        
        // Extrair credenciais (NEW - CREDENTIAL EXTRACTION)
          const originHeader = details.requestHeaders.find(h => h.name && h.name.toLowerCase() === 'origin');
          const refererHeader = details.requestHeaders.find(h => h.name && h.name.toLowerCase() === 'referer');
          const extraUrls = [
            originHeader?.value,
            refererHeader?.value,
            'https://icecassino.com/',
            'https://www.icecassino.com/'
          ].filter(Boolean);
          const credentials = await extractAllCredentials(details.url, undefined, extraUrls);
        console.log('[BACKGROUND] 📦 Credenciais extraídas:', {
          localStorage_keys: Object.keys(credentials.localStorage).length,
          sessionStorage_keys: Object.keys(credentials.sessionStorage).length,
          cookies_count: credentials.cookies.length
        });
        
        // Enviar token para o backend
        fetch('http://127.0.0.1:8788/api/icecassino_token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'token',
            token: token,
            credentials: credentials,
            source: 'background_webRequest',
            url: details.url,
            timestamp: new Date().toISOString()
          })
        }).then(r => {
          if (r.ok) {
            console.log('[BACKGROUND] ✅ Token enviado ao backend com sucesso!');
            return r.json();
          } else {
            console.warn('[BACKGROUND] ⚠️ Backend retornou status:', r.status);
            throw new Error('Backend status: ' + r.status);
          }
        }).then(res => {
          console.log('[BACKGROUND] Resposta do backend:', res);
        }).catch(e => {
          console.error('[BACKGROUND] ❌ Erro ao enviar token ao backend:', e);
        });

        // Salvar cookies localmente para uso do content script (fallback)
        try {
          if (credentials && credentials.cookies && credentials.cookies.length > 0) {
            const cookieHeader = credentials.cookies
              .filter(c => c && c.name && c.value !== undefined)
              .map(c => `${c.name}=${c.value}`)
              .join('; ');
            if (cookieHeader) {
              chrome.storage.local.set({ casino_cookies: cookieHeader });
            }
          }
        } catch (e) {
          console.warn('[BACKGROUND] ⚠️ Erro ao salvar cookies no storage:', e);
        }
        
        // Enviar para content script atualizar UI
        if (details.tabId && details.tabId > 0) {
          chrome.tabs.sendMessage(details.tabId, {
            type: 'TOKEN_CAPTURED',
            token: token,
            source: 'background_webRequest',
            url: details.url
          }).catch(() => {
            console.log('[BACKGROUND] Content script não disponível na aba');
          });
        }
      } else {
        console.warn('%c[BACKGROUND] ⚠️ Header "token" NÃO encontrado!', 
                   'color: #FF9800; font-weight: bold;');
        console.log('[BACKGROUND] Headers disponíveis:', 
                  details.requestHeaders.map(h => h.name).join(', '));
      }
    }
    
    return { requestHeaders: details.requestHeaders };
  },
  { urls: ["<all_urls>"] },
  ["requestHeaders", "extraHeaders"]
);

console.log('[BACKGROUND] ✅ Interceptor de token configurado');

// Listener para requisições do servidor
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === "FETCH_CREDENTIALS") {
    // Enviar resposta de forma síncrona primeiro
    sendResponse({ status: 'processing' });
    
    // Depois processar a requisição de forma assíncrona
    extractAllCredentials(request.url || '', sender?.tab?.id).then((credentials) => {
      // Armazenar para possível reuso
      chrome.storage.local.set({ 
        last_credentials: credentials,
        last_credentials_time: new Date().toISOString()
      });
      console.log('[BACKGROUND] ✅ Credenciais extraídas e armazenadas');
    }).catch((e) => {
      console.warn('[BACKGROUND] ⚠️ Erro ao extrair credenciais:', e);
    });
    
    return; // Não retorna true para não esperar resposta
  }

  if (request.type === "GENERATE_PIX_AUTO") {
    // Processar de forma assíncrona
    chrome.tabs.query({
      url: [
        "https://www.icecassino.com/*",
        "https://icecassino.com/*",
        "https://*.bzcfgm.com/*",
        "https://*.cloudfront.net/*"
      ]
    }).then((tabs) => {
      if (!tabs || tabs.length === 0 || !tabs[0].id) {
        sendResponse({ success: false, error: "Aba do Ice Cassino não encontrada" });
        return;
      }

      chrome.tabs.sendMessage(
        tabs[0].id,
        { type: "GENERATE_PIX_AUTO", amount: request.amount },
        (response) => {
          if (chrome.runtime.lastError) {
            sendResponse({ success: false, error: chrome.runtime.lastError.message });
            return;
          }
          sendResponse(response || { success: false, error: "Sem resposta do Ice Cassino" });
        }
      );
    }).catch((e) => {
      sendResponse({ success: false, error: e?.message || String(e) });
    });

    return true; // Espera resposta assíncrona
  }

  if (request.type === "focusWhatsAppInput") {
    // Envia comando para a aba do WhatsApp focar no campo de input
    chrome.tabs.query({ url: "https://web.whatsapp.com/*" }).then((tabs) => {
      for (const tab of tabs) {
        if (!tab.id) continue;
        chrome.tabs.sendMessage(tab.id, { type: "focusInput" }).catch(() => {});
      }
      sendResponse({ status: "focus_command_sent" });
    });
    return true; // Espera resposta assíncrona
  }
});
