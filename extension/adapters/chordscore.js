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
const PRINT_BTN_CLASS = 'instachorda-print-btn';
const ATTR_BOUND = 'data-ic-bound';        // 어댑터가 추적중인 var
const ATTR_LAST_TEXT = 'data-ic-last';     // 직전 처리한 텍스트 (변경 감지용)
const ATTR_PRINT_HIDE = 'data-ic-print-hide';  // 인쇄 시 숨길 형제 노드 표시
const ATTR_PRINT_KEEP = 'data-ic-print-keep';  // 인쇄 시 남길 악보 조상 체인 표시

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

// 악보 인쇄 버튼을 "Original key" / KANTAN key 표시 옆에 주입.
// (key-indicator 와 동일하게 매 renderAll 마다 누락 시 재주입 → React 가 지워도 자가 복구)
function ensurePrintButton() {
  if (document.querySelector(`.${PRINT_BTN_CLASS}`)) return;
  const anchor =
    document.querySelector(`.${KEY_INDICATOR_CLASS}`) || findOriginalKeyEl();
  if (!anchor) return;
  const btn = document.createElement('button');
  btn.className = PRINT_BTN_CLASS;
  btn.type = 'button';
  btn.textContent = '🖨 악보 인쇄';
  // 클릭 처리는 document 캡처 단계 위임(bindPrintDelegation)으로 함.
  // 버튼별 리스너는 React 가 노드를 교체할 때 유실되므로 쓰지 않는다.
  anchor.insertAdjacentElement('afterend', btn);
}

// 인쇄 버튼 클릭을 document 캡처 단계에서 위임 처리.
// - 캡처 단계라 chordscore(React) 가 bubble 에서 stopPropagation 해도 먼저 실행됨
// - 버튼 노드가 re-render 로 교체돼도 영향 없음 (한 번만 바인딩)
let printDelegationBound = false;
function bindPrintDelegation() {
  if (printDelegationBound) return;
  printDelegationBound = true;
  document.addEventListener(
    'click',
    (e) => {
      const t = e.target;
      const btn = t && t.closest ? t.closest(`.${PRINT_BTN_CLASS}`) : null;
      if (!btn) return;
      e.preventDefault();
      e.stopPropagation();
      doPrint();
    },
    true,
  );
}

// #note-container 의 조상 체인을 따라 올라가며 각 단계의 "형제" 노드에만
// 인쇄 숨김 속성을 건다. 결과적으로 악보를 감싼 경로만 남고 나머지(헤더/네비/
// 광고 등)는 인쇄에서 사라진다. visibility 트릭과 달리 빈 페이지가 생기지 않고
// 현재 표시 모드(var/::after 규칙)도 그대로 보존된다.
function markPrintHide() {
  let el = getScoreRoot();
  if (!el || el === document.body) return;  // 악보 컨테이너가 없으면 전체 인쇄
  el.setAttribute(ATTR_PRINT_KEEP, '');
  while (el && el.parentElement && el !== document.body) {
    const parent = el.parentElement;
    for (const sib of parent.children) {
      if (sib !== el) sib.setAttribute(ATTR_PRINT_HIDE, '');
    }
    parent.setAttribute(ATTR_PRINT_KEEP, '');  // 조상의 위쪽 여백 누적 제거용
    el = parent;
  }
}

function unmarkPrintHide() {
  document
    .querySelectorAll(`[${ATTR_PRINT_HIDE}], [${ATTR_PRINT_KEEP}]`)
    .forEach((e) => {
      e.removeAttribute(ATTR_PRINT_HIDE);
      e.removeAttribute(ATTR_PRINT_KEEP);
    });
}

// 악보의 마디 바는 다크 모드에서 '흰색 배경'으로 그려진 요소다(css-appem1 등).
// 흰 용지에 인쇄하면 흰 바가 묻혀 안 보이므로, 인쇄 직전 #note-container 안에서
// 배경이 흰색(에 가까운) 요소를 찾아 표시해두고 인쇄 CSS 가 회색으로 칠한다.
// (css-XXXX 해시 클래스는 빌드마다 바뀌므로 색으로 식별)
const ATTR_PRINT_BAR = 'data-ic-print-bar';
function tagWhiteBars() {
  const root = document.querySelector('#note-container');
  if (!root) return;
  for (const el of root.querySelectorAll('*')) {
    const bg = getComputedStyle(el).backgroundColor;
    const m = bg.match(/^rgba?\(([^)]+)\)/);
    if (!m) continue;
    const p = m[1].split(',').map((s) => parseFloat(s));
    const [r, g, b, a = 1] = p;
    if (a > 0 && r > 200 && g > 200 && b > 200) {
      el.setAttribute(ATTR_PRINT_BAR, '');
    }
  }
}
function untagWhiteBars() {
  document
    .querySelectorAll(`[${ATTR_PRINT_BAR}]`)
    .forEach((e) => e.removeAttribute(ATTR_PRINT_BAR));
}

// chordscore 악보는 가사가 고정 픽셀 폭(width="394") + 공백 span 으로 정렬돼 있어,
// 인쇄 용지 폭이 화면보다 좁으면 블록이 다르게 wrap 되며 가사가 꼬인다(확장 없이도 발생).
// 화면에서의 폭을 인쇄에서도 그대로 고정해 reflow 를 막고, zoom 으로 용지에 맞게 축소.
// (zoom 은 transform:scale 과 달리 다중 페이지 분할이 정상 동작)
const PRINT_TARGET_WIDTH = 700;  // A4/Letter 인쇄 가능 폭 근사 (px @96dpi, 우측 여유)
function scaleForPrint() {
  const root = document.querySelector('#note-container');
  if (!root) return;
  const w = root.offsetWidth;  // 화면 정상 레이아웃 폭 (DOM 변경 전에 측정)
  if (!w) return;
  root.style.setProperty('width', `${w}px`, 'important');
  root.style.setProperty('zoom', String(Math.min(1, PRINT_TARGET_WIDTH / w)), 'important');
}
function unscaleForPrint() {
  const root = document.querySelector('#note-container');
  if (!root) return;
  root.style.removeProperty('width');
  root.style.removeProperty('zoom');
}

