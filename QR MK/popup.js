async function load() {
  const cfg = await chrome.storage.sync.get({ enabled: false, removeCents: false });
  document.getElementById("enabled").checked = !!cfg.enabled;
  document.getElementById("removeCents").checked = !!cfg.removeCents;
}

document.getElementById("enabled").addEventListener("change", async (e) => {
  await chrome.storage.sync.set({ enabled: e.target.checked });
});

document.getElementById("removeCents").addEventListener("change", async (e) => {
  await chrome.storage.sync.set({ removeCents: e.target.checked });
});

// Botão de detecção de novo cassino
document.getElementById("detectBtn").addEventListener("click", async () => {
  const statusDiv = document.getElementById("status");
  const statusText = document.getElementById("statusText");
  const detectedDiv = document.getElementById("detectedData");
  
  statusDiv.style.display = "block";
  statusText.textContent = "🔄 Injetando detector na aba ativa...";
  detectedDiv.style.display = "none";
  
  try {
    // Pega a aba ativa
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (!tab?.id) {
      statusText.textContent = "❌ Nenhuma aba ativa encontrada";
      return;
    }
    
    // Injeta o script de detecção
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: injectDetector
    });
    
    statusText.textContent = "✅ Detector ativo! Faça uma recarga no cassino...";
    
    // Escuta por dados detectados
    chrome.runtime.onMessage.addListener(function listener(msg) {
      if (msg.action === "casinoDetected") {
        chrome.runtime.onMessage.removeListener(listener);
        displayDetectedData(msg.data);
      }
    });
    
  } catch (err) {
    statusText.textContent = `❌ Erro: ${err.message}`;
  }
});

function displayDetectedData(data) {
  const detectedDiv = document.getElementById("detectedData");
  const dataInfo = document.getElementById("dataInfo");
  const statusDiv = document.getElementById("status");
  
  statusDiv.style.display = "none";
  detectedDiv.style.display = "block";
  
  dataInfo.innerHTML = `
    <div><b>URL:</b> ${data.url}</div>
    <div><b>UID:</b> ${data.uid}</div>
    <div><b>Key:</b> ${data.key?.substring(0, 10)}...</div>
    <div><b>Token:</b> ${data.token?.substring(0, 10)}...</div>
    <div style="margin-top: 5px; color: green;"><b>✓ Configuração salva!</b></div>
  `;
}

// Função injetada na página do cassino
function injectDetector() {
  console.log('%c[DETECTOR] Iniciando captura automática...', 'color: #ff6b00; font-weight: bold; font-size: 14px;');
  
  const originalXHROpen = XMLHttpRequest.prototype.open;
  const originalXHRSend = XMLHttpRequest.prototype.send;
  const originalXHRSetRequestHeader = XMLHttpRequest.prototype.setRequestHeader;

  XMLHttpRequest.prototype.open = function(method, url, ...rest) {
    this._url = url;
    this._method = method;
    this._headers = {};
    return originalXHROpen.call(this, method, url, ...rest);
  };

  XMLHttpRequest.prototype.setRequestHeader = function(header, value) {
    this._headers[header] = value;
    
    // CAPTURA COOKIES do header Set-Cookie ou Cookie
    if (header.toLowerCase() === 'cookie') {
      console.log('[DETECTOR] 🍪 Cookie header detectado:', value);
      this._cookies = value;
    }
    
    return originalXHRSetRequestHeader.call(this, header, value);
  };

  XMLHttpRequest.prototype.send = function(body) {
    if (this._url && this._url.includes('recharge')) {
      console.log('\n' + '='.repeat(80));
      console.log('%c🔍 RECARGA DETECTADA!', 'color: #00ff00; font-weight: bold; font-size: 16px;');
      console.log('='.repeat(80));
      console.log('Method:', this._method);
      console.log('URL:', this._url);
      
      console.log('\n📋 HEADERS:');
      const headers = {};
      const cookies_from_header = this._cookies || '';
      
      for (let [key, value] of Object.entries(this._headers)) {
        headers[key] = value;
        if (key.toLowerCase() === 'token') {
          console.log(`  %c${key}: ${value}%c 👈 TOKEN!`, 'color: #ff0000; font-weight: bold;', '');
        } else if (key.toLowerCase() === 'cookie') {
          console.log(`  %c${key}: ${value}%c 👈 COOKIES!`, 'color: #ff8800; font-weight: bold;', '');
        } else {
          console.log(`  ${key}: ${value}`);
        }
      }
      
      // Se não encontrou Cookie header, tenta document.cookie como fallback
      const all_cookies = cookies_from_header || document.cookie || '';
      if (all_cookies) {
        console.log('\n🍪 COOKIES:');
        console.log(all_cookies);
      }
      
      let bodyParams = {};
      if (body) {
        console.log('\n📦 BODY:');
        console.log(body);
        
        try {
          const params = new URLSearchParams(body);
          for (let [key, value] of params) {
            bodyParams[key] = value;
            console.log(`  ${key}: ${value}`);
          }
        } catch(e) {}
      }
      
      console.log('='.repeat(80));
      console.log('%c✅ DADOS CAPTURADOS E SALVOS!', 'color: #00ff00; font-weight: bold; font-size: 14px;');
      
      // Envia dados para a extensão
      const detectedData = {
        url: this._url,
        method: this._method,
        headers: headers,
        body: bodyParams,
        cookies: all_cookies,
        token: headers.token || headers.Token,
        key: bodyParams.key || headers.key,
        uid: bodyParams.uid,
        payMethod: bodyParams.pay_method,
        returnUrl: bodyParams.return_url
      };
      
      // Salva automaticamente (incluindo cookies)
      chrome.storage.local.set({
        casino_url: this._url,
        casino_token: detectedData.token,
        casino_key: detectedData.key,
        casino_uid: detectedData.uid,
        casino_pay_method: detectedData.payMethod,
        casino_return_url: detectedData.returnUrl,
        casino_cookies: all_cookies,
        casino_detected_at: new Date().toISOString()
      });
      
      // Notifica o popup
      chrome.runtime.sendMessage({
        action: 'casinoDetected',
        data: detectedData
      });
    }
    return originalXHRSend.call(this, body);
  };

  console.log('%c✅ Detector XHR ativo! Faça uma recarga...', 'color: #00ff00; font-weight: bold;');
}

load();