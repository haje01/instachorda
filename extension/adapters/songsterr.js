// songsterr.com 어댑터
//
// 페이지 DOM 구조 (2026-06 실측 기준):
//   - 코드는 가사 안에 인라인으로 배치됨. 각 코드는
//     <label data-chord="C"><span class="o2eIFa_middle">C</span></label> 형태.
//     코드명이 data-chord 속성에 그대로 담기므로 이것을 단일 진실 소스로 사용.
//   - 가사 줄(<p class="...line">)은 "It's [C]nine o'[G]clock" 처럼 코드 label 이
//     가사 텍스트 사이에 인라인으로 끼어든다. 모노스페이스 칸 정렬이 아니라
//     인라인 흐름이므로, KANTAN 은 코드 자리에 인라인 치환한다 (UG 처럼 절대 위치 불필요).
//   - 코드만 있는 줄(<p class="...plainLine">)도 같은 label 구조.
// 해시 클래스(o2eIFa_, JCGqHW_, ZQQn2G_)는 빌드마다 바뀌므로 의존 금지.
// 안정 훅은 label[data-chord] 뿐.
// 키는 자동 추론(detectKey)에 의존. 슬래시 베이스(C/G)도 한 label 에 통째로 담김.

import { toKantan } from '../lib/kantan-converter.js';
import { detectKey } from '../lib/key-detector.js';

const LOG = '[Instachorda/songsterr]';
const KANTAN_CLASS = 'instachorda-kantan';
const KEY_INDICATOR_CLASS = 'instachorda-key-indicator';
const ATTR_BOUND = 'data-ic-bound';        // 어댑터가 추적중인 코드 label
const ATTR_LAST_TEXT = 'data-ic-last';     // 직전 처리한 텍스트 (변경 감지용)

// songsterr 는 샾을 유니코드 ♯(U+266F) 로 렌더(예: F♯m). 파서가 이해할 ASCII 로 정규화.
//   ♭(U+266D), ᵇ(U+1D47 MODIFIER LETTER SMALL B), ♯(U+266F).
function normAccidentals(s) {
  return s.replace(/[♭ᵇ]/g, 'b').replace(/♯/g, '#');
}
// songsterr 는 코드명을 data-chord 속성에 담음. 없으면 textContent fallback.
function readText(el) {
  return normAccidentals(el.getAttribute('data-chord') || el.textContent);
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

function getScoreRoot() {
  return document.body;
}
function getObserverRoot() {
  return document.body;
}

function collectChordVars() {
  return Array.from(getScoreRoot().querySelectorAll('label[data-chord]'));
}

// 자동 키 감지
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

// 곡 제목 h1 을 키 인디케이터 앵커로 사용
function findKeyAnchorEl() {
  return document.querySelector('h1');
}

// 자동 감지된 KANTAN 키를 곡 제목 아래 줄에 표시
function updateKeyIndicator() {
  let indicator = document.querySelector(`.${KEY_INDICATOR_CLASS}`);
  if (!indicator) {
    const anchor = findKeyAnchorEl();
    if (!anchor) return;
    indicator = document.createElement('div');
    indicator.className = KEY_INDICATOR_CLASS;
    // h1 은 flex 컨테이너라 자식으로 넣으면 제목 옆에 인라인으로 붙음.
    // 블록 div 를 h1 바로 뒤에 두어 제목 아래 줄에 표시.
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
  // songsterr 는 코드가 가사 인라인이라 절대 위치 없이 인라인 치환으로 충분.
  s.textContent = `
    label[data-chord][data-kantan]:not([data-kantan=""])::after {
      content: attr(data-kantan);
      margin-left: 2px;
      padding: 0 3px;
      color: #15803d;            /* 흰 배경이라 어두운 초록 */
      opacity: 1;
      background: rgba(21, 128, 61, 0.12);
      border-radius: 3px;
      font-weight: 700;
    }
    /* 모드: 기존 코드만 표시 -> ::after 숨김 */
    html[data-ic-mode="original-only"] label[data-chord]::after {
      display: none !important;
    }
    /* 모드: KANTAN 만 -> 원본 코드 label 의 박스(코드 행 높이)는 유지(visibility:hidden)하고
       ::after 를 absolute 로 그 자리에 덧그림. label > span 을 display:none 으로 지우면
       코드 행 높이가 사라져 KANTAN 이 가사 줄로 내려앉아 겹치므로 이 방식을 씀. */
    html[data-ic-mode="kantan-only"] label[data-chord] {
      visibility: hidden;
      position: relative;
    }
    html[data-ic-mode="kantan-only"] label[data-chord][data-kantan]:not([data-kantan=""])::after {
      visibility: visible;
      position: absolute;
      left: 0;
      top: 0;
      margin-left: 0;
      padding: 0;
      background: none;
      white-space: nowrap;
    }
    /* 곡 제목 아래 줄에 표시되는 감지 키 */
    .${KEY_INDICATOR_CLASS} {
      display: block;
      margin-top: 2px;
      color: #15803d;
      font-weight: 600;
      font-size: 0.85em;
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

function renderBadges(key, vars) {
  for (const v of vars) {
    const trimmed = readText(v).trim();
    // songsterr 는 label 당 코드 하나(슬래시 베이스도 한 토큰)이므로 단순 변환.
    setBadge(v, trimmed ? toKantan(trimmed, key) : null);
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
  // 렌더링 동안은 observer 를 잠시 분리.
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
  document.querySelectorAll(`.${KANTAN_CLASS}`).forEach(el => el.remove());
  document.querySelectorAll(`[${ATTR_BOUND}]`).forEach(el => {
    el.removeAttribute(ATTR_BOUND);
    el.removeAttribute(ATTR_LAST_TEXT);
    el.removeAttribute('data-kantan');
  });
}

// DOM 변화 관찰 — 새 곡 로드/페이지 갱신 시 자동 재변환.
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
  renderAll();
  startObserver();
}
