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
const KEY_INDICATOR_CLASS = 'instachorda-key-indicator';
const ATTR_BOUND = 'data-ic-bound';        // 어댑터가 추적중인 var
const ATTR_LAST_TEXT = 'data-ic-last';     // 직전 처리한 텍스트 (변경 감지용)

// chordscore.com 은 플랫/샾을 유니코드 기호로 렌더함. 파서가 이해할 수 있는
// ASCII b/# 로 정규화. 확인된 변형:
//   ♭ (U+266D) — 음악 기호 플랫
//   ᵇ (U+1D47) — MODIFIER LETTER SMALL B. chordscore 가 실제로 쓰는 위첨자 b
//   ♯ (U+266F) — 음악 기호 샤프
function normAccidentals(s) {
  return s.replace(/[♭ᵇ]/g, 'b').replace(/♯/g, '#');
}
function readText(el) {
  return normAccidentals(el.textContent);
}

// 표시 모드: 'both' | 'original-only' | 'kantan-only'
const DEFAULT_MODE = 'kantan-only';

// 현재 상태
const state = {
  mode: DEFAULT_MODE,
  userKey: null,   // 사용자 수동 지정 키 (null 이면 자동)
  detectedKey: null,
  observer: null,
};

// #note-container 는 SPA 네비게이션 때 교체될 수 있으므로,
// observer 는 그 위의 안정된 #root 를 감시한다.
function getScoreRoot() {
  return document.querySelector('#note-container') || document.body;
}
function getObserverRoot() {
  return document.getElementById('root') || document.body;
}

function collectChordVars() {
  const root = getScoreRoot();
  return Array.from(root.querySelectorAll('var'));
}

// 자동 키 감지 (multi-token <var> 도 토큰 단위로 풀어서 반영)
function autoDetect() {
  const tokens = [];
  for (const v of collectChordVars()) {
    const raw = readText(v).trim();
    if (!raw) continue;
    for (const t of raw.split(/\s+/)) if (t) tokens.push(t);
  }
  return detectKey(tokens);
}

function computeKey() {
  // 수동 지정 여부와 관계없이 자동 감지 결과는 항상 갱신 (표시용)
  state.detectedKey = autoDetect();
  return state.userKey || state.detectedKey;
}

// "Original key: X" 텍스트가 있는 요소를 찾음 (css-XXXX 해시 클래스는 불안정해서 텍스트로 찾음)
function findOriginalKeyEl() {
  const spans = document.querySelectorAll('span');
  for (const s of spans) {
    const t = s.textContent.trim();
    if (t.startsWith('Original key')) return s;
  }
  return null;
}

// 자동 감지된 KANTAN 키를 "Original key" 아래 줄에 표시
function updateKeyIndicator() {
  let indicator = document.querySelector(`.${KEY_INDICATOR_CLASS}`);
  if (!indicator) {
    const anchor = findOriginalKeyEl();
    if (!anchor) return;
    indicator = document.createElement('span');
    indicator.className = KEY_INDICATOR_CLASS;
    anchor.insertAdjacentElement('afterend', indicator);
  }
  const effective = state.userKey || state.detectedKey;
  const tag = state.userKey ? '수동' : '자동';
  const text = effective ? `KANTAN key: ${effective} (${tag})` : '';
  if (indicator.textContent !== text) indicator.textContent = text;
}

function ensureStyle() {
  if (document.getElementById('instachorda-style')) return;
  const s = document.createElement('style');
  s.id = 'instachorda-style';
  // KANTAN 배지는 DOM sibling 이 아닌 CSS ::after 로 구현.
  // (React 가 자기 트리 밖의 형제 요소를 re-render 시 청소하는 문제 회피)
  s.textContent = `
    #note-container var[data-kantan]:not([data-kantan=""])::after {
      content: attr(data-kantan);
      margin-left: 2px;
      padding: 0 4px;
      color: #22c55e;
      background: rgba(34, 197, 94, 0.14);
      border-radius: 3px;
      font-weight: 700;
      white-space: pre;          /* 원본의 여러 공백 보존 */
    }
    /* 모드: 기존 코드만 표시 -> ::after 숨김 */
    html[data-ic-mode="original-only"] #note-container var::after {
      display: none !important;
    }
    /* 모드: KANTAN 만 -> 원본 글자는 visibility:hidden 으로 폭만 유지,
       ::after 를 absolute 로 원본 자리에 덧그림 */
    html[data-ic-mode="kantan-only"] #note-container var {
      visibility: hidden;
      position: relative;
    }
    html[data-ic-mode="kantan-only"] #note-container var[data-kantan]:not([data-kantan=""])::after {
      visibility: visible;
      position: absolute;
      left: 0;
      top: 0;
      margin-left: 0;
      padding: 0;
      background: none;
    }
    /* "Original key" 아래 줄에 표시되는 감지 키 */
    .${KEY_INDICATOR_CLASS} {
      display: block;
      margin-top: 2px;
      color: #22c55e;
      font-weight: 600;
    }
  `;
  document.head.appendChild(s);
}

function applyMode() {
  document.documentElement.dataset.icMode = state.mode;
}

