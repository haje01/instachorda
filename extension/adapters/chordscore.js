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

// 표시 모드: 'both' | 'original-only' | 'kantan-only'
const DEFAULT_MODE = 'both';

// 현재 상태
const state = {
  mode: DEFAULT_MODE,
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
      padding: 0 4px;
      font-size: 0.9em;
      color: #22c55e;
      background: rgba(34, 197, 94, 0.14);
      border-radius: 3px;
      font-weight: 700;
      vertical-align: baseline;
      user-select: none;
    }
    /* 모드: 기존 코드만 표시 -> KANTAN 배지 숨김 */
    html[data-ic-mode="original-only"] .${KANTAN_CLASS} { display: none !important; }
    /* 모드: KANTAN 만 표시 -> 원본 <var> 숨김 + 배지 간격 제거 */
    html[data-ic-mode="kantan-only"] #note-container var { display: none !important; }
    html[data-ic-mode="kantan-only"] .${KANTAN_CLASS} { margin-left: 0; }
  `;
  document.head.appendChild(s);
}

function applyMode() {
  document.documentElement.dataset.icMode = state.mode;
}

// 한 var 에 대해 KANTAN 라벨을 붙이거나 갱신.
// chordText 는 실제 변환에 쓸 "결합된 코드 텍스트" (슬래시 베이스가 다른 var 에 있을 때 합쳐진 값).
function renderOne(varEl, chordText, key) {
  let label = varEl.nextElementSibling;
  const hasLabel = label && label.classList && label.classList.contains(KANTAN_CLASS);
  const kantan = toKantan(chordText, key);

  if (kantan === null) {
    if (hasLabel) label.remove();
    varEl.removeAttribute(ATTR_LAST_TEXT);
    varEl.removeAttribute(ATTR_BOUND);
    return;
  }

  const last = varEl.getAttribute(ATTR_LAST_TEXT);
  if (last === chordText && hasLabel) return;

  if (hasLabel) {
    label.textContent = kantan;
  } else {
    label = document.createElement('span');
    label.className = KANTAN_CLASS;
    label.textContent = kantan;
    varEl.after(label);
  }
  varEl.setAttribute(ATTR_LAST_TEXT, chordText);
  varEl.setAttribute(ATTR_BOUND, '1');
}

function clearBadge(varEl) {
  const label = varEl.nextElementSibling;
  if (label && label.classList && label.classList.contains(KANTAN_CLASS)) label.remove();
  varEl.removeAttribute(ATTR_LAST_TEXT);
  varEl.removeAttribute(ATTR_BOUND);
}

// "/G" 처럼 슬래시 베이스 단독 패턴
const SLASH_BASS_RE = /^\/([A-G][#b]?)$/;

function renderAll() {
  ensureStyle();
  applyMode();
  // 'original-only' 여도 배지를 만들어두면 토글 시 즉시 보이므로 항상 생성
  const key = computeKey();
  if (!key) {
    console.warn(`${LOG} 키 감지 실패 — 변환 건너뜀`);
    return;
  }
  const vars = collectChordVars();

  // 다음 var 가 "/X" 패턴이면 현재 var 와 결합해 하나의 슬래시 코드로 처리.
  // 이 경우 뒤 var 에는 배지를 붙이지 않음(원본 "/X" 는 그대로 보이게 둠).
  for (let i = 0; i < vars.length; i++) {
    const v = vars[i];
    const text = v.textContent.trim();
    if (!text) { clearBadge(v); continue; }

    const next = vars[i + 1];
    const nextText = next ? next.textContent.trim() : '';
    const slashMatch = nextText.match(SLASH_BASS_RE);

    if (slashMatch) {
      const combined = text + '/' + slashMatch[1];
      renderOne(v, combined, key);
      clearBadge(next);
      i++; // 다음 var 는 이미 처리됨
    } else {
      renderOne(v, text, key);
    }
  }
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

// 외부 API
export function setMode(mode) {
  state.mode = mode || DEFAULT_MODE;
  applyMode();
}

export function setKey(key) {
  state.userKey = key || null;
  removeAll();
  renderAll();
}

export function getStatus() {
  return {
    mode: state.mode,
    userKey: state.userKey,
    detectedKey: state.detectedKey,
    nodeCount: collectChordVars().length,
  };
}

const VALID_MODES = new Set(['both', 'original-only', 'kantan-only']);

// chrome.storage 에서 설정 읽고 변경 감지
async function syncFromStorage() {
  try {
    const s = await chrome.storage.local.get(['mode', 'userKey']);
    if (VALID_MODES.has(s.mode)) state.mode = s.mode;
    if (typeof s.userKey === 'string' || s.userKey === null) state.userKey = s.userKey || null;
  } catch (e) {
    // storage 권한 없거나 실패해도 기본값으로 계속
  }
}

function listenStorage() {
  chrome.storage?.onChanged?.addListener((changes, area) => {
    if (area !== 'local') return;
    if ('mode' in changes) {
      const v = changes.mode.newValue;
      state.mode = VALID_MODES.has(v) ? v : DEFAULT_MODE;
      applyMode();
    }
    if ('userKey' in changes) {
      state.userKey = changes.userKey.newValue || null;
      removeAll();
      renderAll();
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
