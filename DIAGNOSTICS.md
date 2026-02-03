# 🔍 Diagnóstico - Problema com Token de Recarga

## ❌ O Que Aconteceu - ATUALIZAÇÃO CRÍTICA

A recarga automática retornou: **`error sign`**

**MAS AGORA DESCOBRIMOS O REAL PROBLEMA:**

### 🎯 Descoberta Chave

O token está sendo **capturado corretamente** da primeira recarga manual:
- Token capturado: `4f33fc7ef8e2eb6219f8bfa75fa1d87f` ✅
- Armazenado em: `chrome.storage.local['icecassino_token']` ✅
- Enviado na auto recarga: SIM ✅

**MAS ESTÁ SENDO REJEITADO!** ❌

### 🔴 Por Que o API Rejeita?

Olhando os logs, a **recarga manual** usava:
```
pay_method: 'cartbank'
type: 0
```

A **auto recarga** está usando:
```
pay_method: 'uwin-bindcard500'
type: 1
gear: 2
_t: 1769961346002 (timestamp diferente!)
```

**O token é ESPECÍFICO aos parâmetros!**

Quando você muda os parâmetros, precisa de um token DIFERENTE para aqueles parâmetros.

## 🔑 Como o Token É Gerado

Não é simplesmente MD5(alguns_parâmetros). É mais complexo:

**Opção 1**: O token é MD5 dos parâmetros MAIS o payment method + timestamp
**Opção 2**: O token é gerado pelo servidor e armazenado no cliente
**Opção 3**: O token usa um algoritmo diferente que não conseguimos descobrir

## 🚀 Próximos Passos - Nova Abordagem

### 1. Investigar o MD5 Input Real

Recarregue a extensão e faça uma **recarga manual do tipo "uwin-bindcard500"** (o mesmo tipo da auto recarga).

Procure nos logs por:
```
[MAIN] 📝 window.md5 input: ...
[MAIN]     output: ...
```

Se encontrar um MD5 que gera o token `4f33fc7ef8e2eb6219f8bfa75fa1d87f`, teremos a resposta!

### 2. Verificar o que é Diferente

Comparar:
- MD5 input da recarga manual COM cartbank
- Com o que esperamos para uwin-bindcard500

### 3. Se Ainda Falhar

Pode ser que o token mude a cada requisição (baseado em timestamp ou random).
Nesse caso, precisamos:
- Fazer o hook do MD5 capturar EXATAMENTE o input que gera cada token
- Replicar aquele EXATO cálculo na auto recarga

## 📋 Checklist

- [ ] Recarregar extensão
- [ ] Fazer recarga manual com **uwin-bindcard500** (IMPORTANTE: same pay_method da auto)
- [ ] Procurar nos logs por "[MAIN] 📝 window.md5 input"
- [ ] Enviar a mensagem com o MD5 input/output encontrado
