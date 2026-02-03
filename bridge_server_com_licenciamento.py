import json
import os
import threading
import time
import uuid
import asyncio
from datetime import datetime, timedelta
from typing import Dict, List, Optional
import re
import requests
from icecassino_api import icecassino_recharge

from fastapi import FastAPI, HTTPException, Request, Body
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="Bridge Server QR WhatsApp")

# CORS deve ser aplicado ANTES de qualquer rota
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

TOKEN_FILE = "icecassino_token.json"
token_lock = threading.Lock()

def save_icecassino_credentials(uid: str = None, key: str = None, token: str = None):
    # Permite múltiplos updates e histórico simples
    data = {}
    if os.path.exists(TOKEN_FILE):
        try:
            with open(TOKEN_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
        except Exception:
            data = {}
    # Atualiza campos se fornecidos
    if uid:
        data["uid"] = uid
    if key:
        data["key"] = key
    if token:
        data["token"] = token
        data["token_updated_at"] = datetime.now().isoformat()
    # Salva origem/timestamp se vier no payload
    if "source" in data:
        pass
    with token_lock:
        with open(TOKEN_FILE, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)

def load_icecassino_credentials() -> dict:
    try:
        with token_lock:
            with open(TOKEN_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
    except Exception:
        return {}

# Endpoint para receber e armazenar credenciais do Ice Cassino
@app.post("/api/icecassino_token")
async def receive_icecassino_token(data: dict = Body(...)):
    uid = data.get("uid")
    key = data.get("key")
    token = data.get("token")
    source = data.get("source")
    timestamp = data.get("timestamp")
    # Aceita update parcial ou total
    if not (uid or key or token):
        raise HTTPException(status_code=400, detail="Nenhum dado recebido (uid, key ou token)")
    # Salva credenciais e origem/timestamp se fornecidos
    # Salva apenas uid, key, token via função, depois atualiza arquivo com source/timestamp se fornecidos
    save_icecassino_credentials(uid=uid, key=key, token=token)
    # Atualiza arquivo com source/timestamp se vierem
    if source or timestamp:
        with token_lock:
            try:
                with open(TOKEN_FILE, "r", encoding="utf-8") as f:
                    data = json.load(f)
            except Exception:
                data = {}
            if source:
                data["source"] = source
            if timestamp:
                data["timestamp"] = timestamp
            with open(TOKEN_FILE, "w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
    return {"status": "ok", "message": "Credenciais/token salvos", "data": {"uid": uid, "key": key, "token": token, "source": source, "timestamp": timestamp}}

# Variável global para controle de recargas pendentes
pending_recharge = {"status": "none", "data": None}
recharge_results = {}

@app.get("/api/get_pending_recharge")
async def get_pending_recharge():
    """Endpoint para extensão buscar solicitações de recarga pendentes"""
    global pending_recharge
    if pending_recharge["status"] == "pending":
        data = pending_recharge["data"]
        print(f"[BRIDGE] Pendência enviada para extensão - ID: {data.get('request_id')}")
        return data
    return {"status": "none"}

@app.post("/api/recharge_result")
async def receive_recharge_result(data: dict = Body(...)):
    """Endpoint para extensão enviar resultado da recarga"""
    global pending_recharge, recharge_results
    request_id = data.get("request_id")
    status = data.get("status")
    result_data = data.get("data")
    
    print(f"[BRIDGE] Resultado de recarga recebido - ID: {request_id}, Status: {status}")
    
    # Armazenar resultado
    recharge_results[request_id] = {
        "status": status,
        "data": result_data,
        "timestamp": datetime.now().isoformat()
    }
    
    # Limpar pendência
    pending_recharge = {"status": "none", "data": None}
    
    return {"status": "ok", "message": "Resultado recebido"}

# Configurações
CONFIG = {
    "secret": "troque-isto",
    "duplicate_timeout": 10,
    "port": 8788,
    "host": "127.0.0.1",
    "max_queue_size": 10,
    "lock_timeout": 20,
    "ahk_cooldown": 1
}

# Configuração JSONBin para licenciamento
JSONBIN_CONFIG = {
    "api_key": "$2a$10$BNqgSQ2xQsiAVdzwaufNWuC/Ev9WNw.jD2IXJR0zp7O7YM0FAo.9.",
    "bin_id": "6922175f43b1c97be9be7964",
    "base_url": "https://api.jsonbin.io/v3"
}

ADMIN_SECRET = os.getenv("ADMIN_SECRET", "bili-admin-2026")

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
        self.stats = {
            "total_received": 0,
            "total_processed": 0,
            "duplicates_rejected": 0,
            "errors": 0
        }
        self.ahk_last_request: Dict[str, datetime] = {}
        
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
            
            # Verifica cooldown do AHK
            ahk_id = "default"
            if ahk_id in self.ahk_last_request:
                time_diff = (datetime.now() - self.ahk_last_request[ahk_id]).total_seconds()
                if time_diff < CONFIG["ahk_cooldown"]:
                    return None
            
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
            
            # Registra a requisição do AHK
            self.ahk_last_request[ahk_id] = datetime.now()
            
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

@app.post("/process")
async def process_message(request: Request):
    """Recebe uma mensagem e adiciona à fila"""
    
    # Verifica secret
    secret_header = request.headers.get("X-Local-Secret")
    if secret_header != CONFIG["secret"]:
        raise HTTPException(status_code=401, detail="Secret inválido")
    
    # Lê o corpo da requisição
    try:
        body = await request.json()
    except Exception as e:
        raise HTTPException(status_code=400, detail="JSON inválido")
    
    # Extrai os dados do corpo
    text = body.get("text", "")
    
    # Obtém remove_cents e converte para booleano
    remove_cents_raw = body.get("removeCents") if "removeCents" in body else body.get("remove_cents")

    if isinstance(remove_cents_raw, bool):
        remove_cents = remove_cents_raw
    elif remove_cents_raw is None:
        remove_cents = False
    else:
        val_str = str(remove_cents_raw).strip().lower()
        remove_cents = val_str in ['true', '1', 'y', 'yes', 's', 'sim']
    
    # Processa o texto
    processed_text = process_text(text, remove_cents)
    
    # Verifica duplicata baseada no texto processado
    if is_duplicate_processed(processed_text):
        return {"status": "ignored", "reason": "duplicate", "processed_text": processed_text}
    
    if not processed_text:
        raise HTTPException(status_code=400, detail="Texto inválido")
    
    # Parâmetros fixos ou de configuração (ajuste conforme necessário)
    username = body.get("username", "")
    gateway_id = body.get("gateway_id", "")
    merch_code = body.get("merch_code", "")
    sign_key = body.get("sign_key", "")
    site_code = body.get("site_code", "")
    amount = processed_text.replace(",", ".")
    try:
        amount = float(amount)
    except Exception:
        amount = 0.0

    # Sempre lê as credenciais mais recentes antes de cada requisição
    creds = load_icecassino_credentials()
    token = creds.get("token", "")
    uid = creds.get("uid", "")
    key = creds.get("key", "")
    
    print("[BRIDGE] Dados recebidos para recarga:", {
        "uid": uid,
        "key": key,
        "amount": amount
    })
    
    if not (token and uid and key):
        return {"status": "erro", "mensagem": "Credenciais incompletas. Certifique-se que UID, KEY e TOKEN foram capturados."}

    # Criar solicitação de recarga para a extensão processar
    global pending_recharge, recharge_results
    import uuid
    request_id = str(uuid.uuid4())
    
    print(f"[BRIDGE] Criando solicitação de recarga - ID: {request_id}")
    
    pending_recharge = {
        "status": "pending",
        "data": {
            "status": "pending",
            "request_id": request_id,
            "uid": uid,
            "key": key,
            "amount": amount,
            "timestamp": datetime.now().isoformat()
        }
    }
    
    # Aguardar resultado (timeout de 30 segundos)
    max_wait = 30
    wait_interval = 0.5
    waited = 0
    
    print("[BRIDGE] Aguardando extensão processar recarga...")
    
    while waited < max_wait:
        if request_id in recharge_results:
            result = recharge_results[request_id]
            del recharge_results[request_id]  # Limpar resultado
            
            print(f"[BRIDGE] Resultado recebido: {result['status']}")
            
            if result['status'] == 'success':
                return {
                    "status": "ok",
                    "acao": "recarga",
                    "result": result['data']
                }
            else:
                return {
                    "status": "erro",
                    "mensagem": f"Erro na recarga: {result.get('data', 'Erro desconhecido')}"
                }
        
        await asyncio.sleep(wait_interval)
        waited += wait_interval
    
    # Timeout
    pending_recharge = {"status": "none", "data": None}
    return {
        "status": "erro",
        "mensagem": "Timeout: extensão não respondeu. Certifique-se que está com o site Ice Casino aberto no navegador."
    }

@app.get("/get_message")
async def get_message_for_ahk():
    """Endpoint para o AHK buscar a mensagem pendente"""
    
    message = state.get_next_message()

    if message:
        # Calcula as duas variações
        try:
            processed_keep = process_text(message["original_text"], False)
        except Exception:
            processed_keep = message["processed_text"]

        use_remove = message.get("remove_cents", False)
        use_text = message["processed_text"] if use_remove else processed_keep

        return {
            "status": "has_message",
            "message": use_text,
            "timestamp": datetime.now().isoformat(),
            "original_text": message["original_text"],
            "remove_cents": use_remove,
            "processed_text": message["processed_text"],
            "processed_keep_cents": processed_keep,
            "queue_info": state.get_queue_info()
        }
    
    return {
        "status": "no_message", 
        "message": None,
        "queue_info": state.get_queue_info()
    }

@app.post("/message_processed")
async def message_processed(confirmation: dict = None):
    """Endpoint para o AHK confirmar que processou a mensagem"""
    success = confirmation.get("success", False) if confirmation else False
    processed_text = confirmation.get("processed_text", "") if confirmation else ""
    
    state.confirm_processing(success, processed_text)
    
    if success:
        return {
            "status": "confirmed",
            "message": "Processamento confirmado com sucesso"
        }
    else:
        return {
            "status": "failed",
            "message": "Processamento falhou - liberado para retry"
        }

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

@app.post("/focus_whatsapp")
async def focus_whatsapp():
    """Envia comando para a extensão focar no campo de input do WhatsApp Web"""
    try:
        return {
            "status": "focus_sent",
            "message": "Extensão foi solicitada a focar no campo de input",
            "timestamp": datetime.now().isoformat()
        }
    except Exception as e:
        return {
            "status": "error",
            "message": str(e)
        }

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

# ============================================================================
# ENDPOINTS DE LICENCIAMENTO
# ============================================================================

def get_licenses_from_jsonbin() -> dict:
    """Busca licenças do JSONBin"""
    try:
        response = requests.get(
            f"{JSONBIN_CONFIG['base_url']}/b/{JSONBIN_CONFIG['bin_id']}/latest",
            headers={"X-Master-Key": JSONBIN_CONFIG['api_key']},
            timeout=5
        )
        if response.status_code == 200:
            return response.json().get("record", {}).get("licenses", {})
        return {}
    except Exception as e:
        print(f"Erro ao buscar licenças: {e}")
        return {}

def update_licenses_in_jsonbin(licenses: dict) -> bool:
    """Atualiza licenças no JSONBin"""
    try:
        response = requests.put(
            f"{JSONBIN_CONFIG['base_url']}/b/{JSONBIN_CONFIG['bin_id']}",
            json={"licenses": licenses},
            headers={
                "X-Master-Key": JSONBIN_CONFIG['api_key'],
                "Content-Type": "application/json"
            },
            timeout=5
        )
        return response.status_code == 200
    except Exception as e:
        print(f"Erro ao atualizar licenças: {e}")
        return False

def validate_license_format(key: str) -> bool:
    """Valida formato da chave: BILI-30D-20260209-ABC123"""
    pattern = r'^BILI-\d+D-\d{8,12}-[A-F0-9]{8,12}$'
    return bool(re.match(pattern, key, re.IGNORECASE))

@app.post("/api/validate-license")
async def validate_license(request: Request):
    """Valida uma licença"""
    try:
        body = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="JSON inválido")
    
    license_key = body.get("licenseKey", "")
    hardware_id = body.get("hardwareId", "")
    
    if not license_key or not hardware_id:
        raise HTTPException(status_code=400, detail="licenseKey e hardwareId são obrigatórios")
    
    # Valida formato
    if not validate_license_format(license_key):
        return {
            "valid": False,
            "error": "Formato de licença inválido"
        }
    
    # Busca licenças
    licenses = get_licenses_from_jsonbin()
    license_data = licenses.get(license_key)
    
    if not license_data:
        return {
            "valid": False,
            "error": "License not found"
        }
    
    # Verifica status
    if license_data.get("status") == "revoked":
        return {
            "valid": False,
            "error": "License revoked",
            "status": "revoked"
        }
    
    # Verifica expiração
    expires_at = license_data.get("expiresAt", "")
    if expires_at:
        try:
            expiry_date = datetime.fromisoformat(expires_at.replace('Z', '+00:00'))
            if expiry_date < datetime.now():
                return {
                    "valid": False,
                    "error": "License expired",
                    "status": "expired"
                }
        except Exception:
            pass
    
    # Verifica hardware ID (vinculação de dispositivo)
    stored_hardware_id = license_data.get("hardwareId")
    
    if stored_hardware_id and stored_hardware_id != hardware_id:
        return {
            "valid": False,
            "error": "License already activated on another device"
        }
    
    # Primeira ativação - vincula ao dispositivo
    if not stored_hardware_id:
        licenses[license_key]["hardwareId"] = hardware_id
        licenses[license_key]["activatedAt"] = datetime.now().isoformat()
        update_licenses_in_jsonbin(licenses)
    
    # Licença válida
    return {
        "valid": True,
        "expiresAt": license_data.get("expiresAt"),
        "periodDays": license_data.get("periodDays", 30),
        "allowedProviders": license_data.get("allowedProviders", []),
        "status": license_data.get("status", "active")
    }

@app.post("/api/create-license")
async def create_license(request: Request):
    """Cria uma nova licença (admin only)"""
    # Verifica secret de admin
    secret_header = request.headers.get("X-Admin-Secret")
    
    if secret_header != ADMIN_SECRET:
        raise HTTPException(status_code=401, detail="Não autorizado")
    
    try:
        body = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="JSON inválido")
    
    license_key = body.get("licenseKey", "")
    period_days = body.get("periodDays", 30)
    allowed_providers = body.get("allowedProviders", ["brrbet", "icecassino"])
    
    if not license_key:
        raise HTTPException(status_code=400, detail="licenseKey é obrigatório")
    
    # Calcula data de expiração
    expires_at = (datetime.now() + timedelta(days=period_days)).isoformat()
    
    # Busca licenças existentes
    licenses = get_licenses_from_jsonbin()
    
    # Adiciona nova licença
    licenses[license_key] = {
        "key": license_key,
        "status": "active",
        "hardwareId": None,
        "expiresAt": expires_at,
        "periodDays": period_days,
        "allowedProviders": allowed_providers,
        "createdAt": datetime.now().isoformat()
    }
    
    # Salva no JSONBin
    if update_licenses_in_jsonbin(licenses):
        return {
            "success": True,
            "license": licenses[license_key]
        }
    else:
        raise HTTPException(status_code=500, detail="Erro ao salvar licença")

@app.get("/api/licenses")
async def list_licenses(request: Request):
    """Lista todas as licenças (admin only)"""
    # Verifica secret de admin
    secret_header = request.headers.get("X-Admin-Secret")
    
    if secret_header != ADMIN_SECRET:
        raise HTTPException(status_code=401, detail="Não autorizado")
    
    licenses = get_licenses_from_jsonbin()
    
    return {
        "total": len(licenses),
        "licenses": licenses
    }

@app.get("/api/license/{license_key}")
async def get_license_info(license_key: str, request: Request):
    """Consulta informações de uma licença (admin only)"""
    # Verifica secret de admin
    secret_header = request.headers.get("X-Admin-Secret")
    
    if secret_header != ADMIN_SECRET:
        raise HTTPException(status_code=401, detail="Não autorizado")
    
    licenses = get_licenses_from_jsonbin()
    license_data = licenses.get(license_key)
    
    if not license_data:
        raise HTTPException(status_code=404, detail="Licença não encontrada")
    
    return license_data

@app.post("/api/revoke-license")
async def revoke_license(request: Request):
    """Revoga uma licença (admin only)"""
    # Verifica secret de admin
    secret_header = request.headers.get("X-Admin-Secret")
    
    if secret_header != ADMIN_SECRET:
        raise HTTPException(status_code=401, detail="Não autorizado")
    
    try:
        body = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="JSON inválido")
    
    license_key = body.get("licenseKey", "")
    
    if not license_key:
        raise HTTPException(status_code=400, detail="licenseKey é obrigatório")
    
    licenses = get_licenses_from_jsonbin()
    
    if license_key not in licenses:
        raise HTTPException(status_code=404, detail="Licença não encontrada")
    
    licenses[license_key]["status"] = "revoked"
    licenses[license_key]["revokedAt"] = datetime.now().isoformat()
    
    if update_licenses_in_jsonbin(licenses):
        return {
            "success": True,
            "message": "Licença revogada com sucesso"
        }
    else:
        raise HTTPException(status_code=500, detail="Erro ao revogar licença")

if __name__ == "__main__":
    import uvicorn
    
    print(f"\n{'='*80}")
    print("🚀 SERVIDOR BRIDGE - VERSÃO 4.0 (SEM LOGS)")
    print(f"🌐 URL: http://{CONFIG['host']}:{CONFIG['port']}")
    print(f"{'='*80}\n")
    
    uvicorn.run(app, host=CONFIG["host"], port=CONFIG["port"], log_level="error")
