/**
 * DEBUG_PAYLOAD.JS
 * 
 * Módulo de depuração detalhado para monitorar payloads de recarga
 * Injeta logs em pontos-chave do sistema
 */

console.log('[DEBUG PAYLOAD] Módulo carregado');

// Interceptor global para capturar dados de recarga
window.DEBUG_RECHARGE_DATA = {
    lastPayload: null,
    lastSign: null,
    lastToken: null,
    signCalculations: [],
    
    logPayload(data) {
        this.lastPayload = data;
        console.log('[DEBUG] 📋 PAYLOAD COMPLETO:');
        console.log('═'.repeat(80));
        console.table(data);
        console.log('═'.repeat(80));
        
        // Mostrar cada campo individualmente
        console.log('[DEBUG] 🔍 CAMPOS INDIVIDUAIS:');
        for (const [key, value] of Object.entries(data)) {
            console.log(`  ${key}: ${String(value).substring(0, 60)}`);
        }
    },
    
    logSignCalculation(algo, secret, secretValue, inputStr, output) {
        const calc = {
            algo,
            secret,
            secretValue: String(secretValue).substring(0, 20),
            inputLength: inputStr.length,
            inputPreview: inputStr.substring(0, 100),
            outputHash: output,
            timestamp: new Date().toLocaleTimeString()
        };
        
        this.signCalculations.push(calc);
        this.lastSign = output;
        
        console.log('[DEBUG] 🔐 CÁLCULO DE SIGN:');
        console.log('═'.repeat(80));
        console.log(`  Algoritmo: ${algo}`);
        console.log(`  Secret Name: ${secret}`);
        console.log(`  Secret Value: ${String(secretValue).substring(0, 40)}...`);
        console.log(`  Input String Length: ${inputStr.length}`);
        console.log(`  Input Preview: ${inputStr.substring(0, 100)}...`);
        console.log(`  Output Hash: ${output}`);
        console.log('═'.repeat(80));
    }
};

// Listener para mensagens do service worker
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'DEBUG_PAYLOAD_RECHARGE') {
        console.log('[DEBUG] 📨 RECEBIDO: Dados de recarga do service worker');
        window.DEBUG_RECHARGE_DATA.logPayload(message.data);
        
        sendResponse({ success: true });
    }
    
    if (message.type === 'DEBUG_SIGN_CALC') {
        console.log('[DEBUG] 📨 RECEBIDO: Cálculo de sign do recharge_handler');
        window.DEBUG_RECHARGE_DATA.logSignCalculation(
            message.algo,
            message.secret,
            message.secretValue,
            message.input,
            message.output
        );
        
        sendResponse({ success: true });
    }
});

// Comando para exportar dados de debug
window.exportDebugData = () => {
    const data = {
        lastPayload: window.DEBUG_RECHARGE_DATA.lastPayload,
        lastSign: window.DEBUG_RECHARGE_DATA.lastSign,
        signCalculations: window.DEBUG_RECHARGE_DATA.signCalculations
    };
    
    console.log('[DEBUG] 📤 EXPORTANDO DADOS:');
    console.log(JSON.stringify(data, null, 2));
    
    return data;
};

console.log('[DEBUG PAYLOAD] ✅ Pronto para capturar dados de recarga');
console.log('[DEBUG PAYLOAD] Use: window.exportDebugData() para exportar logs');
