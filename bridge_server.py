"""Servidor bridge para automação QR WhatsApp - Versão sem Logs"""

import json
import os
import threading
import time
import uuid
from datetime import datetime, timedelta
from typing import Dict, List, Optional

import logging

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(name)s: %(message)s',
    handlers=[logging.StreamHandler()]
)


from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from icecassino_api import icecassino_recharge
import logging

app = FastAPI(title="Bridge Server QR WhatsApp")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configurações
CONFIG = {
    "secret": "troque-isto",
    "duplicate_timeout": 10,
    "port": 8788,
    "host": "127.0.0.1",
    "max_queue_size": 10,
    "lock_timeout": 20,
    # "ahk_cooldown": 1  # Removido: não há mais integração com AHK
}

# Estado global com thread-safe
class ServerState:
    def __init__(self):
        self.message_queue: List[Dict] = []
        self.processing_lock = threading.Lock()
        self.message_lock: bool = False
        self.lock_time: Optional[datetime] = None
        self.last_received_time: Optional[datetime] = None
        self.last_processed_time: Optional[datetime] = None
        self.message_history: List[Dict] = []
        self.last_cookies: Optional[str] = None
        self.last_cookies_time: Optional[datetime] = None
        self.recharge_results: Dict[str, Dict] = {}
        self.stats = {
            "total_received": 0,
            "total_processed": 0,
            "duplicates_rejected": 0,
            "errors": 0
        }
        # self.ahk_last_request removido
        
    def add_message(self, message: Dict) -> bool:
        with self.processing_lock:
            processed_text = message.get("processed_text", "")
            
            # Verifica duplicata na fila
            for msg in self.message_queue:
                if msg.get("processed_text") == processed_text:
                    self.stats["duplicates_rejected"] += 1
                    return False
            
            # Limita tamanho da fila
            if len(self.message_queue) >= CONFIG["max_queue_size"]:
                removed = self.message_queue.pop(0)
            
            self.message_queue.append(message)
            self.last_received_time = datetime.now()
            self.stats["total_received"] += 1
            
            # Adiciona ao histórico
            self.message_history.append({
                **message,
                "queue_time": datetime.now().isoformat(),
                "status": "queued"
            })
            if len(self.message_history) > 20:
                self.message_history.pop(0)
            
            return True
    
    def get_next_message(self) -> Optional[Dict]:
        with self.processing_lock:
            # Verifica timeout do lock
            if self.message_lock and self.lock_time:
                lock_age = (datetime.now() - self.lock_time).total_seconds()
                if lock_age > CONFIG["lock_timeout"]:
                    self.message_lock = False
            
            # Removido: cooldown do AHK
            
            if self.message_lock or not self.message_queue:
                return None
            
            # Pega próxima mensagem
            self.message_lock = True
            self.lock_time = datetime.now()
            self.last_processed_time = datetime.now()
            message = self.message_queue.pop(0)
            self.stats["total_processed"] += 1
            
            # Atualiza histórico
            processed_text = message.get("processed_text", "")
            for hist in self.message_history:
                if hist.get("processed_text") == processed_text:
                    hist["status"] = "processing"
                    hist["processing_time"] = datetime.now().isoformat()
                    break
            
            # Removido: registro de requisição do AHK
            
            return message
    
    def confirm_processing(self, success: bool, processed_text: str = None):
        with self.processing_lock:
            self.message_lock = False
            self.lock_time = None
            
            if processed_text:
                # Atualiza histórico
                for hist in self.message_history:
                    if hist.get("processed_text") == processed_text:
                        hist["status"] = "completed" if success else "failed"
                        hist["completion_time"] = datetime.now().isoformat()
                        hist["success"] = success
                        break
            
            if not success:
                self.stats["errors"] += 1
    
    def clear_queue(self):
        with self.processing_lock:
            self.message_queue.clear()
            self.message_lock = False
            self.lock_time = None
    
    def get_queue_info(self):
        with self.processing_lock:
            lock_age = 0
            if self.lock_time:
                lock_age = (datetime.now() - self.lock_time).total_seconds()
            
            return {
                "queue_size": len(self.message_queue),
                "queue_items": [
                    {
                    "processed_text": msg.get("processed_text", ""),
                    "timestamp": msg.get("timestamp", "")
                    } for msg in self.message_queue[:5]
                ],
                "is_locked": self.message_lock,
                "lock_age": lock_age,
                "last_processed_ago": (datetime.now() - self.last_processed_time).total_seconds() if self.last_processed_time else 0
            }

