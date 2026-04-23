// 표준 코드 -> KANTAN 숫자 표기 변환
//
// 규칙:
//   1) 기본 키 테이블에서 root + quality 가 정확히 일치하는 슬롯을 찾으면 그 숫자로 변환
//   2) 수식어(7, maj7, sus4 등)는 뒤에 [ ] 로 감싸서 덧붙임
//   3) 루트만 일치하는 슬롯이 있고 현재 코드가 minor 이며 슬롯은 major 인 경우 숫자 + "~"
//      (KANTAN 의 m -> ~ 스왑 규칙)
//   4) 슬래시 코드는 각 파트를 변환 후 "/" 로 연결
//   5) 변환 불가 시 null

import { parseChord } from './chord-parser.js';
import { getTable, normalizeRoot } from './kantan-tables.js';

function rootsEqual(a, b) {
  return normalizeRoot(a) === normalizeRoot(b);
}

// 파싱된 코드 객체 하나를 KANTAN 숫자 문자열로 변환
// (수식어/베이스는 제외한 단일 숫자, 없으면 null)
function convertCore(parsed, table) {
  let rootOnlyNum = null;
  // 1차: root + quality 모두 일치
  for (const [num, slot] of Object.entries(table)) {
    if (rootsEqual(slot.root, parsed.root)) {
      if (slot.quality === parsed.quality) return String(num);
      if (rootOnlyNum === null) rootOnlyNum = num;
    }
  }
  // 2차: 수식어가 있으면 퀄리티 불일치 무시 (수식어가 뉘앙스 전달)
  if (rootOnlyNum !== null && parsed.modifier) return String(rootOnlyNum);
  // 3차: 입력이 minor 이고 테이블의 동일 루트 슬롯이 major -> 숫자 + "~"
  if (rootOnlyNum !== null && parsed.quality === 'min') {
    const slot = table[rootOnlyNum];
    if (slot.quality === 'maj') return `${rootOnlyNum}~`;
  }
  return null;
}

// 슬래시 베이스 루트 -> 숫자 (퀄리티 무관, 루트만 일치)
function bassToNumber(bassRoot, table) {
  for (const [num, slot] of Object.entries(table)) {
    if (rootsEqual(slot.root, bassRoot)) return String(num);
  }
  return null;
}

export function toKantan(chordText, key) {
  const parsed = parseChord(chordText);
  if (!parsed) return null;

  const table = getTable(key);
  if (!table) return null;

  const core = convertCore(parsed, table);
  if (!core) return null;

  let out = core;

  // 수식어는 대괄호로
  if (parsed.modifier) {
    out += `[${parsed.modifier}]`;
  }

  // 슬래시 베이스: 루트만 매칭 (퀄리티 무관)
  if (parsed.bass) {
    const bassNum = bassToNumber(parsed.bass, table);
    out += bassNum ? `/${bassNum}` : `/${parsed.bass}`;
  }

  return out;
}
