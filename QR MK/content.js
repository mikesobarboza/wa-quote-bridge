const DEFAULTS = {
  enabled: false,
  removeCents: false,
  endpoint: "http://127.0.0.1:8788/process",
  localSecret: "troque-isto",
  debounceMs: 250,
  minIntervalMs: 900,
  pixMode: 'text' // 'text' ou 'image'
};

let cfg = { ...DEFAULTS };

// Carregar jsQR
function loadJsQR() {
  return new Promise((resolve) => {
    if (window.jsQR) {
      resolve();
    } else {
      const script = document.createElement('script');
      script.src = chrome.runtime.getURL('jsQR.js');
      script.onload = resolve;
      script.onerror = () => {
        console.warn('[WA-Bridge] Falha ao carregar jsQR');
        resolve();
      };
      document.documentElement.appendChild(script);
    }
  });
}

// Silencia erros de contexto invalidado
window.addEventListener('unhandledrejection', (event) => {
  if (event.reason && event.reason.toString().includes('context')) {
    event.preventDefault();
  }
}, true);

window.addEventListener('error', (event) => {
  if (event.message && event.message.includes('context')) {
    return true;
  }
}, true);

let lastText = "";
let lastSentAt = 0;
let debounceTimer = null;
let footerObserver = null;
let lastQuoteTimestamp = 0;
let lastFooterId = null;

// ===============================
// PIX FLOW (WhatsApp double-click)
// ===============================
const pixQueue = [];
let isProcessingQueue = false;

function extractNumericValue(brlString) {
  let cleaned = brlString.replace(/R\$\s*/i, '').trim();

  const lastComma = cleaned.lastIndexOf(',');
  const lastDot = cleaned.lastIndexOf('.');

  let normalized = '';

  if (lastComma === -1 && lastDot === -1) {
    normalized = cleaned;
  } else if (lastComma > lastDot) {
    normalized = cleaned.replace(/\./g, '').replace(',', '.');
  } else if (lastDot > lastComma) {
    normalized = cleaned.replace(/,/g, '');
  } else if (lastDot !== -1 && lastComma === -1) {
    const parts = cleaned.split('.');
    if (parts[parts.length - 1].length === 3) {
      normalized = cleaned.replace(/\./g, '');
    } else {
      normalized = cleaned;
    }
  }

  const value = parseFloat(normalized);
  if (Number.isNaN(value)) return 0;
  return Math.round(value * 100); // centavos
}

async function handleDoubleClick(event) {
  try {
    if (!cfg.enabled) return;

    const selection = window.getSelection();
    const selectedText = selection ? selection.toString().trim() : '';

    let textToProcess = selectedText;
    if (!textToProcess) {
      const target = event.target;
      if (target && target.closest) {
        const messageContainer = target.closest('[data-pre-plain-text]') ||
          target.closest('.copyable-text') ||
          target.closest('div[role="row"]');
        textToProcess = (messageContainer && messageContainer.innerText) ? messageContainer.innerText : '';
      }
    }

    const brlMatch = textToProcess.match(/R\$\s*[\d.,]+/i);
    if (!brlMatch) return;

    const numericAmount = extractNumericValue(brlMatch[0]);
    if (numericAmount <= 0) return;

    await generateAndPastePix(brlMatch[0], numericAmount);
  } catch (e) {
    console.error('[WA-Bridge] Erro handleDoubleClick:', e);
  }
}

async function generateAndPastePix(value, numericAmount) {
  console.log(`[WA-Bridge] Enfileirando PIX: R$ ${(numericAmount / 100).toFixed(2)}`);

  return new Promise((resolve, reject) => {
    pixQueue.push({ value, numericAmount, resolve, reject });
    processPixQueue();
  });
}

