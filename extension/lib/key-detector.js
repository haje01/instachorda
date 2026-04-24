// 코드 목록에서 기본 키 자동 추론
//
// 휴리스틱: 각 후보 키로 전체 코드를 KANTAN 으로 변환했을 때
//   보조 마커(`~`, `[b]`, `[#]`)가 가장 적게 쓰이는 키를 선택.
// [7], [maj7] 같은 순수 수식어는 키와 무관하므로 점수에 포함하지 않음.

import { parseChord } from './chord-parser.js';
import { toKantan } from './kantan-converter.js';
import { SUPPORTED_KEYS, getTable, rootsEqualBySemi } from './kantan-tables.js';

// 한 코드의 특정 키 기준 페널티
function chordPenalty(chordText, key) {
  const k = toKantan(chordText, key);
  if (k === null) return 10;            // 변환 불가 — 매우 부적합
  let p = 0;
  if (k.includes('~')) p += 1;          // 마이너 스왑
  if (/\[[^\]]*[#b]/.test(k)) p += 2;   // 크로매틱 대괄호
  return p;
}

function scoreKey(parsedChords, texts, key) {
  let total = 0;
  for (const t of texts) total += chordPenalty(t, key);
  // 첫/끝 코드가 슬롯 1(토닉)과 같은 음이면 보너스
  const table = getTable(key);
  const tonic = table[1];
  if (parsedChords.length > 0) {
    const first = parsedChords[0];
    const last = parsedChords[parsedChords.length - 1];
    if (rootsEqualBySemi(first.root, tonic.root)) total -= 0.5;
    if (rootsEqualBySemi(last.root, tonic.root)) total -= 0.5;
  }
  return total;
}

export function detectKey(chordTexts) {
  const parsed = chordTexts.map(parseChord).filter(Boolean);
  if (parsed.length === 0) return null;
  // 파싱 성공한 원본 텍스트만 사용
  const valid = chordTexts.filter(t => parseChord(t));

  let bestKey = null;
  let bestPenalty = Infinity;
  for (const key of SUPPORTED_KEYS) {
    const p = scoreKey(parsed, valid, key);
    if (p < bestPenalty) {
      bestPenalty = p;
      bestKey = key;
    }
  }
  return bestKey;
}
