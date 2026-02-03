# 🔍 GUIA DE DEPURAÇÃO - O QUE ESTÁ SENDO ENVIADO PARA A API

## Ativação do Debug

1. **Recarregue a extensão** em `chrome://extensions/`
2. Abra o console das ferramentas de desenvolvedor da página (`F12`)
3. Faça uma recarga automática OU manual
4. Os logs aparecerão no console

## O QUE PROCURAR NOS LOGS

### 1️⃣ CÁLCULO DO SIGN
```
[RECHARGE] 🔍 DEPURAÇÃO DETALHADA DE SIGN:
  - signAlgo (algoritmo): sorted_raw_signkey
  - signSecret (nome do secret): sign_key
  - signSecretValue (valor do secret): [valor da chave secreta]
  - secretValue (resultado de getSecretValue): [valor processado]
  - bodyStr (string para MD5): uid=987535473&key=gsVuyPJt7DBJNbZGNXpP&...
  - sign (hash MD5 final): 1c758bd739a523846bc24608fef77609
```

**O que verificar:**
- `signAlgo`: Deve ser `sorted_raw_signkey` (não deve estar vazio ou null)
- `signSecret`: Deve ser `sign_key` 
- `secretValue`: NÃO deve estar vazio (é usado para modificar o input antes do MD5)
- `bodyStr`: String que será convertida em MD5

### 2️⃣ PAYLOAD COMPLETO
```
[RECHARGE] 📋 PAYLOAD COMPLETO PARA ENVIO:
┌─────────────────┬──────────────────────────────────┐
│ (index)         │ Values                           │
├─────────────────┼──────────────────────────────────┤
│ uid             │ '987535473'                      │
│ key             │ 'gsVuyPJt7DBJNbZGNXpP'           │
│ amount          │ '12200'                          │
│ pid             │ '0'                              │
│ return_url      │ 'https://th.betbuzz.cc/PayBack/' │
│ pay_method      │ 'uwin-bindcard500'               │
│ type            │ '1'                              │
│ gear            │ '2'                              │
│ _t              │ '1769963644019'                  │
│ sign            │ '1c758bd739a523846bc24608fef...' │
└─────────────────┴──────────────────────────────────┘

📝 PAYLOAD STRING: uid=987535473&key=gsVuyPJt7DBJNbZGNXpP&amount=12200&...
📏 PAYLOAD LENGTH: 206 bytes
```

**O que verificar:**
- ✅ O campo `sign` deve estar presente
- ✅ `pay_method` deve ser `uwin-bindcard500` (para auto-recargas)
- ✅ `type` deve ser `1` (para auto-recargas)
- ✅ `amount` deve estar em centavos (ex: 122 = R$1.22 se foi digitado como 1.22)
- ✅ Todos os campos obrigatórios devem estar preenchidos

### 3️⃣ RESPOSTA DA API
```
[RECHARGE] Status: 200
[RECHARGE] Resposta: {status: 0, message: 'error sign', data: Array(0)}
```

**Significados:**
- `{status: 1, message: 'success'}` = ✅ Recarga aprovada
- `{status: 0, message: 'error sign'}` = ❌ Signature inválida (sign calculado errado)
- `{status: 0, message: 'error token'}` = ❌ Token inválido
- `{status: 0, message: 'error user'}` = ❌ Usuário não encontrado
- `{status: 0, message: 'error amount'}` = ❌ Valor da recarga inválido

## 🎯 PROBLEMA ATUAL

**Erro:** `error sign`

**Causa Provável:**
O valor do `sign` (MD5 hash) não corresponde ao que a API espera.

**Por que acontece:**
1. O algoritmo de sign pode estar diferente para este método de pagamento
2. O secret pode ser diferente para `uwin-bindcard500` vs `cartbank`
3. A ordem dos parâmetros pode estar errada
4. O valor secreto (secretValue) pode estar incorreto

## 🔧 PRÓXIMOS PASSOS DE DEBUG

### Teste 1: Comparar Tokens
```
1. Faça uma recarga MANUAL com cartbank/type=0
2. Copie o token que aparece nos logs
3. Faça uma recarga AUTOMÁTICA com uwin-bindcard500/type=1
4. Compare os dois tokens
   - Se forem IGUAIS: Token está sendo reutilizado (problema)
   - Se forem DIFERENTES: Cada método tem seu token (correto)
```

### Teste 2: Validar Cálculo do Sign
```
1. Pegue o "bodyStr" dos logs
2. Pegue o "secretValue" dos logs
3. Use um gerador MD5 online (https://www.md5hashgenerator.com/)
4. Calcule: MD5(secretValue + bodyStr) ou MD5(bodyStr + secretValue)
5. Compare com o "sign" gerado
   - Se baterem: Algoritmo está correto
   - Se não baterem: O algoritmo está diferente do esperado
```

### Teste 3: Interceptar Request Real
```
1. Abra DevTools (F12)
2. Vá para aba Network
3. Faça uma recarga MANUAL bem-sucedida
4. Procure a requisição POST para /api/v1/user/recharge
5. Copie o body completo
6. Compare com o que nosso sistema está enviando
```

## 📊 CHECKLIST DE VALIDAÇÃO

- [ ] Sign field está no payload
- [ ] Sign field não está vazio
- [ ] Token está sendo enviado no header `token:`
- [ ] Key está sendo enviado no header `key:`
- [ ] Amount está em centavos
- [ ] pay_method está correto para o tipo de recarga
- [ ] type está correto (0 = manual, 1 = auto)
- [ ] API responde com status 200
- [ ] Resposta não é "error sign"

## 🚀 EXPORTAR DADOS PARA ANÁLISE

Execute no console do navegador:
```javascript
window.exportDebugData()
```

Isso vai imprimir um JSON com todos os dados de debug que pode ser compartilhado.

---

**Última atualização:** Segundo módulo de depuração ativado
**Status:** Aguardando teste manual para validação