async function processPixQueue() {
  if (isProcessingQueue || pixQueue.length === 0) return;

  isProcessingQueue = true;

  while (pixQueue.length > 0) {
    const request = pixQueue.shift();
    if (!request) break;

    try {
      await executePixGeneration(request.value, request.numericAmount);
      request.resolve();
    } catch (error) {
      request.reject(error);
    }

    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  isProcessingQueue = false;
}

async function executePixGeneration(value, numericAmount) {
  const startTime = Date.now();

  try {
    console.log(`[WA-Bridge] Gerando PIX para R$ ${(numericAmount / 100).toFixed(2)}`);

    const result = await new Promise((resolve) => {
      chrome.runtime.sendMessage(
        {
          type: 'GENERATE_PIX_AUTO',
          amount: numericAmount
        },
        (response) => {
          resolve(response || { success: false, error: 'Sem resposta do background' });
        }
      );
    });

    if (!result || !result.success) {
      throw new Error(result && result.error ? result.error : 'Falha na geração');
    }

    let codeToSend = result.pixCode;
    if (!codeToSend && result.qrCode) {
      if (typeof result.qrCode === 'string' && result.qrCode.startsWith('000201')) {
        codeToSend = result.qrCode;
      } else {
        const decoded = await decodeQrCodeFromBase64(result.qrCode);
        if (decoded) codeToSend = decoded;
      }
    }

    if (!codeToSend) {
      throw new Error('PIX vazio na resposta');
    }

    // Modo imagem: gerar QR code visual
    if (cfg.pixMode === 'image' && window.jsQR) {
      const qrImage = await generateQrCodeImage(codeToSend);
      if (qrImage) {
        const imageResult = await pasteImageToWhatsApp(qrImage);
        if (imageResult.success) {
          await new Promise((resolve) => setTimeout(resolve, 100));
          await clickSendButton();
          const duration = Date.now() - startTime;
          showSuccessNotification(`QR enviado em ${duration}ms`);
          return;
        }
      }
    }

    // Modo texto (padrão ou fallback)
    const textResult = await insertTextMessage(codeToSend);
    if (!textResult.success) {
      throw new Error(`Falha no WhatsApp: ${textResult.error}`);
    }

    await new Promise((resolve) => setTimeout(resolve, 100));
    await clickSendButton();

    const duration = Date.now() - startTime;
    showSuccessNotification(`PIX enviado em ${duration}ms`);
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Erro desconhecido';
    console.error('[WA-Bridge] Erro PIX:', msg);
    showErrorNotification(msg);
    throw error;
  }
}

function findComposeBox() {
  return (
    document.querySelector('[contenteditable="true"][data-testid="compose-box-input"]') ||
    document.querySelector('div[contenteditable="true"][role="textbox"]') ||
    document.querySelector('footer div[contenteditable="true"]') ||
    document.querySelector('div[contenteditable="true"][data-tab="10"]')
  );
}

async function insertTextMessage(text) {
  try {
    const composeBox = findComposeBox();
    if (!composeBox) {
      return { success: false, error: 'Campo de composição não encontrado' };
    }

    const lines = String(text).split('\n');
    const htmlContent = lines.map(line => `<span>${escapeHtml(line)}</span>`).join('<br>');
    composeBox.innerHTML = htmlContent;

    composeBox.dispatchEvent(new Event('input', { bubbles: true }));
    composeBox.dispatchEvent(new Event('change', { bubbles: true }));

    return { success: true };
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Erro desconhecido';
    return { success: false, error: msg };
  }
}

async function clickSendButton() {
  const sendButton = document.querySelector(
    '[aria-label="Enviar"]'
  ) || document.querySelector(
    '[aria-label="Send"]'
  ) || document.querySelector(
    'span[data-icon="send"]'
  )?.parentElement;

  if (!sendButton) {
    console.warn('[WA-Bridge] Botão de envio não encontrado');
    return;
  }

  sendButton.click();
}

async function generateQrCodeImage(pixCode) {
  try {
    // Biblioteca externa para gerar QR (usar aqui se disponível)
    // Para simplicidade, retornamos null - jsQR decodifica, não codifica
    // Usar QRCode.js ou similar seria necessário
    console.log('[WA-Bridge] Nota: geração de QR requer biblioteca de codificação');
    return null;
  } catch (error) {
    console.error('[WA-Bridge] Erro ao gerar QR:', error);
    return null;
  }
}

async function pasteImageToWhatsApp(imageBase64) {
  try {
    const fileInput = document.querySelector('input[type="file"]');
    if (!fileInput) {
      return { success: false, error: 'Input de arquivo não encontrado' };
    }

    const blob = base64ToBlob(imageBase64);
    const file = blobToFile(blob, `pix-qrcode-${Date.now()}.png`);
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(file);
    fileInput.files = dataTransfer.files;

    fileInput.dispatchEvent(new Event('change', { bubbles: true }));
    fileInput.dispatchEvent(new Event('input', { bubbles: true }));

    return { success: true };
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Erro desconhecido';
    return { success: false, error: msg };
  }
}

async function decodeQrCodeFromBase64(base64) {
  try {
    if (!base64 || typeof base64 !== 'string') return null;
    if (!window.jsQR) return null;

    const img = new Image();
    const dataUrl = base64.startsWith('data:') ? base64 : `data:image/png;base64,${base64}`;

    const decoded = await new Promise((resolve) => {
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = img.width;
          canvas.height = img.height;
          const ctx = canvas.getContext('2d');
          if (!ctx) return resolve(null);
          ctx.drawImage(img, 0, 0);
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const code = window.jsQR(imageData.data, canvas.width, canvas.height);
          resolve(code ? code.data : null);
        } catch (e) {
          resolve(null);
        }
      };
      img.onerror = () => resolve(null);
      img.src = dataUrl;
    });

    return decoded;
  } catch (e) {
    return null;
  }
}

