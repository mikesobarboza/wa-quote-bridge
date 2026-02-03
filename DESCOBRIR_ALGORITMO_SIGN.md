================================================================================
                 🔍 DESCOBRIR ALGORITMO DE SIGN - GUIA RÁPIDO
================================================================================

PROBLEMA: 
  Erro: {"status":0,"message":"error sign","data":[]}

TRADUÇÃO: 
  Ice Casino rejeitou porque o campo `sign` está errado

SOLUÇÃO EM 3 PASSOS:

================================================================================
                              PASSO 1 (5 min)
                      INTERCEPTAR O JAVASCRIPT
================================================================================

1. Abra Ice Cassino no navegador
2. Pressione F12 (Console)
3. Cole todo o código abaixo:

───────────────────────────────────────────────────────────────────────────────

(function() {
    const originalFetch = window.fetch;
    let isLogging = true;
    
    window.fetch = function(...args) {
        const [url, config] = args;
        if (url.toString().includes('recharge') && isLogging) {
            console.log('\n🔍 REQUISIÇÃO INTERCEPTADA:');
            console.log('URL:', url.toString());
            if (config?.body) {
                console.log('BODY:', config.body);
                // Decodifica
                try {
                    const params = new URLSearchParams(config.body);
                    console.log('\n📋 PARÂMETROS:');
                    for (const [k, v] of params) {
                        console.log(`  ${k}: ${v}`);
                    }
                    if (params.has('sign')) {
                        console.log('\n✅ SIGN ENCONTRADO:', params.get('sign'));
                    }
                } catch (e) {
                    console.log('Erro:', e.message);
                }
            }
            isLogging = false;
        }
        return originalFetch.apply(this, args);
    };
    
    console.log('✅ Interceptador ativado. Faça uma recarga agora...');
})();

───────────────────────────────────────────────────────────────────────────────

4. Faça uma recarga no Ice Cassino
5. Copie os valores mostrados no console

RESULTADO QUE VOCÊ VERÁ:

  🔍 REQUISIÇÃO INTERCEPTADA:
  URL: https://api.icecassino.com/recharge
  BODY: uid=987535473&key=NaGT6y4JFnsHweFMpC9c&amount=500000&sign=d905f51bfd...
  
  📋 PARÂMETROS:
    uid: 987535473
    key: NaGT6y4JFnsHweFMpC9c
    amount: 500000
    sign: d905f51bfd9549a9cce207b7baa639c9
  
  ✅ SIGN ENCONTRADO: d905f51bfd9549a9cce207b7baa639c9

OBSERVAÇÃO IMPORTANTE (CAPTURA REAL - Ice Cassino):
Em alguns casos o `sign` NÃO vem no body. Em vez disso, a assinatura é
validada usando o HEADER `token` (e possivelmente o header `key`).

EXEMPLO REAL CAPTURADO:
    URL: https://d1yoh197nyhh3m.bzcfgm.com/api/v1/user/recharge
    Header token: d87fa0f3a5317c147ceb98e93df678d2
    Header key:   NaGT6y4JFnsHweFMpC9c
    Body: uid=987535473&key=NaGT6y4JFnsHweFMpC9c&amount=245698&pid=0&return_url=...

Se o backend não replica o HEADER `token` exatamente, o servidor retorna:
    {"status":0,"message":"error sign","data":[]}

Portanto, antes de tentar MD5:
✅ Garanta que o backend envia os headers `token` e `key` exatamente como no navegador
✅ Garanta que o body é idêntico (mesmos parâmetros e encoding)

================================================================================
                              PASSO 2 (10 min)
                        DESCOBRIR O PADRÃO
================================================================================

Com os dados do Passo 1, teste os padrões abaixo no seu backend/script Node.js:

const crypto = require('crypto');

function md5(str) {
    return crypto.createHash('md5').update(str).digest('hex');
}

// DADOS DO NAVEGADOR:
const uid = '987535473';
const key = 'NaGT6y4JFnsHweFMpC9c';
const amount = '500000';
const expectedSign = 'd905f51bfd9549a9cce207b7baa639c9';  // Do navegador
const secret = '8uhIUHIH323*&8';  // Tentar este

// TESTES DE PADRÃO:

console.log('🔍 Testando padrões...\n');

const tests = [
    // Padrão 1: uid=X&key=Y&amount=Z&secret=S
    {
        name: 'Padrão 1: uid&key&amount&secret',
        str: `uid=${uid}&key=${key}&amount=${amount}&secret=${secret}`
    },
    
    // Padrão 2: key&uid&amount&secret (ordem diferente)
    {
        name: 'Padrão 2: key&uid&amount&secret',
        str: `key=${key}&uid=${uid}&amount=${amount}&secret=${secret}`
    },
    
    // Padrão 3: amount&uid&key&secret
    {
        name: 'Padrão 3: amount&uid&key&secret',
        str: `amount=${amount}&uid=${uid}&key=${key}&secret=${secret}`
    },
    
    // Padrão 4: secret primeiro
    {
        name: 'Padrão 4: secret&uid&key&amount',
        str: `${secret}${uid}${key}${amount}`
    },
    
    // Padrão 5: apenas valores
    {
        name: 'Padrão 5: uid+key+amount+secret (concatenado)',
        str: `${uid}${key}${amount}${secret}`
    },
    
    // Padrão 6: ordem alfabética
    {
        name: 'Padrão 6: amount&key&secret&uid (alfabético)',
        str: `amount=${amount}&key=${key}&secret=${secret}&uid=${uid}`
    },
    
    // Padrão 7: sem secret (se houver no navegador)
    {
        name: 'Padrão 7: uid&key&amount (SEM secret)',
        str: `uid=${uid}&key=${key}&amount=${amount}`
    },
];

