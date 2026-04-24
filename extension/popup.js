// popup.js - chrome.storage.local 을 통해 content script 와 상태 공유

const SUPPORTED_KEYS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
const MODES = ['original-only', 'both', 'kantan-only'];
const MODE_LABEL = { 'original-only': '코드만', 'both': '코드+KANTAN', 'kantan-only': 'KANTAN만' };
const DEFAULT_MODE = 'kantan-only';

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

function highlightMode(mode) {
  const group = document.getElementById('modeGroup');
  for (const btn of group.querySelectorAll('button')) {
    btn.classList.toggle('active', btn.dataset.mode === mode);
  }
}

async function load() {
  const s = await chrome.storage.local.get(['mode', 'userKey']);
  const mode = MODES.includes(s.mode) ? s.mode : DEFAULT_MODE;
  const userKey = s.userKey || 'auto';
  highlightMode(mode);
  document.getElementById('keySelect').value = userKey;
  setStatus(`${MODE_LABEL[mode]} · 키: ${userKey}`);
}

document.addEventListener('DOMContentLoaded', async () => {
  populateKeys();
  await load();

  document.getElementById('modeGroup').addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-mode]');
    if (!btn) return;
    await chrome.storage.local.set({ mode: btn.dataset.mode });
    await load();
  });

  document.getElementById('keySelect').addEventListener('change', async (e) => {
    const v = e.target.value;
    await chrome.storage.local.set({ userKey: v === 'auto' ? null : v });
    await load();
  });
});