function base64ToBlob(base64) {
  const [header, data] = base64.split(',');
  const mimeType = (header && header.match(/:(.*?);/)) ? header.match(/:(.*?);/)[1] : 'image/png';
  const bytes = atob(data || base64);
  const arrayBuffer = new ArrayBuffer(bytes.length);
  const view = new Uint8Array(arrayBuffer);
  for (let i = 0; i < bytes.length; i++) {
    view[i] = bytes.charCodeAt(i);
  }
  return new Blob([arrayBuffer], { type: mimeType });
}

function blobToFile(blob, filename) {
  return new File([blob], filename, { type: blob.type });
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

async function loadCfg() {
  try {
    if (!chrome || !chrome.storage) {
      console.log("[WA-Bridge] Chrome storage não disponível");
      return;
    }
    const saved = await chrome.storage.sync.get(DEFAULTS);
    cfg = { ...DEFAULTS, ...saved };
    console.log("[WA-Bridge] Configurações carregadas:", cfg);
  } catch (e) {
    console.error("[WA-Bridge] Erro ao carregar configurações:", e);
  }
}

document.addEventListener("keydown", async (event) => {
  if (event.key === "F8") {
    try {
      if (!chrome || !chrome.storage) return;
      const cur = await chrome.storage.sync.get(DEFAULTS);
      const newState = !cur.enabled;
      await chrome.storage.sync.set({ enabled: newState });
      cfg.enabled = newState;
      console.log(`[WA-Bridge] F8 pressionado: Extensão ${newState ? "LIGADA" : "PAUSADA"}`);
      
      showStatusNotification(newState);
    } catch (e) {
      console.error("[WA-Bridge] Erro ao processar F8:", e);
    }
  }
});

function showStatusNotification(enabled) {
  try {
    if (!document || !document.body || typeof document.createElement !== 'function') {
      console.log("[WA-Bridge] DOM não está disponível para showStatusNotification");
      return;
    }

    let notification = null;
    let style = null;
    
    try {
      notification = document.createElement('div');
      if (!notification || !notification.style) {
        console.log("[WA-Bridge] Elemento de notificação criado mas propriedade style não disponível");
        return;
      }
    } catch (e) {
      console.log("[WA-Bridge] Erro ao criar elemento de notificação de status:", e);
      return;
    }
    
    // Configurar estilos um por um
    const styles = {
      position: 'fixed',
      top: '20px',
      right: '20px',
      background: enabled ? '#25D366' : '#FF3B30',
      color: 'white',
      padding: '12px 20px',
      borderRadius: '8px',
      fontFamily: 'Arial, sans-serif',
      fontWeight: 'bold',
      zIndex: '999999',
      boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
      animation: 'fadeInOut 3s ease-in-out'
    };
    
    for (const key in styles) {
      try {
        notification.style[key] = styles[key];
      } catch (e) {
        console.log(`[WA-Bridge] Erro ao configurar estilo ${key}:`, e);
      }
    }
    
    try {
      if (notification && notification.textContent !== undefined) {
        notification.textContent = `WA-Bridge ${enabled ? 'ATIVADO' : 'PAUSADO'}`;
      }
    } catch (e) {
      console.log("[WA-Bridge] Erro ao configurar texto de status:", e);
    }
    
    try {
      style = document.createElement('style');
      if (style && style.textContent !== undefined) {
        style.textContent = `
          @keyframes fadeInOut {
            0% { opacity: 0; transform: translateY(-20px); }
            15% { opacity: 1; transform: translateY(0); }
            85% { opacity: 1; transform: translateY(0); }
            100% { opacity: 0; transform: translateY(-20px); }
          }
          @keyframes slideInUp {
            0% { opacity: 0; transform: translateY(20px); }
            10% { opacity: 1; transform: translateY(0); }
            90% { opacity: 1; transform: translateY(0); }
            100% { opacity: 0; transform: translateY(-20px); }
          }
        `;
      }
    } catch (e) {
      console.log("[WA-Bridge] Erro ao criar elemento de style:", e);
      style = null;
    }
    
    try {
      if (style && document.head && typeof document.head.appendChild === 'function') {
        document.head.appendChild(style);
      }
    } catch (e) {
      console.log("[WA-Bridge] Erro ao adicionar style ao head:", e);
    }
    
    try {
      if (document.body && typeof document.body.appendChild === 'function') {
        document.body.appendChild(notification);
      }
    } catch (e) {
      console.log("[WA-Bridge] Erro ao adicionar notificação de status ao body:", e);
    }
    
    setTimeout(() => {
      try {
        if (notification && document.contains(notification)) {
          notification.remove();
        }
      } catch (e) {
        console.log("[WA-Bridge] Erro ao remover notificação de status:", e);
      }
      try {
        if (style && document.contains(style)) {
          style.remove();
        }
      } catch (e) {
        console.log("[WA-Bridge] Erro ao remover style:", e);
      }
    }, 3000);
  } catch (e) {
    console.error("[WA-Bridge] Erro geral em showStatusNotification:", e);
  }
}



chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  try {
    if (!chrome || !chrome.runtime) {
      sendResponse({ status: "error", error: "runtime_invalid" });
      return false;
    }

    if (msg.type === "setEnabled") {
      cfg.enabled = !!msg.enabled;
      console.log("[WA-Bridge] setEnabled:", cfg.enabled);
      showStatusNotification(cfg.enabled);
      sendResponse({ status: "ok", enabled: cfg.enabled });
      return true;
    }

    if (msg.type === "setRemoveCents") {
      cfg.removeCents = !!msg.removeCents;
      console.log("[WA-Bridge] removeCents:", cfg.removeCents);
      showCentsNotification(cfg.removeCents);
      sendResponse({ status: "ok", removeCents: cfg.removeCents });
      return true;
    }

    if (msg.type === "focusInput") {
      console.log("[WA-Bridge] focusInput command");
      let inputField = null;

      // Se o DOM já foi invalidado, responde e sai
      if (!document || !document.body) {
        try { sendResponse({ status: "error", error: "dom_invalid" }); } catch (_) {}
        return true;
      }

      // Tentativa 1
      try {
        inputField = document.querySelector('[contenteditable="true"][data-testid="compose-box-input"]');
      } catch (e) {
        console.log("[WA-Bridge] Tentativa 1 falhou", e);
      }

      // Tentativa 2
      if (!inputField) {
        try {
          inputField = document.querySelector('div[contenteditable="true"][role="textbox"]');
        } catch (e) {
          console.log("[WA-Bridge] Tentativa 2 falhou", e);
        }
      }

      // Tentativa 3 (varre editables com laço indexado para evitar iterador lento)
      if (!inputField) {
        let editables = null;
        try {
          editables = document.querySelectorAll('div[contenteditable="true"]');
        } catch (e) {
          console.log("[WA-Bridge] Tentativa 3 falhou ao coletar editables", e);
        }

        if (editables && editables.length) {
          for (let i = 0; i < editables.length; i++) {
            try {
              const div = editables[i];
              if (div && div.clientHeight > 20) {
                inputField = div;
                break;
              }
            } catch (loopErr) {
              console.log("[WA-Bridge] Erro iterando editables:", loopErr);
            }
          }
        }
      }

      // Tentativa 4
      if (!inputField) {
        try {
          const footer = document.querySelector('footer');
          if (footer) {
            inputField = footer.querySelector('div[contenteditable="true"]');
          }
        } catch (e) {
          console.log("[WA-Bridge] Tentativa 4 falhou", e);
        }
      }

      try {
        if (inputField) {
          inputField.focus();
          inputField.click();
          console.log("[WA-Bridge] Input focused");
          try { sendResponse({ status: "focused", attempts: 1 }); } catch (_) {}
        } else {
          console.warn("[WA-Bridge] Input não encontrado");
          try { sendResponse({ status: "not_found", attempts: 4 }); } catch (_) {}
        }
      } catch (err) {
        console.error("[WA-Bridge] Erro ao focar:", err);
        try { sendResponse({ status: "error", error: err?.message || String(err) }); } catch (_) {}
      }
      return true;
    }

    sendResponse({ status: "unhandled" });
    return false;
  } catch (err) {
    console.error("[WA-Bridge] Erro no message listener:", err);
    sendResponse({ status: "error", error: err.message });
    return false;
  }
});

