// chordscore.com 어댑터
//
// 페이지 DOM 구조 (2026-04 분석 기준):
//   - 코드 루트 요소: <var> (예: <var class="css-1nqvwqf">C</var>)
//   - 악보 컨테이너: #note-container
//   - "Original key: X" 표시: <span class="css-yuhqz5">
// .css-XXXX 해시 클래스는 불안정하므로 <var> 태그 + #note-container 기준 셀렉터 사용.

import { toKantan } from '../lib/kantan-converter.js';
import { detectKey } from '../lib/key-detector.js';

const LOG = '[Instachorda/chordscore]';
const KANTAN_CLASS = 'instachorda-kantan';
const ATTR_BOUND = 'data-ic-bound';        // 어댑터가 추적중인 var
const ATTR_LAST_TEXT = 'data-ic-last';     // 직전 처리한 텍스트 (변경 감지용)

// 현재 상태
const state = {
  enabled: true,
  userKey: null,   // 사용자 수동 지정 키 (null 이면 자동)
  detectedKey: null,
  observer: null,
};

function getScoreRoot() {
  return document.querySelector('#note-container') || document.body;
}

function collectChordVars() {
  const root = getScoreRoot();
  return Array.from(root.querySelectorAll('var'));
}

function computeKey() {
  if (state.userKey) return state.userKey;
  const texts = collectChordVars().map(v => v.textContent.trim()).filter(Boolean);
  const k = detectKey(texts);
  state.detectedKey = k;
  return k;
}

function ensureStyle() {
  if (document.getElementById('instachorda-style')) return;
  const s = document.createElement('style');
  s.id = 'instachorda-style';
  s.textContent = `
    .${KANTAN_CLASS} {
      display: inline-block;
      margin-left: 2px;
      padding: 0 3px;
      font-size: 0.75em;
      color: #c0392b;
      background: rgba(192, 57, 43, 0.08);
      border-radius: 3px;
      font-weight: 600;
      vertical-align: baseline;
      user-select: none;
    }
    .${KANTAN_CLASS}.ic-hidden { display: none !important; }
  `;
  document.head.appendChild(s);
}

// 한 var 에 대해 KANTAN 라벨을 붙이거나 갱신
function renderOne(varEl, key) {
  const text = varEl.textContent.trim();
  if (!text) return;

  const last = varEl.getAttribute(ATTR_LAST_TEXT);
  let label = varEl.nextElementSibling;
  const hasLabel = label && label.classList && label.classList.contains(KANTAN_CLASS);

  // 텍스트 변화 없고 이미 라벨 있으면 스킵
  if (last === text && hasLabel) return;

  const kantan = toKantan(text, key);
  const display = kantan ?? '?';

  if (hasLabel) {
    label.textContent = display;
  } else {
    label = document.createElement('span');
    label.className = KANTAN_CLASS;
    label.textContent = display;
    varEl.after(label);
  }
  varEl.setAttribute(ATTR_LAST_TEXT, text);
  varEl.setAttribute(ATTR_BOUND, '1');
}

function renderAll() {
  if (!state.enabled) {
    hideAll();
    return;
  }
  ensureStyle();
  const key = computeKey();
  if (!key) {
    console.warn(`${LOG} 키 감지 실패 — 변환 건너뜀`);
    return;
  }
  const vars = collectChordVars();
  for (const v of vars) renderOne(v, key);
  // 보이도록
  document.querySelectorAll(`.${KANTAN_CLASS}.ic-hidden`).forEach(el => el.classList.remove('ic-hidden'));
}

function hideAll() {
  document.querySelectorAll(`.${KANTAN_CLASS}`).forEach(el => el.classList.add('ic-hidden'));
}

function removeAll() {
  document.querySelectorAll(`.${KANTAN_CLASS}`).forEach(el => el.remove());
  document.querySelectorAll(`[${ATTR_BOUND}]`).forEach(el => {
    el.removeAttribute(ATTR_BOUND);
    el.removeAttribute(ATTR_LAST_TEXT);
  });
}

// DOM 변화 관찰 — 전조/페이지 갱신 시 자동 재변환
function startObserver() {
  if (state.observer) return;
  const root = getScoreRoot();
  let pending = false;
  state.observer = new MutationObserver(() => {
    if (pending) return;
    pending = true;
    queueMicrotask(() => {
      pending = false;
      renderAll();
    });
  });
  state.observer.observe(root, { childList: true, subtree: true, characterData: true });
}

function stopObserver() {
  state.observer?.disconnect();
  state.observer = null;
}

// 외부 API (팝업 메시지에서 호출 가능)
export function setEnabled(on) {
  state.enabled = !!on;
  if (state.enabled) renderAll();
  else hideAll();
}

export function setKey(key) {
  state.userKey = key || null;
  removeAll();
  renderAll();
}

export function getStatus() {
  return {
    enabled: state.enabled,
    userKey: state.userKey,
    detectedKey: state.detectedKey,
    nodeCount: collectChordVars().length,
  };
}

// chrome.storage 에서 설정 읽고 변경 감지
async function syncFromStorage() {
  try {
    const s = await chrome.storage.local.get(['enabled', 'userKey']);
    if (typeof s.enabled === 'boolean') state.enabled = s.enabled;
    if (typeof s.userKey === 'string' || s.userKey === null) state.userKey = s.userKey || null;
  } catch (e) {
    // storage 권한 없거나 실패해도 기본값으로 계속
  }
}

function listenStorage() {
  chrome.storage?.onChanged?.addListener((changes, area) => {
    if (area !== 'local') return;
    let changed = false;
    if ('enabled' in changes) { state.enabled = !!changes.enabled.newValue; changed = true; }
    if ('userKey' in changes) { state.userKey = changes.userKey.newValue || null; changed = true; }
    if (changed) {
      removeAll();
      if (state.enabled) renderAll();
    }
  });
}

export async function init() {
  console.log(`${LOG} init`);
  await syncFromStorage();
  listenStorage();
  // 악보가 비동기 렌더될 수 있어서 첫 시도 후 observer 로 후속 대응
  renderAll();
  startObserver();
}