// 인쇄 격리를 beforeprint/afterprint 에 연결.
// 우리 버튼뿐 아니라 브라우저 기본 인쇄(Ctrl+P)에서도 악보만 남도록 함
// (chordscore 의 '연주목록'/'전체악보' 행 등 페이지 크롬 제거).
// observer 는 attribute 변경을 감시하지 않으므로 렌더 루프를 유발하지 않음.
let printHooksBound = false;
function bindPrintHooks() {
  if (printHooksBound) return;
  printHooksBound = true;
  window.addEventListener('beforeprint', () => {
    scaleForPrint();  // 화면 폭 측정 후 고정 — DOM 숨김 전에 먼저
    markPrintHide();
    tagWhiteBars();
  });
  window.addEventListener('afterprint', () => {
    unscaleForPrint();
    unmarkPrintHide();
    untagWhiteBars();
  });
}

function doPrint() {
  // 실제 격리는 beforeprint 훅이 수행. 버튼은 인쇄 트리거 역할만.
  window.print();
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
    /* 악보 인쇄 버튼 */
    .${PRINT_BTN_CLASS} {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      margin-top: 6px;
      padding: 4px 10px;
      font-size: 12px;
      font-weight: 600;
      color: #fff;
      background: #22c55e;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      position: relative;     /* 다른 요소가 덮어 클릭이 막히지 않도록 */
      z-index: 2147483647;
      pointer-events: auto;
    }
    .${PRINT_BTN_CLASS}:hover { background: #16a34a; }

    /* === 인쇄 (악보만 깔끔하게) === */
    @media print {
      /* 2페이지 이후는 상단 여백 넉넉히(붙는 문제 방지).
         1페이지는 타이틀이 상단 공간을 채우므로 작게 — 안 그러면 첫 구절이
         page1 에 못 들어가 통째로 2페이지로 밀려남(break-inside:avoid) */
      @page { margin: 18mm 10mm 12mm; }
      @page :first { margin-top: 10mm; }
      /* 인쇄 직전 doPrint() 가 #note-container 조상 체인의 형제들에 표시한 속성 */
      [${ATTR_PRINT_HIDE}] { display: none !important; }
      /* 악보 조상 체인의 여백 제거 — 위쪽 누적 마진 + 좌측 들여쓰기(우측 잘림 유발) */
      html, body { margin: 0 !important; padding: 0 !important; height: auto !important; overflow: visible !important; }
      /* 고정 높이 스크롤 컨테이너(height:100vh; overflow:auto 등)가 악보를 1페이지로
         가두는 것을 해제 → 전체 내용이 흐르며 여러 페이지로 분할되게 함 */
      [${ATTR_PRINT_KEEP}] {
        margin: 0 !important;
        padding: 0 !important;
        height: auto !important;
        max-height: none !important;
        min-height: 0 !important;
        overflow: visible !important;
        position: static !important;
      }
      /* 인쇄 버튼만 제외. KANTAN key 표시는 Original key 옆에 함께 인쇄 */
      .${PRINT_BTN_CLASS} { display: none !important; }
      /* 악보의 마디 바 등 배경 그래픽도 인쇄되도록 강제.
         (크롬은 기본적으로 배경색/배경이미지를 인쇄에서 생략함)
         바가 #note-container 바깥 요소(예: css-appem1)일 수도 있어 전체에 적용 */
      *, *::before, *::after {
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }
      /* 악보 본문은 display:flex; flex-wrap:wrap 컨테이너인데, 크롬은 flex
         컨테이너를 페이지 경계에서 분할하지 못해 통째로 다음 페이지로 밀린다
         (긴 곡이 1페이지에 타이틀만 남는 원인). 줄바꿈 레이아웃은 유지하면서
         페이지 분할이 되도록 block + 자식 inline-block 으로 전환.
         (note-container 의 마지막 자식 = 본문, 해시 클래스 대신 구조로 타겟) */
      #note-container { display: block !important; }
      #note-container > *:last-child { display: block !important; }
      #note-container > *:last-child > * {
        display: inline-block !important;
        vertical-align: top !important;
      }
      /* 한 구절(코드+바+가사 묶음)이 페이지 경계에서 갈라지지 않게.
         chord-code-container 는 안정 클래스라 그 부모(스택)를 :has 로 특정 */
      #note-container *:has(> .chord-code-container) {
        break-inside: avoid !important;
        page-break-inside: avoid !important;
      }
      /* 다크 모드에서 흰 배경으로 그려진 마디 바 → 흰 용지에서 보이도록 회색으로 */
      [${ATTR_PRINT_BAR}] {
        background-color: #999 !important;
      }
      /* 잉크 절약: KANTAN 배지를 배경 없이 검은 글씨로 */
      #note-container var[data-kantan]:not([data-kantan=""])::after {
        color: #000 !important;
        background: none !important;
      }
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
    ensurePrintButton();
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
  bindPrintDelegation();
  bindPrintHooks();
  listenStorage();
  // 악보가 비동기 렌더될 수 있어서 첫 시도 후 observer 로 후속 대응
  renderAll();
  startObserver();
}