// data-kantan 속성만 관리. 실제 표시는 CSS ::after 가 attr(data-kantan) 을 읽어 수행.
function setBadge(varEl, badgeText) {
  if (!badgeText) {
    varEl.removeAttribute(ATTR_LAST_TEXT);
    varEl.removeAttribute(ATTR_BOUND);
    varEl.removeAttribute('data-kantan');
    return;
  }
  if (varEl.getAttribute('data-kantan') === badgeText) return;
  varEl.setAttribute(ATTR_LAST_TEXT, badgeText);
  varEl.setAttribute(ATTR_BOUND, '1');
  varEl.setAttribute('data-kantan', badgeText);
}

// "/G" 처럼 슬래시 베이스 단독 패턴
const SLASH_BASS_RE = /^\/([A-G][#b]?)$/;

// 여러 코드가 공백으로 이어진 텍스트를 공백은 그대로 두고 각 토큰만
// KANTAN 으로 치환. 실패한 토큰은 원본 유지. 한 개도 변환 못하면 null.
function translateTokensInPlace(text, key) {
  let out = '';
  let converted = false;
  let i = 0;
  while (i < text.length) {
    const ws = text.slice(i).match(/^\s+/);
    if (ws) { out += ws[0]; i += ws[0].length; continue; }
    const tk = text.slice(i).match(/^\S+/);
    if (!tk) break;
    const tok = tk[0];
    const k = toKantan(tok, key);
    if (k) { out += k; converted = true; } else { out += tok; }
    i += tok.length;
  }
  return converted ? out : null;
}

// 단일 토큰인지 (공백 없는지) 판단
function isSingleToken(text) {
  return !/\s/.test(text);
}

function renderBadges(key, vars) {
  for (let i = 0; i < vars.length; i++) {
    const v = vars[i];
    const raw = readText(v);
    const trimmed = raw.trim();
    if (!trimmed) { setBadge(v, null); continue; }

    // 단일 토큰 + 다음 var 가 "/X" 단독이면 슬래시 코드로 결합
    if (isSingleToken(trimmed)) {
      const next = vars[i + 1];
      const nextText = next ? readText(next).trim() : '';
      const slashMatch = nextText.match(SLASH_BASS_RE);
      if (slashMatch) {
        const combined = trimmed + '/' + slashMatch[1];
        setBadge(v, toKantan(combined, key));
        setBadge(next, null);
        i++;
        continue;
      }
      setBadge(v, toKantan(trimmed, key));
      continue;
    }

    // 멀티 토큰: 원본 공백을 그대로 유지하면서 토큰만 KANTAN 으로 치환
    setBadge(v, translateTokensInPlace(raw, key));
  }
}

let lastUrl = '';

function renderAll() {
  // SPA 네비게이션 감지: URL 이 바뀌면 새 곡으로 간주하고 userKey 를 Auto 로 리셋
  if (location.href !== lastUrl) {
    const first = lastUrl === '';
    lastUrl = location.href;
    if (!first && state.userKey) {
      resetUserKey();  // non-blocking, storage 이벤트로 다음 사이클에 반영됨
    }
  }

  // 자기가 만든 DOM 변경으로 MutationObserver 가 재호출되는 루프를 피하기 위해
  // 렌더링 동안은 observer 를 잠시 분리. 렌더 자체는 동기적으로 짧게 끝남.
  const obs = state.observer;
  if (obs) obs.disconnect();
  try {
    ensureStyle();
    applyMode();
    const vars = collectChordVars();
    if (vars.length === 0) return;
    const key = computeKey();
    updateKeyIndicator();
    if (!key) {
      console.warn(`${LOG} 키 감지 실패 — 변환 건너뜀`);
      return;
    }
    renderBadges(key, vars);
  } finally {
    if (obs) {
      obs.observe(getObserverRoot(), { childList: true, subtree: true, characterData: true });
    }
  }
}

function removeAll() {
  // 이전 버전에서 남아있을 수 있는 sibling span 정리 (현재는 ::after 로 대체됨)
  document.querySelectorAll(`.${KANTAN_CLASS}`).forEach(el => el.remove());
  document.querySelectorAll(`[${ATTR_BOUND}]`).forEach(el => {
    el.removeAttribute(ATTR_BOUND);
    el.removeAttribute(ATTR_LAST_TEXT);
    el.removeAttribute('data-kantan');
  });
}

// DOM 변화 관찰 — 전조/SPA 네비게이션/페이지 갱신 시 자동 재변환.
// #note-container 는 새 노래 로드 시 통째로 교체될 수 있으므로 상위 #root 를 감시.
function startObserver() {
  if (state.observer) return;
  let pending = false;
  state.observer = new MutationObserver(() => {
    if (pending) return;
    pending = true;
    queueMicrotask(() => {
      pending = false;
      renderAll();
    });
  });
  state.observer.observe(getObserverRoot(), { childList: true, subtree: true, characterData: true });
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

// chrome.storage 에서 mode 만 복원. userKey 는 페이지별로 초기화되므로 읽지 않음.
async function syncFromStorage() {
  try {
    const s = await chrome.storage.local.get(['mode']);
    if (VALID_MODES.has(s.mode)) state.mode = s.mode;
  } catch (e) {
    // storage 실패해도 기본값으로 계속
  }
}

// userKey 를 null(자동) 로 리셋 + 팝업에서도 Auto 로 보이도록 storage 정리
async function resetUserKey() {
  state.userKey = null;
  try {
    await chrome.storage.local.set({ userKey: null });
  } catch {}
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
  await resetUserKey();
  listenStorage();
  // 악보가 비동기 렌더될 수 있어서 첫 시도 후 observer 로 후속 대응
  renderAll();
  startObserver();
}
