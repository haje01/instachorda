// 표준 코드 -> KANTAN 숫자 표기 변환
//
// 규칙:
//   1) 기본 키 테이블의 슬롯(root + quality)이 정확히 일치하면 그 숫자
//   2) 근음 일치, 입력=minor / 슬롯=major 이면 숫자 + "~" (~ 는 대괄호 밖)
//   3) 근음 일치, 입력=major / 슬롯=minor 이고 수식어가 있으면 그냥 숫자
//      (수식어가 퀄리티 차이를 흡수)
//   4) 근음이 어느 슬롯에도 없으면 크로매틱:
//        - 입력보다 반음 위 슬롯이 있으면 그 슬롯 + [b]
//        - 없으면 입력보다 반음 아래 슬롯 + [#]
//   5) 수식어는 대괄호 [ ] 안. 크로매틱 기호와 결합하면 같은 대괄호에
//      (예: G키에서 Bb7 -> 3[b7])
//   6) 슬래시 코드는 각 파트를 변환 후 "/" 로 연결

import { parseChord } from './chord-parser.js';
import { getTable, semitoneOf, rootsEqualBySemi } from './kantan-tables.js';

// --- Instachord 연주용 코드 간략화 (항상 적용) ---
//
// Instachord 에서 실제로 누를 수 있는 표현은 한정적이다:
//   퀄리티: maj / min(~) / dim / aug,  수식어: 6, 7, maj7, 9, sus4,  크로매틱: b/#
// 그 밖의 복잡한 텐션·알터레이션(9 초과, b5/#5/b9/#9, add9, 11, 13 ...)은
// 성격을 최대한 보존하는 선에서 위 집합으로 축약한다.
//   - m7b5(하프디미니시드) 등 min+b5 계열 → dim 트라이어드
//   - dim/aug 에 붙은 수식어(dim7, aug7) → 트라이어드 dim/aug
//   - 도미넌트 계열(7 포함, 11/13, 알터레이션) → 7 (단, 단독 9 는 9 유지)
//   - maj 계열(maj7/maj9 ...) → maj7
//   - sus4 유지, 그 밖 sus(sus2 등) → 트라이어드
//   - 6 계열 → 6,  그 외(add9 등) → 트라이어드
function simplifyModifier(mod) {
  if (!mod) return '';
  if (/^maj/i.test(mod) || /^M7/.test(mod)) return 'maj7';
  if (/^sus4/.test(mod)) return 'sus4';
  if (/^sus/.test(mod)) return '';
  if (/^6/.test(mod)) return '6';
  if (mod === '9') return '9';
  if (mod.includes('7')) return '7';
  if (mod === '11' || mod === '13') return '7';
  return '';
}

function simplifyChord(p) {
  // 하프디미니시드(min + b5) 처리.
  //   - m7b5 (단7도 포함) → m7: b5 만 버리고 단3도+단7도를 보존. 실연주 시
  //     dim 트라이어드보다 잘 어울림 (예: E 키의 D#m7b5 → 7[7]).
  //   - 7 없는 드문 mb5 표기는 디미니시드 트라이어드로.
  if (p.quality === 'min' && /b5|-5/.test(p.modifier || '')) {
    if (/7/.test(p.modifier)) {
      return { root: p.root, quality: 'min', modifier: '7', bass: p.bass };
    }
    return { root: p.root, quality: 'dim', modifier: '', bass: p.bass };
  }
  // dim/aug 는 지원 퀄리티이므로 유지하되 붙은 수식어는 제거
  if (p.quality === 'dim' || p.quality === 'aug') {
    return { root: p.root, quality: p.quality, modifier: '', bass: p.bass };
  }
  return { root: p.root, quality: p.quality, modifier: simplifyModifier(p.modifier || ''), bass: p.bass };
}

function lookup(parsed, table) {
  let rootOnly = null;
  for (const [num, slot] of Object.entries(table)) {
    if (rootsEqualBySemi(slot.root, parsed.root)) {
      if (slot.quality === parsed.quality) return { num: String(num), kind: 'exact' };
      if (rootOnly === null) rootOnly = { num: String(num), slotQuality: slot.quality, kind: 'root-only' };
    }
  }
  return rootOnly;
}

// 입력 근음과 반음 관계인 슬롯 찾기.
// 우선순위: 반음 위 슬롯(입력은 그 슬롯의 b) > 반음 아래 슬롯(입력은 그 슬롯의 #)
function chromaticLookup(root, table) {
  const inputSemi = semitoneOf(root);
  if (inputSemi === undefined) return null;
  const above = (inputSemi + 1) % 12;
  const below = (inputSemi + 11) % 12;
  let belowMatch = null;
  for (const [num, slot] of Object.entries(table)) {
    const s = semitoneOf(slot.root);
    if (s === above) return { num: String(num), shift: 'b' };
    if (s === below && belowMatch === null) belowMatch = { num: String(num), shift: '#' };
  }
  return belowMatch;
}

function bassToKantan(bassRoot, table) {
  for (const [num, slot] of Object.entries(table)) {
    if (rootsEqualBySemi(slot.root, bassRoot)) return String(num);
  }
  const chroma = chromaticLookup(bassRoot, table);
  return chroma ? `${chroma.num}[${chroma.shift}]` : null;
}

export function toKantan(chordText, key) {
  const raw = parseChord(chordText);
  if (!raw) return null;
  const parsed = simplifyChord(raw);
  const table = getTable(key);
  if (!table) return null;

  let num = null;
  let swap = false;
  let shift = '';
  let qualityMod = '';   // dim/aug 같은 퀄리티가 수식어로 흡수될 때

  const isSus = parsed.modifier && parsed.modifier.startsWith('sus');

  const hit = lookup(parsed, table);
  if (hit && hit.kind === 'exact') {
    num = hit.num;
  } else if (hit && hit.kind === 'root-only') {
    num = hit.num;
    const inQ = parsed.quality;
    const slotQ = hit.slotQuality;
    const isMajMinFlip =
      (inQ === 'maj' && slotQ === 'min') ||
      (inQ === 'min' && slotQ === 'maj');
    if (isMajMinFlip) {
      // sus 수식어는 3도를 제거하므로 swap 불필요
      if (!isSus) swap = true;
    } else if (inQ === 'dim' || inQ === 'aug') {
      // 슬롯에 없는 퀄리티(dim/aug)는 수식어로 흡수
      qualityMod = inQ;
    } else {
      return null;
    }
  } else {
    const chroma = chromaticLookup(parsed.root, table);
    if (!chroma) return null;
    num = chroma.num;
    shift = chroma.shift;
    if (parsed.quality === 'min') swap = true;
    else if (parsed.quality === 'dim' || parsed.quality === 'aug') qualityMod = parsed.quality;
  }

  let out = num;
  if (swap) out += '~';
  const bracket = `${shift}${qualityMod}${parsed.modifier}`;
  if (bracket) out += `[${bracket}]`;

  if (parsed.bass) {
    const bassOut = bassToKantan(parsed.bass, table);
    out += bassOut ? `/${bassOut}` : `/${parsed.bass}`;
  }

  return out;
}
