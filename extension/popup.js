// popup.js - chrome.storage.local 을 통해 content script 와 상태 공유

const SUPPORTED_KEYS = ['C', 'G', 'D', 'A', 'E', 'F', 'Bb', 'Eb'];

function populateKeys() {
  const sel = document.getElementById('keySelect');
  for (const k of SUPPORTED_KEYS) {
    const opt = document.createElement('option');
    opt.value = k;
    opt.textContent = k;
    sel.appendChild(opt);
  }
}

function setStatus(msg) {
  document.getElementById('status').textContent = msg;
}

async function load() {
  const s = await chrome.storage.local.get(['enabled', 'userKey']);
  const enabled = s.enabled !== false; // 기본 on
  const userKey = s.userKey || 'auto';
  document.getElementById('keySelect').value = userKey === null ? 'auto' : userKey;
  document.getElementById('toggleBtn').textContent = enabled ? 'KANTAN 병기 OFF 로' : 'KANTAN 병기 ON 으로';
  setStatus(enabled ? `활성 · 키: ${userKey}` : '비활성');
}

async function saveEnabled(v) {
  await chrome.storage.local.set({ enabled: v });
}

async function saveKey(v) {
  await chrome.storage.local.set({ userKey: v === 'auto' ? null : v });
}

document.addEventListener('DOMContentLoaded', async () => {
  populateKeys();
  await load();

  document.getElementById('toggleBtn').addEventListener('click', async () => {
    const s = await chrome.storage.local.get(['enabled']);
    const next = !(s.enabled !== false);
    await saveEnabled(next);
    await load();
  });

  document.getElementById('keySelect').addEventListener('change', async (e) => {
    await saveKey(e.target.value);
    await load();
  });
});
