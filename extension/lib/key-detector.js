// 코드 목록에서 기본 키 자동 추론
//
// MVP 휴리스틱:
//   - 각 후보 키에 대해, 해당 키 테이블의 슬롯에 매칭되는 코드 개수를 센다
//   - 매칭률이 가장 높은 키를 반환
//   - 동률이면 SUPPORTED_KEYS 우선순위(C, G, D, ...)로 결정
//   - 입력에서 첫 코드 / 마지막 코드가 1번 슬롯에 있으면 가산점

import { parseChord } from './chord-parser.js';
import { getTable, rootsEqualBySemi, SUPPORTED_KEYS } from './kantan-tables.js';

function matchesSlot(parsed, slot) {
  if (!rootsEqualBySemi(parsed.root, slot.root)) return false;
  // 수식어가 있거나 퀄리티가 같으면 매칭
  if (parsed.modifier) return true;
  return parsed.quality === slot.quality;
}

function scoreKey(parsedChords, table) {
  let score = 0;
  for (const parsed of parsedChords) {
    for (const slot of Object.values(table)) {
      if (matchesSlot(parsed, slot)) {
        score += 1;
        break;
      }
    }
  }
  // 첫/끝 코드가 1번(토닉)과 루트가 같으면 보너스
  const tonic = table[1];
  if (parsedChords.length > 0) {
    const first = parsedChords[0];
    const last = parsedChords[parsedChords.length - 1];
    if (rootsEqualBySemi(first.root, tonic.root)) score += 0.5;
    if (rootsEqualBySemi(last.root, tonic.root)) score += 0.5;
  }
  return score;
}

export function detectKey(chordTexts) {
  const parsed = chordTexts.map(parseChord).filter(Boolean);
  if (parsed.length === 0) return null;

  let bestKey = null;
  let bestScore = -1;
  for (const key of SUPPORTED_KEYS) {
    const table = getTable(key);
    const s = scoreKey(parsed, table);
    if (s > bestScore) {
      bestScore = s;
      bestKey = key;
    }
  }
  return bestKey;
}