function showCentsNotification(removeCents) {
  try {
    if (!document || !document.body || typeof document.createElement !== 'function') {
      console.log("[WA-Bridge] DOM não está disponível para showCentsNotification");
      return;
    }

    let notification = null;
    
    try {
      notification = document.createElement('div');
      if (!notification || !notification.style) {
        console.log("[WA-Bridge] Elemento criado mas propriedade style não disponível");
        return;
      }
    } catch (e) {
      console.log("[WA-Bridge] Erro ao criar elemento de notificação:", e);
      return;
    }
    
    // Configurar estilos um por um
    const styles = {
      position: 'fixed',
      top: '60px',
      right: '20px',
      background: removeCents ? '#007AFF' : '#8E8E93',
      color: 'white',
      padding: '8px 16px',
      borderRadius: '6px',
      fontFamily: 'Arial, sans-serif',
      fontWeight: 'bold',
      zIndex: '999998',
      boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
      animation: 'fadeInOut 2.5s ease-in-out',
      fontSize: '14px'
    };
    
    for (const key in styles) {
      try {
        notification.style[key] = styles[key];
      } catch (e) {
        console.log(`[WA-Bridge] Erro ao configurar estilo ${key}:`, e);
      }
    }
    
    try {
      if (notification && notification.textContent !== undefined) {
        notification.textContent = `Centavos: ${removeCents ? 'REMOVER' : 'MANTER'}`;
      }
    } catch (e) {
      console.log("[WA-Bridge] Erro ao configurar texto da notificação:", e);
    }
    
    try {
      if (document.body && typeof document.body.appendChild === 'function') {
        document.body.appendChild(notification);
      }
    } catch (e) {
      console.log("[WA-Bridge] Erro ao adicionar notificação ao DOM:", e);
    }
    
    setTimeout(() => {
      try {
        if (notification && document.contains(notification)) {
          notification.remove();
        }
      } catch (e) {
        console.log("[WA-Bridge] Erro ao remover notificação:", e);
      }
    }, 2500);
  } catch (e) {
    console.error("[WA-Bridge] Erro geral em showCentsNotification:", e);
  }
}

