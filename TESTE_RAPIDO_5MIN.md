# ⚡ TESTE RÁPIDO: 5 Minutos

## 🎯 Objetivo
Verificar se o "error sign" foi corrigido

## ✅ Checklist Pré-Teste

- [ ] Terminal PowerShell aberto
- [ ] Leia o arquivo `RESUMO_CORRECAO.md` (2 min)
- [ ] Sabe o caminho: `C:\Users\UP DOWN\Desktop\QR_MK_pro`

---

## 🚀 Executar Teste (5 minutos)

### Minuto 1-2: Parar e reiniciar servidor

```powershell
# No terminal PowerShell:

# 1. Parar qualquer Python anterior
taskkill /F /IM python.exe 2>nul; Start-Sleep -Seconds 2

# 2. Navegar até o diretório
cd "C:\Users\UP DOWN\Desktop\QR_MK_pro"

# 3. Iniciar servidor
python bridge_server.py
```

**Você deveria ver:**
```
🚀 SERVIDOR BRIDGE - VERSÃO 4.0
🌐 URL: http://127.0.0.1:8788
```

### Minuto 2-3: Recarregar Extensão

1. Chrome: `chrome://extensions/`
2. Procure por "QR MK"
3. Clique **Reload** (botão circular)

**Deixe este terminal rodando!**

### Minuto 3-5: Testar PIX

1. Ice Casino aba no Chrome
2. Clique "Recarga" ou botão de PIX
3. Digite valor: `100.00`
4. Clique Confirmar/Submit

### Minuto 5+: Verificar Resultado

**No terminal do servidor, procure por:**

```
✅ INDICADOR DE SUCESSO:
[BRIDGE] 📥 Response: {"status":1,"message":"success"...}
```

OU

```
❌ INDICADOR DE FALHA:
[BRIDGE] 📥 Response: {"status":0,"message":"error sign"...}
```

---

## 📊 Resultado Possível

### ✅ SUCESSO (esperado)
```
[BRIDGE] 🎯 Iniciando recarga - UID: 987535473, Amount: 100.00
[BRIDGE] 🔧 Parâmetros finais para assinatura:
[BRIDGE]   - _t: 1707032700123
[BRIDGE]   - amount: 10000              ← em centavos
[BRIDGE]   - gear: 2
[BRIDGE]   - key: WVvWGWWZMgRwdTCTUSrH
[BRIDGE]   - pay_method: cartbank
[BRIDGE]   - pid: 0
[BRIDGE]   - return_url: https://th.betbuzz.cc/PayBack/
[BRIDGE]   - type: 1                    ← AGORA É 1!
[BRIDGE]   - uid: 987535473
[BRIDGE] 🔐 Query para MD5: amount=10000&gear=2&key=WVvWGWWZMgRwdTCTUSrH&pay_method=cartbank&pid=0&return_url=https://th.betbuzz.cc/PayBack/&secret=8uhIUHIH323*&8&type=1&uid=987535473&_t=1707032700123
[BRIDGE] ✅ Sign MD5 calculado: 1a2b3c4d5e6f7g8h9i0j1k2l3m4n5o6p
[BRIDGE] ✅ Payload com sign calculado!
[BRIDGE] 🌐 URL destino: https://d1yoh197nyhh3m.bzcfgm.com/api/v1/user/recharge
[BRIDGE] 📋 Headers da requisição:
[BRIDGE]   - token: 296b2f4157a0cc6af...
[BRIDGE]   - key: WVvWGWWZMgRwdTCTUS...
[BRIDGE] 📦 Body completo da requisição:
[BRIDGE]   - amount: 10000
[BRIDGE]   - gear: 2
[BRIDGE]   - key: WVvWGWWZMgRwdTCTUSrH
[BRIDGE]   - pay_method: cartbank
[BRIDGE]   - pid: 0
[BRIDGE]   - return_url: [URL encoding]
[BRIDGE]   - type: 1                    ← CONFIRMADO: 1
[BRIDGE]   - uid: 987535473
[BRIDGE]   - _t: 1707032700123
[BRIDGE]   - sign: 1a2b3c4d5e6f7g8h9i0j1k2l3m4n5o6p
[BRIDGE] ✅ Status: 200
[BRIDGE] 📥 Response: {"status":1,"message":"success","data":{...}}  ✅ SUCESSO!
```

**Próximo passo:** PIX será gerado em 2-5 segundos

### ❌ FALHA (inesperada)
```
[BRIDGE] 📥 Response: {"status":0,"message":"error sign","data":[]}
```

**Se isto acontecer:**
1. Copie toda a sequência de logs acima
2. Compartilhe comigo
3. Vamos fazer engenharia reversa do algoritmo correto

---

## 🎯 Dados Para Compartilhar Se Falhar

Se o teste falhar, copie:

1. **Logs do terminal**
   ```
   [BRIDGE] 🔐 Query para MD5: [COPIE]
   [BRIDGE] ✅ Sign MD5 calculado: [COPIE]
   [BRIDGE] 📥 Response: [COPIE]
   ```

2. **DevTools do navegador** (F12 no Ice Casino)
   - Network → POST /api/v1/user/recharge
   - Request Headers
   - Request Payload
   - Response

3. **Informações do seu usuário**
   - uid: [COPIE]
   - key: [COPIE] (primeiros 20 chars)

---

## ⚠️ Antes de Testar

**Certifique-se de:**
- [ ] Extensão está **habilitada** (não desabilitada)
- [ ] Está logado no Ice Casino
- [ ] Internet está funcionando
- [ ] Servidor backend está rodando (viu "SERVIDOR BRIDGE")

---

## 📞 Próximas Etapas

**Se ✅ funcionar:**
- Token + assinatura agora corretos
- PIX será gerado
- Sistema funcionará normalmente

**Se ❌ não funcionar:**
- Vamos coletar mais dados
- Fazer engenharia reversa do algoritmo exato
- Atualizar o código com a descoberta

---

**Duração esperada:** 5 minutos  
**Complexidade:** Nenhuma (apenas rodar e observar)  
**Risco:** Nenhum (sem modificação de dados)
