const DEFAULTS = {
  endpoint: "http://127.0.0.1:8788/process",
  localSecret: "troque-isto",
  debounceMs: 250,
  minIntervalMs: 900,
  pixMode: 'text'
};

const $ = (id) => document.getElementById(id);

async function load() {
  const cfg = await chrome.storage.sync.get(DEFAULTS);
  $("endpoint").value = cfg.endpoint;
  $("secret").value = cfg.localSecret;
  $("debounceMs").value = String(cfg.debounceMs);
  $("minIntervalMs").value = String(cfg.minIntervalMs);
  $("pixMode").value = cfg.pixMode || 'text';
}

async function save() {
  await chrome.storage.sync.set({
    endpoint: $("endpoint").value.trim(),
    localSecret: $("secret").value.trim(),
    debounceMs: Math.max(0, parseInt($("debounceMs").value || "250", 10)),
    minIntervalMs: Math.max(0, parseInt($("minIntervalMs").value || "900", 10)),
    pixMode: $("pixMode").value || 'text'
async function test() {
  const cfg = await chrome.storage.sync.get(DEFAULTS);
  const r = await fetch(cfg.endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Local-Secret": cfg.localSecret || ""
    },
    body: JSON.stringify({ group: "TESTE", author: "EXT", text: "Teste extensão (citação)" })
  });
  $("out").textContent = `HTTP ${r.status}\n` + (await r.text());
}

$("save").addEventListener("click", save);
$("test").addEventListener("click", test);
load();
