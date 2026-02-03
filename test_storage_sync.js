// ========================================
// TESTE RÁPIDO DE STORAGE SYNC
// ========================================
// Cole este código no console do DevTools (F12)

(async function testarStorageSync() {
    console.log('🔍 TESTE DE SINCRONIZAÇÃO DE STORAGE');
    console.log('═'.repeat(80));
    
    // 1. Verificar localStorage
    const localStorageToken = localStorage.getItem('icecassino_token');
    console.log('1️⃣ localStorage token:', localStorageToken || '❌ VAZIO');
    
    // 2. Verificar chrome.storage.local (via background/service worker)
    // Como não podemos acessar diretamente, vamos simular o salvamento
    
    console.log('\n📝 Salvando token de teste em chrome.storage.local...');
    const testToken = localStorageToken || '4f33fc7ef8e2eb6219f8bfa75fa1d87f';
    
    // Enviar mensagem para betsite.js salvar
    window.postMessage({
        type: 'FORCE_SAVE_TOKEN',
        token: testToken,
        source: 'manual_test'
    }, '*');
    
    console.log('✅ Comando enviado!');
    console.log('\n📋 PRÓXIMOS PASSOS:');
    console.log('1. Aguarde 1 segundo');
    console.log('2. Verifique os logs para confirmar:');
    console.log('   - "[ICE] ✅ Token salvo em chrome.storage.local com sucesso!"');
    console.log('3. Faça uma recarga automática e veja se pega o token');
    console.log('═'.repeat(80));
})();

// ========================================
// FORÇAR SALVAMENTO DO TOKEN ATUAL
// ========================================
// Se você já tem um token em localStorage, execute:

window.forceSaveTokenToStorage = function() {
    const token = localStorage.getItem('icecassino_token');
    if (!token) {
        console.error('❌ Nenhum token em localStorage!');
        return;
    }
    
    console.log('💾 Forçando salvamento do token:', token.substring(0, 20) + '...');
    
    // Disparar evento como se fosse uma captura nova
    window.postMessage({
        type: 'ICE_RECHARGE_TOKEN',
        token: token,
        url: 'manual_force',
        source: 'manual_force'
    }, '*');
    
    console.log('✅ Token enviado para re-processar e salvar!');
};

console.log('✅ Funções de teste carregadas!');
console.log('Execute: window.forceSaveTokenToStorage() para forçar salvamento');
