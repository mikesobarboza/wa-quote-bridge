# 🧪 Guia de Teste: Correção do "Error Sign"

## ✅ Mudanças Aplicadas

### Correções no `icecassino_api.py`:

1. **`type` alterado de "0" para "1"** ✅
2. **Parâmetro `gear` adicionado** ✅ (valor: "2")
3. **Parâmetro `_t` (timestamp) adicionado** ✅
4. **Algoritmo `calculate_sign` simplificado** ✅
   - Agora usa apenas: `params + secret` → MD5
   - Sem mais testes de múltiplas estratégias
5. **Logging detalhado adicionado** ✅
   - Mostra todos os parâmetros
   - Mostra a query string para MD5
   - Mostra o hash calculado

---

## 🚀 Passos para Testar

### Passo 1: Verificar Servidor
```powershell
# Abra um terminal PowerShell

# Parar qualquer processo python anterior
taskkill /F /IM python.exe 2>nul; Start-Sleep -Seconds 2

# Navegar até o diretório
cd "C:\Users\UP DOWN\Desktop\QR_MK_pro"

# Iniciar o servidor
python bridge_server.py
```

Você deveria ver:
```
🚀 SERVIDOR BRIDGE - VERSÃO 4.0
🌐 URL: http://127.0.0.1:8788
```

### Passo 2: Recarregar Extensão
1. Abra `chrome://extensions/`
2. Procure por "QR MK"
3. Clique no botão **Reload** (ícone de circular)

Você deveria ver nas abas:
```
[ICE] ✅ Sistema de captura ativo!
```

### Passo 3: Testar PIX
1. Acesse a aba do Ice Casino no navegador
2. Clique em "Fazer Recarga" (ou PIX)
3. Insira um valor (ex: 100.00)
4. Confirme a operação

### Passo 4: Verificar Logs

**No terminal do servidor, você verá:**

```
[BRIDGE] 🎯 Iniciando recarga - UID: 987535473, Amount: 245698.0
[BRIDGE] Amount final: 245698 centavos
[BRIDGE] 🔧 Parâmetros finais para assinatura:
[BRIDGE]   - _t: 1707032700123
[BRIDGE]   - amount: 245698
[BRIDGE]   - gear: 2
[BRIDGE]   - key: WVvWGWWZMgRwdTCTUSrH
[BRIDGE]   - pay_method: cartbank
[BRIDGE]   - pid: 0
[BRIDGE]   - return_url: https://th.betbuzz.cc/PayBack/
[BRIDGE]   - type: 1                    ✅ AGORA É 1!
[BRIDGE]   - uid: 987535473
[BRIDGE] 🔐 Query para MD5: amount=245698&gear=2&key=WVvWGWWZMgRwdTCTUSrH&pay_method=cartbank&pid=0&return_url=https://th.betbuzz.cc/PayBack/&secret=8uhIUHIH323*&8&type=1&uid=987535473&_t=1707032700123
[BRIDGE] ✅ Sign MD5 calculado: [NOVO_HASH]
[BRIDGE] ✅ Payload com sign calculado!
[BRIDGE] 🌐 URL destino: https://d1yoh197nyhh3m.bzcfgm.com/api/v1/user/recharge
[BRIDGE] 📋 Headers da requisição:
[BRIDGE]   - token: 296b2f4157a0cc6af...
[BRIDGE]   - key: WVvWGWWZMgRwdTCTUS...
[BRIDGE] 📦 Body completo da requisição:
[BRIDGE]   - amount: 245698
[BRIDGE]   - gear: 2
[BRIDGE]   - key: WVvWGWWZMgRwdTCTUSrH
[BRIDGE]   - pay_method: cartbank
[BRIDGE]   - pid: 0
[BRIDGE]   - return_url: [URL encoding]
[BRIDGE]   - type: 1                    ✅ AGORA É 1!
[BRIDGE]   - uid: 987535473
[BRIDGE]   - _t: 1707032700123          ✅ NOVO!
[BRIDGE]   - sign: [NOVO_HASH]
[BRIDGE] ✅ Status: 200
[BRIDGE] 📥 Response: {"status":1,"message":"success",...}   ✅ SUCESSO!
```

---

## 📊 Verificação de Correção