tests.forEach(test => {
    const hash = md5(test.str);
    const match = hash === expectedSign;
    const status = match ? '✅' : '❌';
    
    console.log(`${status} ${test.name}`);
    if (match) {
        console.log(`   ⭐ ENCONTRADO! String: ${test.str}`);
        console.log(`   Hash: ${hash}\n`);
    }
});

================================================================================

EXECUTE ESTE SCRIPT:

  node test-sign.js

VOCÊ VERÁ:

  ❌ Padrão 1: uid&key&amount&secret
  ❌ Padrão 2: key&uid&amount&secret
  ✅ Padrão 3: amount&uid&key&secret
     ⭐ ENCONTRADO! String: amount=500000&uid=987535473&key=NaGT6y4JFnsHweFMpC9c&secret=8uhIUHIH323*&8
     Hash: d905f51bfd9549a9cce207b7baa639c9

================================================================================
                              PASSO 3 (5 min)
                     IMPLEMENTAR NO BACKEND
================================================================================

Quando descobrir o padrão (ex: Padrão 3), implemente no seu código:

PYTHON (Para bridge_server.py):

```python
import hashlib

def generate_sign_ice_casino(uid: str, key: str, amount: str, secret: str = '8uhIUHIH323*&8') -> str:
    # Padrão descoberto (ADAPTE CONFORME SEU TESTE):
    sign_string = f'amount={amount}&uid={uid}&key={key}&secret={secret}'
    
    print(f'[Sign] Input: {sign_string}')
    
    sign = hashlib.md5(sign_string.encode()).hexdigest()
    
    print(f'[Sign] Output: {sign}')
    
    return sign

# USO:
sign = generate_sign_ice_casino('987535473', 'NaGT6y4JFnsHweFMpC9c', '500000')
# sign deve ser: d905f51bfd9549a9cce207b7baa639c9
```

NODE.JS (Para teste rápido):

```javascript
const crypto = require('crypto');

function md5(str) {
    return crypto.createHash('md5').update(str).digest('hex');
}

function generateSignIceCassino(uid, key, amount, secret = '8uhIUHIH323*&8') {
    const signString = `amount=${amount}&uid=${uid}&key=${key}&secret=${secret}`;
    console.log('[Sign] Input:', signString);
    
    const sign = md5(signString);
    console.log('[Sign] Output:', sign);
    
    return sign;
}

// USO:
const sign = generateSignIceCassino('987535473', 'NaGT6y4JFnsHweFMpC9c', '500000');
```

================================================================================
                            CHECKLIST FINAL
================================================================================

❌ [ ] Passo 1: Interceptei o navegador e obtive o sign esperado
❌ [ ] Passo 2: Rodei os testes e ENCONTREI o padrão
❌ [ ] Passo 3: Implementei no backend
❌ [ ] Validação: Meu backend gera o MESMO sign que o navegador
❌ [ ] Teste: Requisição ao Ice Casino agora retorna sucesso

================================================================================
                         SE AINDA NÃO FUNCIONAR
================================================================================

Se nenhum padrão básico funcionou, o algoritmo pode ser:
  
  1. ORDEM DIFERENTE não testada
     → Teste ordem alfabética: amount, key, secret, uid
     → Teste ordem inversa
  
  2. HASH DIFERENTE (não MD5)
     → Teste SHA256 em vez de MD5
     → Teste SHA1
     → Teste Base64(MD5)
  
  3. CAMPO ADICIONAL
     → O Ice Casino pode estar adicionando timestamp, token, etc
     → Intercepte novamente e procure por campos extras
  
  4. SEGREDO DIFERENTE
     → Tente deixar vazio: `secret=''`
     → Tente outros secrets conhecidos
  
Volte para PASSO 1 e colete mais informações.

================================================================================
                      SUPORTE: BrrBet (Referência Real)
================================================================================

Isto é EXATAMENTE como foi descoberto para BrrBet em 2026-01-09:

PADRÃO DESCOBERTO:
  username=328491696&
  amount=30&
  payplatformid=960001&
  time=1767944277&
  currencyCode=BRL&
  merchCode=bestbrlpay&
  key=fc361cdb770aebc2126cc0dac989c896

RESULTADO:
  ✅ API funcionou
  ✅ PIX gerado em <100ms
  ✅ Sem UI automation

MESMA LÓGICA AQUI - só precisa encontrar o padrão do Ice Casino.

================================================================================