state = ServerState()
start_time = time.time()

def process_text(text: str, remove_cents: bool = True) -> str:
    """Processa o texto removendo 'qr' e centavos se necessário"""
    import re
    
    # Remove prefixo 'qr'
    text = re.sub(r'^qr\s*', '', text, flags=re.IGNORECASE).strip()
    
    # Detecta e converte sufixos (k, m, mi, mil, etc.)
    multiplier = 1
    text_lower = text.lower()
    
    # Verifica sufixos de milhares
    if re.search(r'(\d+[.,]?\d*)\s*(k|mil)', text_lower):
        match = re.search(r'(\d+[.,]?\d*)\s*(k|mil)', text_lower)
        if match:
            base_value = match.group(1).replace(',', '.')
            try:
                value = float(base_value) * 1000
                text = str(int(value)) if value == int(value) else str(value).replace('.', ',')
                multiplier = 0  # Marca que já processou
            except ValueError:
                pass
    
    # Verifica sufixos de milhões
    elif re.search(r'(\d+[.,]?\d*)\s*(m|mi|milhao|milhão|milhoes|milhões)', text_lower):
        match = re.search(r'(\d+[.,]?\d*)\s*(m|mi|milhao|milhão|milhoes|milhões)', text_lower)
        if match:
            base_value = match.group(1).replace(',', '.')
            try:
                value = float(base_value) * 1000000
                text = str(int(value)) if value == int(value) else str(value).replace('.', ',')
                multiplier = 0  # Marca que já processou
            except ValueError:
                pass
    
    # Se não processou multiplicador, processa normalmente
    if multiplier == 1:
        # Converte ponto para vírgula se for formato americano
        if ',' not in text and '.' in text:
            parts = text.split('.')
            if len(parts) == 2 and len(parts[1]) <= 2:
                text = text.replace('.', ',')
        
        # Remove tudo que não é número ou vírgula
        text = re.sub(r'[^\d,]', '', text)
    
    # Processa centavos
    if ',' in text:
        if remove_cents:
            text = text.split(',')[0].strip()
        else:
            # Mantém vírgula e centavos
            parts = text.split(',')
            if len(parts) > 2:
                text = parts[0] + ',' + ''.join(parts[1:])
    
    return text

def is_duplicate(text: str, remove_cents: bool) -> bool:
    """Verifica se a mensagem é duplicada dentro do timeout"""
    global state
    
    if not state.last_received_time:
        return False
    
    time_diff = (datetime.now() - state.last_received_time).total_seconds()
    
    if time_diff < CONFIG['duplicate_timeout']:
        import re
        clean_text = re.sub(r'^qr\s*', '', text, flags=re.IGNORECASE).strip()
        
        # Verifica na fila
        for msg in state.message_queue:
            original_in_queue = msg.get("original_text", "")
            clean_in_queue = re.sub(r'^qr\s*', '', original_in_queue, flags=re.IGNORECASE).strip()
            
            if clean_text == clean_in_queue:
                return True
        
        # Verifica no histórico recente
        for hist in state.message_history[-5:]:
            original_in_history = hist.get("original_text", "")
            clean_in_history = re.sub(r'^qr\s*', '', original_in_history, flags=re.IGNORECASE).strip()
            
            if clean_text == clean_in_history:
                return True
    
    return False

def is_duplicate_processed(processed_text: str) -> bool:
    """Verifica duplicata baseada no texto JÁ PROCESSADO"""
    global state
    
    if not state.last_received_time:
        return False
    
    time_diff = (datetime.now() - state.last_received_time).total_seconds()
    
    if time_diff < CONFIG['duplicate_timeout']:
        # Verifica na fila
        for msg in state.message_queue:
            if msg.get("processed_text") == processed_text:
                return True
        
        # Verifica no histórico recente
        for hist in state.message_history[-5:]:
            if hist.get("processed_text") == processed_text:
                return True
    
    return False