function findQuotedText() {
  try {
    let footer = null;
    try {
      footer = document.querySelector("footer");
    } catch (e) {
      return "";
    }

    if (!footer) {
      return "";
    }

    let quotedContainer = null;
    try {
      quotedContainer = footer.querySelector('[class*="quoted"], [class*="quote"], [data-testid*="quoted"]');
    } catch (e) {
      return "";
    }

    if (!quotedContainer) {
      return "";
    }

    let quotedMention = null;
    try {
      quotedMention = footer.querySelector("span[class*='quoted-mention']");
    } catch (e) {
      return "";
    }

    if (quotedMention) {
      try {
        const text = quotedMention.innerText || "";
        const trimmed = text.trim();
        if (trimmed && trimmed !== "Você" && trimmed.length > 2) {
          console.log("[WA-Bridge] Texto encontrado (quoted-mention):", trimmed);
          return trimmed;
        }
      } catch (e) {
        console.log("[WA-Bridge] Erro ao ler quoted-mention");
      }
    }

    let genericSpan = null;
    try {
      genericSpan = footer.querySelector("span[dir='auto']");
    } catch (e) {
      return "";
    }

    if (genericSpan) {
      try {
        const text = genericSpan.innerText || "";
        const trimmed = text.trim();
        if (trimmed && trimmed.length > 2) {
          console.log("[WA-Bridge] Texto encontrado (span):", trimmed);
          return trimmed;
        }
      } catch (e) {
        console.log("[WA-Bridge] Erro ao ler span");
      }
    }

    try {
      const containers = quotedContainer.querySelectorAll("[dir='auto'], span, div");
      for (const container of containers) {
        try {
          const text = container.innerText || "";
          const trimmed = text.trim();
          if (trimmed && trimmed.length > 2 && trimmed !== "Você") {
            console.log("[WA-Bridge] Texto encontrado (container):", trimmed);
            return trimmed;
          }
        } catch (e) {
          continue;
        }
      }
    } catch (e) {
      console.log("[WA-Bridge] Erro ao processar containers");
    }

    return "";
  } catch (e) {
    console.error("[WA-Bridge] Erro em findQuotedText:", e);
    return "";
  }
}

