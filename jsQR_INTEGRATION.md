# jsQR Integration - Resumo de Alterações

## ✅ Funcionalidades Adicionadas

### 1. **Carregamento de jsQR**
- Biblioteca jsQR (v1.4.0 minificada) adicionada em [QR MK/jsQR.js](QR%20MK/jsQR.js)
- Auto-carregamento assincronamente durante inicialização
- Suporta decodificação de QR codes de imagens em Base64

### 2. **Modo PIX Configurável**
- Novo campo `pixMode` em configurações (padrão: `'text'`)
- Opções:
  - `'text'`: Envia PIX como texto (padrão, sempre funciona)
  - `'image'`: Envia PIX como imagem QR code visual (requer jsQR + encoder)

### 3. **UI de Configuração Atualizada**
- [QR MK/options.html](QR%20MK/options.html): Novo selector para modo PIX
- [QR MK/options.js](QR%20MK/options.js): Persistência de `pixMode` em chrome.storage.sync

### 4. **Fluxo de Geração PIX Melhorado**
- [QR MK/content.js](QR%20MK/content.js) agora suporta:
  - Função `generateQrCodeImage(pixCode)`: Gera imagem QR
  - Função `pasteImageToWhatsApp(imageBase64)`: Cola imagem no WhatsApp
  - Função `decodeQrCodeFromBase64(base64)`: Decodifica QR de imagem
  - Detecção automática do modo configurado em `executePixGeneration()`

### 5. **Manifest Atualizado**
- [QR MK/manifest.json](QR%20MK/manifest.json):
  - Adicionado `web_accessible_resources` para jsQR.js e QrCodeEncoder.js
  - Permite acesso à biblioteca do content script

## 📁 Arquivos Modificados

| Arquivo | Alteração | Status |
|---------|-----------|--------|
| [QR MK/jsQR.js](QR%20MK/jsQR.js) | ✨ Novo arquivo | Criado |
| [QR MK/QrCodeEncoder.js](QR%20MK/QrCodeEncoder.js) | ✨ Novo arquivo | Criado (placeholder) |
| [QR MK/content.js](QR%20MK/content.js) | +30 linhas | Modificado |
| [QR MK/manifest.json](QR%20MK/manifest.json) | +5 linhas | Modificado |
| [QR MK/options.html](QR%20MK/options.html) | +5 linhas | Modificado |
| [QR MK/options.js](QR%20MK/options.js) | +5 linhas | Modificado |

## 🔧 Funcionalidades Detalhadas

### loadJsQR()
```javascript
// Carrega jsQR assincronamente
window.addEventListener('jsqr-loaded', () => {
  console.log('jsQR está disponível');
  // Pode usar window.jsQR agora
});
```

### generateQrCodeImage(pixCode)
- **Entrada**: String PIX (ex: "000201...")
- **Saída**: Base64 da imagem QR ou `null`
- **Nota**: Requer biblioteca de codificação QR adicional (qrcode.js ou similar)

### executePixGeneration() - Fluxo Atualizado
```
1. Gera PIX via backend (Ice Casino)
2. Se cfg.pixMode === 'image' E window.jsQR disponível:
   → Tenta gerar imagem QR
   → Coa imagem no WhatsApp
3. Senão (modo texto ou fallback):
   → Insere PIX como texto
4. Clica enviar
5. Mostra notificação de sucesso
```

## ⚙️ Configuração

### No popup.html (Extensão):
```javascript
cfg = {
  pixMode: 'text' // ou 'image'
  // ... outras configs
}
```

### Para alternar modos:
1. Abrir **Opções** da extensão
2. Selecionar modo PIX desejado
3. Clicar **Salvar**

## 🚀 Como Usar

### Modo Texto (Padrão)
```
1. Double-click em "R$ 150,00" no WhatsApp
2. PIX code "000201..." é inserido
3. Mensagem é enviada automaticamente
```

### Modo Imagem (Futuro)
```
1. Double-click em "R$ 150,00" no WhatsApp
2. QR code visual é gerado
3. Imagem é colada no WhatsApp
4. Mensagem é enviada automaticamente
```

## ⚠️ Limitações Atuais

1. **Modo imagem**: Requires biblioteca `QRCode` para **encodificar** (não decodificar)
   - jsQR apenas **decodifica** QR de imagens
   - Para gerar QR visual, necessário qrcode.js, qrcode-generator, ou similar
   - Por enquanto, `generateQrCodeImage()` retorna `null` (modo texto funciona)

2. **QrCodeEncoder.js**: Arquivo placeholder
   - Será preenchido quando biblioteca de codificação QR for adicionada

## ✅ Validação

- ✅ Sintaxe: Todos os arquivos passaram validação
- ✅ Carregamento: jsQR carrega sem erros
- ✅ Retrocompatibilidade: Modo texto sempre funciona
- ✅ Configuração: Opções salvas em chrome.storage.sync

## 📝 Próximos Passos (Opcional)

1. Adicionar biblioteca qrcode-generator:
   ```bash
   npm install qrcode-generator
   ```

2. Atualizar `generateQrCodeImage()` para usar qrcode-generator

3. Atualizar `QrCodeEncoder.js` com implementação real

4. Testar modo imagem em WhatsApp real

## 🔍 Verificação Rápida

Execute no console do content script:
```javascript
// Verificar jsQR
console.log(window.jsQR ? '✅ jsQR carregado' : '❌ jsQR não disponível');

// Verificar configuração
chrome.storage.sync.get('pixMode', (r) => console.log('pixMode:', r.pixMode));

// Testar decodificação
if (window.jsQR) {
  const test = "data:image/png;base64,iVBORw0KGgo...";
  window.decodeQrCodeFromBase64(test).then(r => console.log('QR decoded:', r));
}
```
