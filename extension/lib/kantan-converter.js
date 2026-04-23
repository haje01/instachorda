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
  const parsed = parseChord(chordText);
  if (!parsed) return null;
  const table = getTable(key);
  if (!table) return null;

  let num = null;
  let swap = false;
  let shift = '';

  const hit = lookup(parsed, table);
  if (hit && hit.kind === 'exact') {
    num = hit.num;
  } else if (hit && hit.kind === 'root-only') {
    num = hit.num;
    if (parsed.quality === 'min' && hit.slotQuality === 'maj') {
      swap = true;
    } else if (parsed.quality === 'maj' && hit.slotQuality === 'min' && parsed.modifier) {
      // 수식어가 퀄리티 차이 흡수
    } else {
      return null;
    }
  } else {
    const chroma = chromaticLookup(parsed.root, table);
    if (!chroma) return null;
    num = chroma.num;
    shift = chroma.shift;
    if (parsed.quality === 'min') swap = true;
  }

  let out = num;
  if (swap) out += '~';
  const bracket = `${shift}${parsed.modifier}`;
  if (bracket) out += `[${bracket}]`;

  if (parsed.bass) {
    const bassOut = bassToKantan(parsed.bass, table);
    out += bassOut ? `/${bassOut}` : `/${parsed.bass}`;
  }

  return out;
}
