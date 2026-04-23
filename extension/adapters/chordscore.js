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

// badgeText 를 var 다음에 붙이거나 갱신. null/빈 문자열이면 배지 제거.
function setBadge(varEl, badgeText) {
  let label = varEl.nextElementSibling;
  const hasLabel = label && label.classList && label.classList.contains(KANTAN_CLASS);

  if (!badgeText) {
    if (hasLabel) label.remove();
    varEl.removeAttribute(ATTR_LAST_TEXT);
    varEl.removeAttribute(ATTR_BOUND);
    return;
  }

  if (hasLabel) {
    if (label.textContent !== badgeText) label.textContent = badgeText;
  } else {
    label = document.createElement('span');
    label.className = KANTAN_CLASS;
    label.textContent = badgeText;
    varEl.after(label);
  }
  varEl.setAttribute(ATTR_LAST_TEXT, badgeText);
  varEl.setAttribute(ATTR_BOUND, '1');
}

// "/G" 처럼 슬래시 베이스 단독 패턴
const SLASH_BASS_RE = /^\/([A-G][#b]?)$/;

// var 텍스트를 코드 토큰으로 분해. chordscore.com 에서 한 var 에 여러 코드가
// 공백으로 들어있는 경우가 있어서 이를 분리.
function tokenize(text) {
  return text.split(/\s+/).filter(Boolean);
}

function renderAll() {
  ensureStyle();
  applyMode();
  const key = computeKey();
  if (!key) {
    console.warn(`${LOG} 키 감지 실패 — 변환 건너뜀`);
    return;
  }
  const vars = collectChordVars();

  for (let i = 0; i < vars.length; i++) {
    const v = vars[i];
    const text = v.textContent.trim();
    if (!text) { setBadge(v, null); continue; }

    const tokens = tokenize(text);

    // 단일 토큰 + 다음 var 가 "/X" 단독이면 슬래시 코드로 결합
    if (tokens.length === 1) {
      const next = vars[i + 1];
      const nextText = next ? next.textContent.trim() : '';
      const slashMatch = nextText.match(SLASH_BASS_RE);
      if (slashMatch) {
        const combined = tokens[0] + '/' + slashMatch[1];
        const kantan = toKantan(combined, key);
        setBadge(v, kantan);
        setBadge(next, null);
        i++;
        continue;
      }
    }

    // 토큰별로 변환 후 공백으로 연결. 변환 불가 토큰은 조용히 스킵
    // (코드가 아닌 텍스트인 경우에 대응).
    const parts = tokens.map(t => toKantan(t, key)).filter(k => k !== null);
    setBadge(v, parts.length > 0 ? parts.join(' ') : null);
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