async function send(text) {
  try {
    if (!chrome || !chrome.storage) {
      console.log("[WA-Bridge] Contexto invalidado");
      return;
    }

    let currentCfg = { ...DEFAULTS };
    try {
      const saved = await chrome.storage.sync.get(DEFAULTS);
      currentCfg = { ...DEFAULTS, ...saved };
      cfg = currentCfg;
    } catch (storageErr) {
      console.log("[WA-Bridge] Erro ao ler storage");
      return;
    }

    if (!cfg.enabled) {
      return;
    }

    console.log("[WA-Bridge] === ENVIANDO ===");
    console.log("[WA-Bridge] Texto:", text);

    const now = Date.now();
    if (now - lastSentAt < cfg.minIntervalMs) {
      console.log("[WA-Bridge] Throttling ativo");
      return;
    }
    lastSentAt = now;

    // Retrieve token, uid, key from storage (with Promise wrapper for compatibility)
    // Prioriza dados detectados automaticamente (casino_*) se existirem
    let token = '';
    let uid = '';
    let key = '';
    let casinoUrl = '';
    let cookies = '';
    try {
      const storage = await new Promise((resolve) => {
        chrome.storage.local.get([
          'icecassino_token', 
          'icecassino_uid', 
          'icecassino_key',
          'casino_token',
          'casino_uid', 
          'casino_key',
          'casino_url',
          'casino_cookies'
        ], resolve);
      });
      
      // Usa dados detectados se existirem, senão usa Ice Casino
      token = storage.casino_token || storage.icecassino_token || '';
      uid = storage.casino_uid || storage.icecassino_uid || localStorage.getItem('icecassino_uid') || '';
      key = storage.casino_key || storage.icecassino_key || localStorage.getItem('icecassino_key') || '';
      casinoUrl = storage.casino_url || 'https://d1yoh197nyhh3m.bzcfgm.com/api/v1/user/recharge';
      
      // IMPORTANTE: Cookies não podem ser acessados diretamente de content scripts
      // Solução: Tentar obter de múltiplas fontes com fallback
      cookies = storage.casino_cookies || '';
      
      // Se ainda não há cookies, tentar um método alternativo
      // (Este é um fallback limitado, pois content scripts não têm acesso real a cookies)
      if (!cookies) {
        // Tentar obter do header Set-Cookie se disponível em localStorage
        cookies = localStorage.getItem('captured_cookies') || '';
      }
      
      console.log("[WA-Bridge] 🎰 Cassino URL:", casinoUrl);
      console.log("[WA-Bridge] Token recuperado:", token ? token.substring(0, 10) + '...' : 'VAZIO');
      console.log("[WA-Bridge] UID recuperado:", uid || 'VAZIO');
      console.log("[WA-Bridge] Key recuperada:", key ? key.substring(0, 5) + '...' : 'VAZIO');
      console.log("[WA-Bridge] 🍪 Cookies:", cookies ? cookies.substring(0, 30) + '...' : '⚠️ NÃO DISPONÍVEL (use background script)');
    } catch (e) {
      console.error("[WA-Bridge] Erro ao recuperar dados:", e);
    }

    // Convert text to centavos: "234,76" -> 23476
    let amount = 0;
    if (text) {
      const textStr = String(text).replace(/\s/g, '').trim();
      const amountMatch = textStr.match(/(\d+)[.,]?(\d{0,2})/);
      if (amountMatch) {
        const intPart = parseInt(amountMatch[1]) || 0;
        const decPart = parseInt((amountMatch[2] || '0').padEnd(2, '0'));
        amount = intPart * 100 + decPart;
      }
    }

    const payload = {
      acao: "recarga",
      text: String(text || ""),
      token: token,
      uid: uid,
      key: key,
      amount: amount,
      casinoUrl: casinoUrl,
      cookies: cookies,
      removeCents: !!cfg.removeCents,
      timestamp: new Date().toISOString()
    };

    console.log("[WA-Bridge] Enviando payload:", payload);

    try {
      const res = await fetch(cfg.endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Local-Secret": cfg.localSecret || ""
        },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const body = await res.text().catch(() => "");
        console.error("[WA-Bridge] Erro servidor:", res.status, body);
        showErrorNotification(`Erro ${res.status}`);
        return;
      }

      const result = await res.json();
      console.log("[WA-Bridge] Sucesso:", result.job_id);
      showSuccessNotification(result.processed_text || text);
    } catch (err) {
      console.error("[WA-Bridge] Erro conexão:", err);
      showErrorNotification("Erro conexão");
    }
  } catch (err) {
    console.error("[WA-Bridge] Erro send:", err);
  }
}

