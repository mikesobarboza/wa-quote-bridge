import requests
import logging
from typing import Any, Dict
import cloudscraper
import hashlib
from urllib.parse import parse_qs, urlencode

logger = logging.getLogger("icecassino_api")


# Função de login removida: o login deve ser feito manualmente pelo usuário no navegador embutido.
# O token de sessão deve ser capturado pelo script e salvo/localizado para uso nas requisições.


# Função compute_md5_sign removida - Ice Casino NÃO usa campo 'sign' no body!
# A autenticação é feita via headers 'token' e 'key'

def calculate_sign(params: dict, token: str) -> str:
    """
    Calcula o sign MD5 para Ice Casino.
    
    Estratégia corrigida:
    - Pega params com: uid, key, amount, pid, return_url, pay_method, type, gear, _t
    - Adiciona secret key padrão
    - Ordena alfabeticamente
    - Concatena com "&"
    - Calcula MD5
    """
    import hashlib
    
    # Remove sign se existir (pois estamos calculando)
    clean_params = {k: v for k, v in params.items() if k != "sign"}
    
    # Adiciona secret key padrão (usado pela Ice Casino)
    clean_params["secret"] = "8uhIUHIH323*&8"  # Secret key padrão do Ice Casino
    
    # Ordena alfabeticamente e constrói query string
    sorted_keys = sorted(clean_params.keys())
    param_str = "&".join([f"{k}={clean_params[k]}" for k in sorted_keys])
    
    # Calcula MD5 com a string formatada
    final_sign = hashlib.md5(param_str.encode()).hexdigest()
    
    print(f"[BRIDGE] 🔐 Query para MD5: {param_str[:100]}...")
    print(f"[BRIDGE] ✅ Sign MD5 calculado: {final_sign}")
    
    return final_sign


def icecassino_recharge(token: str, amount: float, uid: str, key: str, casino_url: str = "", cookies: str = "") -> Dict[str, Any]:
    """
    Realiza recarga (PIX) via API do IceCassino.
    
    DESCOBERTA CRÍTICA:
    - Ice Casino autentica via HEADERS 'token' e 'key' + COOKIES DE SESSÃO!
    - O body NÃO contém campo 'sign'
    - A validação é feita através de: token + cookies + body
    
    Parâmetros:
        token (str): Token de autenticação (enviado como HEADER)
        amount (float): Valor da recarga em centavos
        uid (str): ID do usuário
        key (str): Chave de autenticação (enviada como HEADER E body)
        casino_url (str): URL personalizada do cassino
        cookies (str): Cookies de sessão (CRÍTICO para autenticação!)
    Retorna:
        dict: Resposta da API
    """

    print(f"[BRIDGE] 🎯 Iniciando recarga - UID: {uid}, Amount: {amount}")

    # ⚠️ IMPORTANTE: amount já vem em centavos do frontend!
    # content.js converte "234,76" → 23476 centavos
    amount_centavos = int(amount)
    print(f"[BRIDGE] Amount final: {amount_centavos} centavos")
    
    # Payload COM parâmetros para cálculo correto de sign
    import time
    timestamp = int(time.time() * 1000)
    
    data = {
        "uid": uid,
        "key": key,
        "amount": str(amount_centavos),
        "pid": "0",
        "return_url": "https://th.betbuzz.cc/PayBack/",
        "pay_method": "cartbank",
        "type": "1",                    # ✅ CORRIGIDO: deve ser 1, não 0
        "gear": "2",                    # ✅ ADICIONADO: parâmetro necessário
        "_t": str(timestamp)            # ✅ ADICIONADO: timestamp requerido
    }
    
    # IMPORTANTE: Ice Casino REQUER sign calculado com TODOS os parâmetros
    # O sign é adicionado por um interceptor APÓS o XMLHttpRequest.send
    # Vamos calcular e adicionar aqui
    sign = calculate_sign(data, token)
    data["sign"] = sign
    
    print(f"[BRIDGE] 🔧 Parâmetros finais para assinatura:")
    for k, v in sorted(data.items()):
        if k != "sign":
            print(f"[BRIDGE]   - {k}: {v}")
    
    print(f"[BRIDGE] ✅ Payload com sign calculado!")
    
    # Usa URL personalizada ou padrão do Ice Casino
    url = casino_url if casino_url else "https://d1yoh197nyhh3m.bzcfgm.com/api/v1/user/recharge"
    print(f"[BRIDGE] 🌐 URL destino: {url}")
    
    # Headers EXATAMENTE como Ice Casino envia (descoberto por interceptação)
    # ⚠️ CRÍTICO: 'token' e 'key' são HEADERS, não campos do body!
    headers = {
        "Accept": "application/json, text/plain, */*",
        "Content-Type": "application/x-www-form-urlencoded",
        "token": token,  # 👈 Autenticação via header!
        "key": key,      # 👈 Chave via header!
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Origin": "https://d2nh82wv4qbrag.cloudfront.net",
        "Referer": "https://d2nh82wv4qbrag.cloudfront.net/"
    }
    
    # ADICIONA COOKIES DE SESSÃO (CRÍTICO!)
    if cookies:
        headers["Cookie"] = cookies
        print(f"[BRIDGE] 🍪 Cookies adicionados: {cookies[:50]}...")
    else:
        print(f"[BRIDGE] ⚠️  SEM cookies - pode falhar!")
    
    # Monta o corpo form-urlencoded
    body = urlencode(data)
    
    print(f"[BRIDGE] 📋 Headers da requisição:")
    print(f"[BRIDGE]   - token: {token[:15]}...")
    print(f"[BRIDGE]   - key: {key[:15]}...")
    if cookies:
        print(f"[BRIDGE]   - Cookie: {cookies[:50]}...")
    
    print(f"[BRIDGE] 📦 Body completo da requisição:")
    for item in body.split('&'):
        if '=' in item:
            k, v = item.split('=', 1)
            if k == 'sign':
                print(f"[BRIDGE]   - {k}: {v}")
            elif k == 'return_url':
                print(f"[BRIDGE]   - {k}: [URL encoding]")
            else:
                print(f"[BRIDGE]   - {k}: {v}")
    
    try:
        # Use cloudscraper para bypass do Cloudflare
        scraper = cloudscraper.create_scraper()
        resp = scraper.post(url, headers=headers, data=body, timeout=15)
        
        print(f"[BRIDGE] ✅ Status: {resp.status_code}")
        print(f"[BRIDGE] 📥 Response: {resp.text[:300]}")
        
        resp.raise_for_status()
        logger.info(f"Recarga solicitada para usuário: {uid}, valor: {amount}")
        
        try:
            return resp.json()
        except Exception as json_err:
            logger.error(f"Resposta bruta da API IceCassino (erro JSON): {resp.text}")
            raise Exception(f"Erro ao decodificar JSON da resposta: {json_err}\nResposta bruta: {resp.text}")
    except requests.exceptions.HTTPError as e:
        logger.error(f"Erro HTTP na recarga: {e}")
        logger.error(f"Response: {e.response.text if e.response else 'N/A'}")
        raise
    except Exception as e:
        logger.error(f"Erro na recarga: {e}")
        raise
