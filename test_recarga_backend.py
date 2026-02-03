# Teste de recarga manual via backend
# Este script simula o envio de uma mensagem de valor para o endpoint /process
# e espera a resposta do backend (como se fosse a extensão)

import requests

ENDPOINT = "http://127.0.0.1:8788/process"
SECRET = "troque-isto"

payload = {
    "text": "100,00",  # valor de teste
    "removeCents": False
}

headers = {
    "Content-Type": "application/json",
    "X-Local-Secret": SECRET
}

resp = requests.post(ENDPOINT, json=payload, headers=headers)
print("Status:", resp.status_code)
print("Resposta:", resp.json())