# Novo endpoint /process: integração direta com API IceCassino
@app.post("/process")
async def process_message(request: Request):
    """
    Recebe uma requisição para login, recarga ou outras ações na API IceCassino.
    Parâmetros esperados no body:
        acao: "login" ou "recarga"
        ...parâmetros específicos de cada ação...
    """
    logger = logging.getLogger("bridge_server.process")
    try:
        body = await request.json()
    except Exception as e:
        logger.error(f"JSON inválido: {e}")
        raise HTTPException(status_code=400, detail="JSON inválido")

    acao = body.get("acao")
    if not acao:
        logger.error("Campo 'acao' obrigatório.")
        raise HTTPException(status_code=400, detail="Campo 'acao' obrigatório.")

    try:
        if acao == "login":
            # Login remoto foi removido: login deve ser feito manualmente no navegador
            raise HTTPException(status_code=400, detail="Login remoto não suportado. Faça login manualmente no Ice Casino.")

        elif acao == "recarga":
            # Enfileirar recarga para processamento no MAIN world (extensão)
            required = ["amount", "uid", "key"]
            for param in required:
                if not body.get(param):
                    raise HTTPException(status_code=400, detail=f"Parâmetro obrigatório: {param}")

            request_id = body.get("request_id") or f"rq_{int(time.time() * 1000)}_{uuid.uuid4().hex[:8]}"
            amount_val = float(body["amount"])
            processed_text = f"recarga:{body['uid']}:{amount_val}"

            message = {
                "uid": body["uid"],
                "key": body["key"],
                "amount": amount_val,
                "request_id": request_id,
                "processed_text": processed_text,
                "original_text": body.get("text", ""),
                "timestamp": datetime.now().isoformat()
            }

            added = state.add_message(message)
            if not added:
                logger.warning("Recarga duplicada rejeitada")
                return {"status": "duplicate", "acao": "recarga", "request_id": request_id, "job_id": request_id}

            logger.info(f"Recarga enfileirada para UID {body['uid']} valor {body['amount']}")
            return {"status": "queued", "acao": "recarga", "request_id": request_id, "job_id": request_id}

        else:
            logger.error(f"Ação não suportada: {acao}")
            raise HTTPException(status_code=400, detail=f"Ação não suportada: {acao}")
    except HTTPException as he:
        raise he
    except Exception as e:
        logger.error(f"Erro ao processar ação {acao}: {e}")
        return {"status": "erro", "acao": acao, "mensagem": str(e)}

    # ...endpoint /get_message removido (era usado pelo AHK)...

    # ...endpoint /message_processed removido (era usado pelo AHK)...

@app.get("/")
async def root():
    """Endpoint raiz"""
    queue_info = state.get_queue_info()
    return {
        "status": "running",
        "service": "WhatsApp QR Bridge",
        "version": "4.0",
        "queue_info": queue_info,
        "stats": state.stats
    }

@app.get("/health")
async def health_check():
    """Endpoint de verificação de saúde"""
    queue_info = state.get_queue_info()
    
    return {
        "status": "healthy",
        "timestamp": datetime.now().isoformat(),
        "queue_info": queue_info,
        "stats": state.stats,
        "uptime_seconds": time.time() - start_time
    }

@app.get("/status")
async def get_status():
    """Retorna o status atual do sistema"""
    queue_info = state.get_queue_info()
    
    return {
        "status": "running",
        "version": "4.0",
        "queue_info": queue_info,
        "stats": state.stats,
        "last_received": state.last_received_time.isoformat() if state.last_received_time else None,
        "last_processed": state.last_processed_time.isoformat() if state.last_processed_time else None
    }

    # ...endpoint /focus_whatsapp removido (era usado pelo AHK)...

@app.post("/clear")
async def clear_command():
    """Limpa a fila de mensagens"""
    state.clear_queue()
    
    return {
        "status": "cleared",
        "message": "Fila limpa"
    }

@app.get("/queue")
async def get_queue():
    """Retorna a fila completa"""
    queue_info = state.get_queue_info()
    return {
        "queue": [
            {
                "original_text": msg.get("original_text", ""),
                "processed_text": msg.get("processed_text", ""),
                "timestamp": msg.get("timestamp", "")
            } for msg in state.message_queue
        ],
        "queue_info": queue_info,
        "history": state.message_history[-10:]
    }

@app.post("/unlock")
async def unlock_server():
    """Força o desbloqueio do servidor"""
    with state.processing_lock:
        state.message_lock = False
        state.lock_time = None
    
    return {"status": "unlocked", "message": "Servidor desbloqueado"}

