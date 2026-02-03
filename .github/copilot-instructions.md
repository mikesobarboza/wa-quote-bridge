# Copilot Instructions for QR MK Codebase

## Architecture Overview

This is a **Chrome extension + Python FastAPI backend** system for automating WhatsApp QR code payments and IceCassino recharges.

### System Components

1. **Chrome Extension** (`QR MK/`)
   - **Manifest v3** with background service worker and content scripts
   - Targets: `web.whatsapp.com` (main), `icecassino.com` (recharges)
   - Key entry points: `background.js`, `content.js`, `betsite.js`, `recharge_handler.js`

2. **Python Backend** (`bridge_server.py`)
   - FastAPI server on `http://127.0.0.1:8788`
   - CORS enabled for extension communication
   - Integrates with IceCassino API via `icecassino_api.py`
   - Message queue with thread-safe locking (removes duplicates within 10s window)

3. **Token Flow**
   - Extension intercepts `/api/v1/user/recharge` POST requests
   - Extracts `token` header via `webRequest.onBeforeSendHeaders` (background.js)
   - Forwards to backend at `POST /api/icecassino_token`
   - Stored in `chrome.storage.local` for auto-recharges

## Critical Architecture Patterns

### Payment Method Specificity
- **Manual recharge**: Uses `cartbank` method + `type=0` + manual token
- **Auto-recharge**: Uses `uwin-bindcard500` method + `type=1` + different token
- ⚠️ **Tokens are payment-method-specific** - cannot reuse across methods

### Signature Calculation (Critical)
All recharge payloads require MD5-based signature. Pattern in `recharge_handler.js`:
```javascript
// Algorithm stored in chrome.storage.local
const signAlgo = 'sorted_raw_signkey'; // algorithm name
const secretValue = getSecretValue(signSecret, signKeyDefault, '', key, signSecretValue);
const bodyStr = buildSignString(signAlgo, formPayload, ...); // concatenated params
const sign = md5(secretValue + bodyStr); // or variations depending on algo
formPayload.sign = sign; // MUST be added to payload before sending
```

### Message Queue & Deduplication (backend)
- Messages tagged with `processed_text` (text after "qr" prefix removed)
- 10-second duplicate window: same processed text rejected within window
- Thread-safe locking prevents concurrent processing
- Lock timeout: 20s (failsafe for stuck messages)

## Key Files to Understand

| File | Purpose | Notes |
|------|---------|-------|
| `QR MK/background.js` | Token interception | webRequest hook for `/recharge` POST |
| `QR MK/betsite.js` | IceCassino main logic | Token storage, auto-recharge dispatcher |
| `QR MK/recharge_handler.js` | Auto-recharge processor | Sign calculation, payload formatting |
| `bridge_server.py` | API server | Message queue, WhatsApp integration |
| `icecassino_api.py` | IceCassino API client | Single endpoint: `icecassino_recharge()` |
| `API_DOC.md` | API reference | `/process` endpoint actions: `login`, `recarga` |

## Developer Workflows

### Starting the Backend
```batch
# Windows
python bridge_server.py
# or
iniciar_backend.bat
```
Backend listens on `http://127.0.0.1:8788`

### Extension Debugging
1. Go to `chrome://extensions/`
2. Enable Developer mode
3. Load unpacked → select `QR MK/` folder
4. Toggle extension with keyboard shortcut or menu
5. Open `F12` console on WhatsApp/IceCassino tabs for logs

### Testing Message Queue
```bash
# Get queue status
curl http://127.0.0.1:8788/queue

# Get full status
curl http://127.0.0.1:8788/status

# Clear queue
curl -X POST http://127.0.0.1:8788/clear
```

## Project-Specific Conventions

### Logging Style
All files use console.log with styled prefixes:
- `[WA-Bridge]` - WhatsApp content script
- `[BACKGROUND]` - Extension background.js
- `[RECHARGE]` - Auto-recharge handler
- `[BRIDGE]` - Python backend
- Colored output: `console.log('%c...', 'color: #hexcode; font-weight: bold;')`

### Configuration Storage
- **Frontend config**: `chrome.storage.sync` (cross-device sync)
  - `enabled` (bool), `endpoint`, `localSecret`, `debounceMs`, `minIntervalMs`
  - See DEFAULTS in `content.js`
- **Token storage**: `chrome.storage.local` (device-specific, fast)
  - `icecassino_token`, `icecassino_sign_algo`, `icecassino_recharge_template`

### Error Codes in IceCassino API Responses
```json
{ "status": 1, "message": "success" }          // ✅
{ "status": 0, "message": "error sign" }       // Sign hash invalid
{ "status": 0, "message": "error token" }      // Token invalid/expired
{ "status": 0, "message": "error user" }       // User not found
{ "status": 0, "message": "error amount" }     // Invalid amount
```

## Integration Points & External APIs

### IceCassino Endpoints
- **Recharge**: `https://d1yoh197nyhh3m.bzcfgm.com/api/v1/user/recharge`
  - Method: POST, form-urlencoded
  - Required: `uid`, `key`, `amount` (centavos), `sign`
  - Response: JSON with `status`, `message`, optional `data`

### Backend Endpoints
- `POST /api/icecassino_token` - Token ingestion
- `POST /process` - Direct action dispatch (login/recharge)
- `GET /status` - System status with queue info
- `GET /queue` - Queue details
- `POST /clear` - Clear message queue

## Common Debugging Patterns

### Token Not Being Captured
1. Open DevTools on IceCassino site during recharge
2. Check `background.js` console for "🎯 REQUISIÇÃO DE RECARGA INTERCEPTADA"
3. Verify `token` header is present (name case-sensitive: lowercase `token`)
4. If missing, check manifest.json host_permissions includes IceCassino domain

### "error sign" Response
1. Check `DEBUG_PAYLOAD_GUIDE.md` for expected payload structure
2. Verify `sign` field is present in payload before POST
3. Compare `signAlgo`, `secretValue`, and `bodyStr` in console logs
4. Ensure payment method matches: `uwin-bindcard500` for auto-recharge

### Duplicate Message Rejection
- Check `last_received_time` in backend logs
- If same text received within 10s window, it's silently rejected
- Look for `duplicates_rejected` counter in `/status` response

## Documentation Files
- `API_DOC.md` - IceCassino API specification
- `CRITICAL_TOKEN_FIX.md` - Payment method token mismatch issues
- `DEBUG_PAYLOAD_GUIDE.md` - Payload debugging checklist
- `DIAGNOSTICS.md` - System state inspection tools
