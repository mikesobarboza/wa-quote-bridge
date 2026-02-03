# Ice Casino Signature Algorithm Investigation

## Problem Status

**Current Issue**: `{"status":0,"message":"error sign","data":[]}`

The backend is successfully reaching Ice Casino's API (HTTP 200), but the signature validation is failing. This document outlines what we know and what we need to do.

---

## Root Cause Analysis

### What We Know ✅

1. **Token Capture**: Working perfectly
   - Tokens are being intercepted from XHR headers
   - 32-char hex format is correct
   - Stored properly in storage

2. **Credentials**: Correctly extracted
   - `uid`: 987535473
   - `key`: NaGT6y4JFnsHweFMpC9c
   - Both confirmed during interception

3. **Parameters**: All correct
   ```
   uid=987535473
   key=NaGT6y4JFnsHweFMpC9c
   amount=245698
   pid=0
   return_url=https://th.betbuzz.cc/PayBack/
   pay_method=cartbank
   type=0
   ```

4. **HTTP Status**: 200 (request succeeds technically)

5. **Error Response**: Consistent "error sign" rejection
   - Not a network error
   - Not a parameter order issue
   - Specifically a signature validation failure

### What We Tried ❌

**238 different signature algorithms tested:**
- Sorted parameters (raw)
- Sorted parameters (URL-encoded)
- Different secret sources (sign_key, header_key, none)
- Token + sorted string combinations
- Variations of prefix/suffix orders
- Different field selections
- Various concatenation patterns

**None of the 238 candidates matched Ice Casino's expected signature.**

### What We DON'T Know ❓

1. **The actual signature algorithm used by Ice Casino**
   - Is there a server-side salt?
   - Is there a version-specific algorithm?
   - Is there a dynamic component (timestamp, nonce)?
   - Are there hidden fields we're not seeing?

2. **Whether cookies are required**
   - Logs show: `⚠️ SEM cookies - pode falhar!`
   - Chrome sandbox prevents content script cookie access
   - This is a LIKELY major blocker

3. **The payment-method-specific variations**
   - Different payment methods might use different sign algorithms
   - We only tested with `cartbank`

---

## Cookies Problem (NEW DISCOVERY)

**The REAL blocker might be missing cookies, not the signature:**

```
[BRIDGE] ⚠️ SEM cookies - pode falhar!
```

### Why Cookies Are Missing:

Chrome content scripts cannot access `document.cookie` due to sandbox isolation. The previous fix attempt to capture cookies from XHR headers didn't work because:

1. XHR `setRequestHeader` is called in the main world (betsite.js isolated world)
2. Chrome isolation prevents accessing those captured values from content.js
3. The Cookie header is added by the browser AFTER our script runs

### Solution Needed:

Ice Casino likely validates requests via:
1. **Headers**: `token` + `key` ✅ (we have these)
2. **Cookies**: Session validation ❌ (we can't get these from content script)
3. **Body**: Parameters + signature ❓ (signature unknown)

If Ice Casino checks:
```
if (!has_valid_cookies) return "error" // even if sign is correct
```

Then **we can never succeed without cookies**.

---

## Recommended Next Steps

### Option 1: Extract Signature from Browser's Actual Request (RECOMMENDED)

1. **Make a REAL recharge in Ice Casino browser** (the one that works)
2. **Intercept the exact request being sent**:
   - Use DevTools Network tab
   - Get the EXACT sign value being sent
   - Document all headers and body parameters
3. **Reverse-engineer from known good example**:
   - We have the inputs (uid, key, amount, etc.)
   - We have the output (the sign value)
   - Test different algorithms against this known pair

**This is the ONLY reliable way to find the algorithm.**

### Option 2: Add Background Script Cookie Access

1. **Use background script instead of content script**
   - Background scripts CAN access cookies via `chrome.cookies` API
   - Add `"cookies"` permission in manifest.json
   - Fetch cookies before sending recharge request
   - Pass them to backend

### Option 3: Investigate Ice Casino's JavaScript

1. **Look for sign function in page JavaScript**:
   ```javascript
   // In DevTools console:
   window.md5  // Does it exist?
   window.sign // Does it exist?
   // Look in window object for any crypto/hash functions
   ```

2. **Search in minified code**:
   - The sign algorithm might be embedded in Ice Casino's JS
   - Look for MD5, CryptoJS, or other hash libraries
   - Search for strings like "sign", "key", "secret" in sources

---

## Current Logs Reference

**From your latest test run:**

```
[BRIDGE] 🎯 Iniciando recarga - UID: 987535473, Amount: 245698.0
[BRIDGE] 🔐 Testando: amount=245698&key=... → a2364f456008205269a76b3d8c8c3b1b
[BRIDGE] ✅ Sign selecionado: a2364f456008205269a76b3d8c8c3b1b
[BRIDGE] ⚠️ SEM cookies - pode falhar!
[BRIDGE] ✅ Status: 200
[BRIDGE] 📥 Response: {"status":0,"message":"error sign","data":[]}
```

**Key observation**: The backend is choosing a signature, sending it, and Ice Casino is rejecting it. This means:
- The signature format is correct (32-char hex)
- The signature value is WRONG
- Ice Casino has the correct algorithm server-side

---

## How to Provide Solution

When you make a REAL Ice Casino recharge that WORKS in the browser:

1. **Right-click the request** → Copy as cURL
2. **Paste it here** or show:
   - Request headers (including token, key, cookies)
   - Request body (full parameter string)
   - The **sign value** being sent
   - The response (should be success)

Example:
```
Request Headers:
token: 9dfa0bf525caa0025bc8a5363275e535
key: NaGT6y4JFnsHweFMpC9c
Cookie: PHPSESSID=abc123; session_id=xyz789

Request Body:
uid=987535473&key=NaGT6y4JFnsHweFMpC9c&amount=245698&pid=0&return_url=...&pay_method=cartbank&type=0&sign=ACTUAL_WORKING_SIGN_VALUE

Response:
{"status":1,"message":"success",...}
```

With this information, we can work backwards to find the algorithm.

---

## Implementation Progress

- ✅ Token capture and storage
- ✅ Credential extraction (uid, key)
- ✅ Backend API connectivity
- ✅ Parameter formatting
- ❌ **Signature validation** ← BLOCKING
- ❌ **Cookie transmission** ← LIKELY BLOCKING
- ❌ PIX code extraction (blocked by signature issue)
- ❌ WhatsApp integration (blocked by signature issue)

**Status**: 50% complete - stuck on authentication layer

---

## Hypothesis: The Real Problem

Ice Casino's server-side validation likely works like this:

```python
def validate_recharge(request):
    # Check 1: Authenticate via cookies
    if not has_valid_session_cookies(request.cookies):
        return {"status": 0, "message": "error sign"}  # Misleading error!
    
    # Check 2: Verify signature
    if not verify_signature(request.params, request.headers['token']):
        return {"status": 0, "message": "error sign"}
    
    # Check 3: Process recharge
    return process_payment(...)
```

**That "error sign" response might actually be hiding a cookie validation failure!**

This would explain why:
1. We're always getting "error sign" (not a different error)
2. None of the 238 algorithms work (it's not even checking the sign)
3. The request reaches the server (HTTP 200, not 401/403)

---

## Next Actions

1. **Test with real browser recharge**
2. **Capture working sign value**
3. **Add background script for cookie access**
4. **Implement reverse-engineered algorithm**

Until we solve this, the automation cannot complete the recharge flow.