@app.post("/api/icecassino_token")
async def receive_icecassino_token(request: Request):
    """Recebe token do Ice Casino do extension com credenciais"""
    try:
        data = await request.json()
        token = data.get("token", "")
        credentials = data.get("credentials", {})
        action = data.get("action", "")
        
        if not token:
            raise HTTPException(status_code=400, detail="Token vazio")
        
        # Log apenas para debug
        print(f"[BRIDGE] 🎫 Token recebido: {token[:10]}... (action: {action})")
        
        # Armazenar credenciais localmente se fornecidas
        if credentials:
            print(f"[BRIDGE] 📦 Credenciais armazenadas:")
            if credentials.get('cookies'):
                print(f"[BRIDGE]   - Cookies: {len(credentials['cookies'])} encontrado(s)")
                for cookie in credentials['cookies']:
                    print(f"[BRIDGE]     * {cookie.get('name', 'unknown')}: {str(cookie.get('value', ''))[:20]}...")
                try:
                    cookie_header = "; ".join(
                        f"{c.get('name')}={c.get('value')}"
                        for c in credentials['cookies']
                        if c.get('name') and c.get('value') is not None
                    )
                    if cookie_header:
                        state.last_cookies = cookie_header
                        state.last_cookies_time = datetime.now()
                        print(f"[BRIDGE] 🍪 Cookie header salvo ({len(cookie_header)} chars)")
                        print(f"[BRIDGE] 🍪 Cookie header (preview): {cookie_header[:120]}...")
                except Exception as cookie_err:
                    print(f"[BRIDGE] ⚠️  Erro ao montar cookies: {cookie_err}")
            if credentials.get('localStorage'):
                print(f"[BRIDGE]   - localStorage: {len(credentials['localStorage'])} chave(s)")
            if credentials.get('sessionStorage'):
                print(f"[BRIDGE]   - sessionStorage: {len(credentials['sessionStorage'])} chave(s)")
        
        return {
            "status": "success",
            "message": "Token recebido com sucesso",
            "token": token[:10] + "...",
            "credentials_received": bool(credentials)
        }
    except Exception as e:
        print(f"[BRIDGE] ❌ Erro ao receber token: {e}")
        raise HTTPException(status_code=400, detail=str(e))

@app.get("/api/get_pending_recharge")
async def get_pending_recharge():
    """Retorna recargas pendentes para processar"""
    try:
        # Verifica se há mensagens na fila
        next_msg = state.get_next_message()
        
        if not next_msg:
            return {
                "status": "no_pending",
                "message": "Nenhuma recarga pendente",
                "data": None
            }
        
        print(f"[BRIDGE] 📦 Recargas pendentes: {next_msg.get('processed_text', '')}")
        
        return {
            "status": "success",
            "message": "Recarga pendente encontrada",
            "data": {
                "uid": next_msg.get("uid", ""),
                "key": next_msg.get("key", ""),
                "amount": next_msg.get("amount", 0),
                "request_id": next_msg.get("request_id", ""),
                "text": next_msg.get("processed_text", ""),
                "original_text": next_msg.get("original_text", ""),
                "timestamp": next_msg.get("timestamp", "")
            }
        }
    except Exception as e:
        print(f"[BRIDGE] ❌ Erro ao obter recargas pendentes: {e}")
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/api/recharge_result")
async def receive_recharge_result(request: Request):
    """Recebe o resultado da recarga processada pela extensão"""
    try:
        data = await request.json()
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"JSON inválido: {e}")

    request_id = data.get("request_id")
    status = data.get("status")
    result_data = data.get("data")

    if not request_id:
        raise HTTPException(status_code=400, detail="request_id obrigatório")

    success = status == "success"
    state.recharge_results[request_id] = {
        "status": status,
        "data": result_data,
        "timestamp": datetime.now().isoformat()
    }
    state.confirm_processing(success)

    return {"status": "ok", "request_id": request_id}

if __name__ == "__main__":
    import uvicorn
    
    print(f"\n{'='*80}")
    print("🚀 SERVIDOR BRIDGE - VERSÃO 4.0 (SEM LOGS)")
    print(f"🌐 URL: http://{CONFIG['host']}:{CONFIG['port']}")
    print(f"{'='*80}\n")
    
    uvicorn.run(app, host=CONFIG["host"], port=CONFIG["port"], log_level="error")