function showSuccessNotification(processedText) {
  try {
    if (!document || !document.body || typeof document.createElement !== 'function') {
      console.log("[WA-Bridge] DOM não está disponível para showSuccessNotification");
      return;
    }

    let notification = null;
    
    try {
      notification = document.createElement('div');
      if (!notification || !notification.style) {
        console.log("[WA-Bridge] Elemento criado mas propriedade style não disponível");
        return;
      }
    } catch (e) {
      console.log("[WA-Bridge] Erro ao criar elemento de sucesso:", e);
      return;
    }
    
    const styles = {
      position: 'fixed',
      bottom: '20px',
      right: '20px',
      background: '#25D366',
      color: 'white',
      padding: '10px 15px',
      borderRadius: '6px',
      fontFamily: 'Arial, sans-serif',
      fontWeight: 'bold',
      zIndex: '999997',
      boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
      animation: 'slideInUp 2s ease-in-out',
      fontSize: '13px',
      maxWidth: '300px',
      wordBreak: 'break-all'
    };
    
    for (const key in styles) {
      try {
        notification.style[key] = styles[key];
      } catch (e) {
        console.log(`[WA-Bridge] Erro ao configurar estilo ${key}:`, e);
      }
    }
    
    try {
      if (notification && notification.textContent !== undefined) {
        notification.textContent = `✓ Enviado: ${processedText}`;
      }
    } catch (e) {
      console.log("[WA-Bridge] Erro ao configurar texto de sucesso:", e);
    }
    
    try {
      if (document.body && typeof document.body.appendChild === 'function') {
        document.body.appendChild(notification);
      }
    } catch (e) {
      console.log("[WA-Bridge] Erro ao adicionar notificação de sucesso:", e);
    }
    
    setTimeout(() => {
      try {
        if (notification && document.contains(notification)) {
          notification.remove();
        }
      } catch (e) {
        console.log("[WA-Bridge] Erro ao remover notificação de sucesso:", e);
      }
    }, 2000);
  } catch (e) {
    console.error("[WA-Bridge] Erro geral em showSuccessNotification:", e);
  }
}

function showErrorNotification(message) {
  try {
    if (!document || !document.body || typeof document.createElement !== 'function') {
      console.log("[WA-Bridge] DOM não está disponível para showErrorNotification");
      return;
    }

    let notification = null;
    
    try {
      notification = document.createElement('div');
      if (!notification || !notification.style) {
        console.log("[WA-Bridge] Elemento de erro criado mas propriedade style não disponível");
        return;
      }
    } catch (e) {
      console.log("[WA-Bridge] Erro ao criar elemento de erro:", e);
      return;
    }
    
    const styles = {
      position: 'fixed',
      bottom: '20px',
      left: '20px',
      background: '#FF3B30',
      color: 'white',
      padding: '10px 15px',
      borderRadius: '6px',
      fontFamily: 'Arial, sans-serif',
      fontWeight: 'bold',
      zIndex: '999997',
      boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
      animation: 'slideInUp 3s ease-in-out',
      fontSize: '13px'
    };
    
    for (const key in styles) {
      try {
        notification.style[key] = styles[key];
      } catch (e) {
        console.log(`[WA-Bridge] Erro ao configurar estilo de erro ${key}:`, e);
      }
    }
    
    try {
      if (notification && notification.textContent !== undefined) {
        notification.textContent = `✗ ${message}`;
      }
    } catch (e) {
      console.log("[WA-Bridge] Erro ao configurar texto de erro:", e);
    }
    
    try {
      if (document.body && typeof document.body.appendChild === 'function') {
        document.body.appendChild(notification);
      }
    } catch (e) {
      console.log("[WA-Bridge] Erro ao adicionar notificação de erro:", e);
    }
    
    setTimeout(() => {
      try {
        if (notification && document.contains(notification)) {
          notification.remove();
        }
      } catch (e) {
        console.log("[WA-Bridge] Erro ao remover notificação de erro:", e);
      }
    }, 3000);
  } catch (e) {
    console.error("[WA-Bridge] Erro geral em showErrorNotification:", e);
  }
}

function scan() {
  try {
    if (!cfg.enabled) {
      return;
    }

    const t = findQuotedText();

    if (!t || t.length < 3) {
      if (lastText !== "") {
        console.log("[WA-Bridge] Citação removida");
        lastText = "";
      }
      lastQuoteTimestamp = 0;
      return;
    }

    if (t.length > 100) {
      return;
    }

    const now = Date.now();
    const isNewQuote = (t !== lastText) || (now - lastQuoteTimestamp > 2000);

    if (!isNewQuote) {
      return;
    }

    lastText = t;
    lastQuoteTimestamp = now;

    console.log("[WA-Bridge] Nova citação:", t);

    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      if (chrome && chrome.storage) {
        send(t).catch((err) => {
          if (err && err.toString && err.toString().includes('context')) {
            console.log("[WA-Bridge] Contexto invalidado");
          } else {
            console.error("[WA-Bridge] Erro send:", err);
          }
        });
      }
    }, cfg.debounceMs);
  } catch (e) {
    console.error("[WA-Bridge] Erro scan:", e);
  }
}