### ✅ Se funcionou:
```json
{
  "status": 1,
  "message": "success",
  "data": { ... }
}
```

**Próximo passo:** PIX será gerado ✅

### ❌ Se ainda der "error sign":
```json
{
  "status": 0,
  "message": "error sign",
  "data": []
}
```

**Possíveis razões:**

1. **Secret key está diferente**
   - A API pode estar usando um secret que não é `8uhIUHIH323*&8`
   - Procure capturar do localStorage durante o login real

2. **Há um parâmetro adicional ou diferentes valores**
   - Abra DevTools no Ice Casino
   - Network tab → capture uma recarga funcionando
   - Compare com o que está sendo enviado

3. **Cookies ainda são necessários**
   - Se ainda disser "SEM cookies", temos que melhorar a captura
   - Os cookies podem estar perdendo entre requisições

---

## 🔍 Como Coletar Logs Detalhados

Se o teste falhar, colha estes dados:

### 1. Logs do Servidor
```
[BRIDGE] 🔐 Query para MD5: [COPIE ESTA LINHA]
[BRIDGE] ✅ Sign MD5 calculado: [COPIE ESTA LINHA]
[BRIDGE] 📥 Response: [COPIE ESTA LINHA]
```

### 2. Verificar DevTools do Navegador
1. Abra F12 no Ice Casino
2. Network tab
3. Procure por `POST /api/v1/user/recharge`
4. Copie:
   - Headers (especialmente `token` e `key`)
   - Request Payload (especialmente o `type` e `sign`)
   - Response

### 3. Comparar Hashes
Use Node.js para verificar:

```javascript
const crypto = require('crypto');

function md5(str) {
    return crypto.createHash("md5").update(str, "utf8").digest("hex");
}

// Query string que o servidor mostrou
const queryString = "amount=245698&gear=2&key=WVvWGWWZMgRwdTCTUSrH&pay_method=cartbank&pid=0&return_url=https://th.betbuzz.cc/PayBack/&secret=8uhIUHIH323*&8&type=1&uid=987535473&_t=1707032700123";

const hashCalculado = md5(queryString);

console.log('Hash calculado:', hashCalculado);
console.log('Hash do servidor:', '[COPIE DO LOG]');
console.log('Match:', hashCalculado === '[HASH DO SERVIDOR]' ? '✅' : '❌');
```

---

## 🎯 Checklist Pré-Teste

- [ ] Servidor parado e reiniciado
- [ ] Extensão recarregada
- [ ] Credenciais de login confirmadas no Ice Casino
- [ ] Terminal com logs visível

---

## 📞 Se Tudo Falhar

Se após testar ainda receber "error sign", será necessário:

1. **Executar PASSO 1 do DESCOBRIR_ALGORITMO_SIGN.md**
   - Capturar uma requisição FUNCIONANDO do navegador
   - Registrar o tipo EXATO de assinatura usada
   - Comparar com o que estamos calculando

2. **Possível alternativa:**
   - A API pode estar usando uma assinatura diferente
   - Pode haver um secret key específico por usuário
   - Pode haver parâmetros adicionais que não conhecemos

---

## 📝 Resultado Esperado Após Correção

**Antes (❌):**
```
[BRIDGE] Amount final: 245698 centavos
[BRIDGE] Testando: amount=245698&key=...&type=0...
[BRIDGE] ✅ Sign selecionado: 5c54d549e2d3ddcdc8bbdd8bf55367b2
[BRIDGE] 📥 Response: {"status":0,"message":"error sign","data":[]}
```

**Depois (✅):**
```
[BRIDGE] Amount final: 245698 centavos
[BRIDGE] Parâmetros finais para assinatura:
[BRIDGE]   - _t: 1707032700123
[BRIDGE]   - amount: 245698
[BRIDGE]   - gear: 2
[BRIDGE]   - type: 1
[BRIDGE] 🔐 Query para MD5: amount=245698&gear=2&...&type=1&_t=1707032700123...
[BRIDGE] ✅ Sign MD5 calculado: [NOVO_HASH_CORRETO]
[BRIDGE] 📥 Response: {"status":1,"message":"success",...}
```

---

**Data:** 2026-02-03  
**Modificações:** icecassino_api.py (funções `calculate_sign` e `icecassino_recharge`)
