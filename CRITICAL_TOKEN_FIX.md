# 🔴 CRITICAL FIX: Token + Sign Field Issue

## Root Cause Analysis

Your auto-recharge was failing with **"error sign"** instead of "error token". This means:

1. ✅ Token WAS being sent correctly
2. ❌ The payload was MISSING a "sign" field

## What Was Wrong

The auto-recharge payload was missing a **critical `sign` field** that is required by the API.

### Manual recharge request (WORKS):
```
uid=987535473&key=gsVuyPJt7DBJNbZGNXpP&amount=12200&pid=0&return_url=https://th.betbuzz.cc/PayBack/&pay_method=cartbank&type=0&[sign=CALCULATED_VALUE]
```

### Auto recharge request (FAILED with "error sign"):
```
uid=987535473&key=gsVuyPJt7DBJNbZGNXpP&amount=12200&pid=0&return_url=https://th.betbuzz.cc/PayBack/&pay_method=uwin-bindcard500&type=1&gear=2&_t=1769963348019&[MISSING SIGN FIELD]
```

## Solution Applied

✅ **recharge_handler.js was updated to:**
1. Calculate the `sign` field using MD5 + the correct algorithm
2. **ADD the `sign` field to the form payload** before sending

### New Code Added (lines ~110-130):
```javascript
// Calculate and add sign field to payload
let signAlgo = await chrome.storage.local.get(['icecassino_sign_algo', ...]);
const tempFormData = new URLSearchParams(formPayload);
const secretValue = getSecretValue(signSecret, signKeyDefault, '', formPayload.key, signSecretValue);
const sign = md5(buildSignString(signAlgo, formPayload, bodyStr, secretValue));

// ADD sign to payload BEFORE sending
formPayload.sign = sign;
const formData = new URLSearchParams(formPayload);
```

## CRITICAL ISSUE: Token Payment Method Mismatch

⚠️ **Your current token won't work for auto-recharge because:**

- **Captured token from:** `cartbank/type=0` (manual recharge)
- **Used for:** `uwin-bindcard500/type=1` (auto recharge)
- **Result:** API rejects it - tokens are **payment-method-specific**

## What You MUST Do Now

### Step 1: Reload Extension
1. Go to `chrome://extensions/`
2. Click the **Reload** button for QR MK extension

### Step 2: Capture Correct Token
1. Go to Ice Casino website
2. Use the same payment method as your auto-recharge (`uwin-bindcard500` or whatever you want to test)
3. Perform a **manual recharge** with this payment method
4. The extension will capture and store the token automatically

### Step 3: Test Auto-Recharge
1. After successful manual recharge, trigger the auto-recharge
2. Check console logs for:
   - ✅ Token found in storage
   - ✅ Sign field calculated and added
   - ✅ Payload has all required fields

## Expected Logs After Fix

```
[RECHARGE] 🔍 DIAGNÓSTICO DO PAYLOAD:
[RECHARGE]   Token: 4f33fc7ef8e2eb62...
[RECHARGE]   Pay method: uwin-bindcard500
[RECHARGE]   Type: 1
[RECHARGE]   Tem campo "sign"?: TRUE  ✅ (was FALSE before)
```

## How to Verify Success

When the fix works, you should see:
1. ✅ "Token encontrado em storage" 
2. ✅ "Sign field calculado e adicionado"
3. ✅ Payload includes `sign` field
4. ✅ Response: `{status: 1}` (success) instead of `{status: 0, message: 'error sign'}`

## Troubleshooting

### If still getting "error sign":
- Verify the `pay_method` and `type` match what you used for the manual recharge
- Try a different payment method for manual recharge
- Check browser console for any calculation errors

### If no token found:
- Manual recharge didn't capture the token properly
- Check if token is in chrome.storage.local (look for `icecassino_token` key)
- Try clearing storage and capturing again with `chrome.storage.local.clear()`

## Key Files Modified

- `recharge_handler.js` - Added sign field calculation and insertion (lines ~110-140)

---

**Status:** ✅ Code fix applied - Waiting for you to reload extension and test