function restartObserver() {
  try {
    if (footerObserver) {
      footerObserver.disconnect();
      footerObserver = null;
    }

    let footer = null;
    try {
      footer = document.querySelector("footer");
    } catch (e) {
      console.log("[WA-Bridge] Erro ao buscar footer");
      lastFooterId = null;
      return;
    }

    if (!footer) {
      console.log("[WA-Bridge] Footer não encontrado");
      lastFooterId = null;
      return;
    }

    lastFooterId = footer.uniqueID || Math.random().toString();

    footerObserver = new MutationObserver(() => {
      scan();
    });

    footerObserver.observe(footer, {
      childList: true,
      subtree: true,
      characterData: false,
      attributes: false,
      attributeOldValue: false,
      characterDataOldValue: false
    });

    // console.log("[WA-Bridge] Observer ativo");
  } catch (e) {
    console.error("[WA-Bridge] Erro restartObserver:", e);
  }
}

chrome.storage.onChanged.addListener((changes) => {
  try {
    console.log("[WA-Bridge] Storage alterado");

    for (const [k, v] of Object.entries(changes || {})) {
      cfg[k] = v.newValue;
    }

    if (Object.prototype.hasOwnProperty.call(changes, "removeCents")) {
      console.log("[WA-Bridge] removeCents:", cfg.removeCents);
      showCentsNotification(cfg.removeCents);
    }

    if (changes.enabled) {
      console.log("[WA-Bridge] enabled:", cfg.enabled);
      showStatusNotification(cfg.enabled);

      if (cfg.enabled) {
        console.log("[WA-Bridge] Ativando observer");
        restartObserver();
      } else {
        console.log("[WA-Bridge] Desativando observer");
        if (footerObserver) {
          footerObserver.disconnect();
          footerObserver = null;
        }
        lastText = "";
        lastQuoteTimestamp = 0;
      }
    }

    if (changes.endpoint) {
      console.log("[WA-Bridge] Endpoint:", cfg.endpoint);
    }
  } catch (e) {
    console.error("[WA-Bridge] Erro storage listener:", e);
  }
});

loadCfg().then(() => {
  console.log("[WA-Bridge] Inicialização completa");
  if (cfg.pixMode === 'image') {
    console.log("[WA-Bridge] Carregando jsQR para decodificação de QR...");
    // Carregar jsQR assincronamente
    loadJsQR().then(() => {
      if (window.jsQR) {
        console.log("[WA-Bridge] jsQR carregado com sucesso");
      } else {
        console.log("[WA-Bridge] jsQR não disponível (modo texto apenas)");
      }
    });
  } else {
    console.log("[WA-Bridge] jsQR ignorado (pixMode=texto)");
  }

  try {
    document.addEventListener('dblclick', handleDoubleClick);
  } catch (e) {
    console.log("[WA-Bridge] Erro ao registrar dblclick:", e);
  }

  if (cfg.enabled) {
    console.log("[WA-Bridge] Iniciando observer");

    setTimeout(() => {
      restartObserver();
    }, 500);

    setInterval(() => {
      try {
        if (!cfg.enabled) {
          return;
        }

        let currentFooter = null;
        try {
          currentFooter = document.querySelector("footer");
        } catch (e) {
          return;
        }

        if (!currentFooter && footerObserver) {
          console.log("[WA-Bridge] Footer removido");
          footerObserver.disconnect();
          footerObserver = null;
          lastFooterId = null;
          return;
        }

        if (!currentFooter) {
          console.log("[WA-Bridge] Footer não encontrado, reiniciando");
          restartObserver();
          return;
        }

        const currentId = currentFooter.uniqueID || Math.random().toString();
        if (!footerObserver || lastFooterId !== currentId) {
          // console.log("[WA-Bridge] Footer mudou, reiniciando");
          restartObserver();
        }
      } catch (e) {
        console.log("[WA-Bridge] Erro verificação footer:", e);
      }
    }, 800);

    setTimeout(() => {
      scan();
    }, 1000);
  } else {
    console.log("[WA-Bridge] Desabilitado no carregamento");
  }
});

const styleEl = document.createElement('style');
styleEl.textContent = `
  @keyframes fadeInOut {
    0% { opacity: 0; transform: translateY(-20px); }
    15% { opacity: 1; transform: translateY(0); }
    85% { opacity: 1; transform: translateY(0); }
    100% { opacity: 0; transform: translateY(-20px); }
  }
  
  @keyframes slideInUp {
    0% { opacity: 0; transform: translateY(20px); }
    15% { opacity: 1; transform: translateY(0); }
    85% { opacity: 1; transform: translateY(0); }
    100% { opacity: 0; transform: translateY(20px); }
  }
`;
document.head.appendChild(styleEl);
