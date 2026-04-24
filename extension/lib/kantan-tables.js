// KANTAN 숫자 -> 실제 코드 매핑 테이블 (기본 키별)
//
// 12개 기본 키 × 9개 슬롯 (1~9). 모두 사용자 확인값 (2026-04-24 정리).
// 참고: 각 키의 7th 슬롯과 8, 9 슬롯은 다이어토닉을 벗어나는 비관습적 배치도 있음
// (예: F# 키 슬롯 7 은 Fm, G 키 슬롯 8 은 A#).
// 조회는 반음값(이명동음 포함) 기반이라 Bb/A# 같은 이명동음은 동일하게 매칭됨.

function maj(root) { return { root, quality: 'maj' }; }
function min(root) { return { root, quality: 'min' }; }

const TABLES = {
  'C':  { 1: maj('C'),  2: min('D'),  3: min('E'),  4: maj('F'),  5: maj('G'),  6: min('A'),  7: min('B'),  8: maj('Eb'), 9: maj('Bb') },
  'Db': { 1: maj('Db'), 2: min('Eb'), 3: min('F'),  4: maj('Gb'), 5: maj('Ab'), 6: min('Bb'), 7: min('C'),  8: maj('E'),  9: maj('B')  },
  'D':  { 1: maj('D'),  2: min('E'),  3: min('F#'), 4: maj('G'),  5: maj('A'),  6: min('B'),  7: min('C#'), 8: maj('F'),  9: maj('C')  },
  'Eb': { 1: maj('Eb'), 2: min('F'),  3: min('G'),  4: maj('Ab'), 5: maj('Bb'), 6: min('C'),  7: min('D'),  8: maj('Gb'), 9: maj('Db') },
  'E':  { 1: maj('E'),  2: min('F#'), 3: min('G#'), 4: maj('A'),  5: maj('B'),  6: min('C#'), 7: min('D#'), 8: maj('G'),  9: maj('D')  },
  'F':  { 1: maj('F'),  2: min('G'),  3: min('A'),  4: maj('Bb'), 5: maj('C'),  6: min('D'),  7: min('E'),  8: maj('Ab'), 9: maj('Eb') },
  'F#': { 1: maj('F#'), 2: min('G#'), 3: min('A#'), 4: maj('B'),  5: maj('C#'), 6: min('D#'), 7: min('F'),  8: maj('A'),  9: maj('E')  },
  'G':  { 1: maj('G'),  2: min('A'),  3: min('B'),  4: maj('C'),  5: maj('D'),  6: min('E'),  7: min('F#'), 8: maj('A#'), 9: maj('F')  },
  'Ab': { 1: maj('Ab'), 2: min('Bb'), 3: min('C'),  4: maj('Db'), 5: maj('Eb'), 6: min('F'),  7: min('G'),  8: maj('B'),  9: maj('Gb') },
  'A':  { 1: maj('A'),  2: min('B'),  3: min('C#'), 4: maj('D'),  5: maj('E'),  6: min('F#'), 7: min('G#'), 8: maj('C'),  9: maj('G')  },
  'Bb': { 1: maj('Bb'), 2: min('C'),  3: min('D'),  4: maj('Eb'), 5: maj('F'),  6: min('G'),  7: min('A'),  8: maj('Db'), 9: maj('Ab') },
  'B':  { 1: maj('B'),  2: min('C#'), 3: min('D#'), 4: maj('E'),  5: maj('F#'), 6: min('G#'), 7: min('A#'), 8: maj('D'),  9: maj('A')  },
};

// 키 선택 UI 에서 사용할 표시 순서 (반음 상승)
export const SUPPORTED_KEYS = Object.keys(TABLES);

export function getTable(key) {
  return TABLES[key] || null;
}

// 이명동음 처리용 반음값 (0 = C, 11 = B).
const SEMITONE = {
  'C': 0, 'B#': 0,
  'C#': 1, 'Db': 1,
  'D': 2,
  'D#': 3, 'Eb': 3,
  'E': 4, 'Fb': 4,
  'F': 5, 'E#': 5,
  'F#': 6, 'Gb': 6,
  'G': 7,
  'G#': 8, 'Ab': 8,
  'A': 9,
  'A#': 10, 'Bb': 10,
  'B': 11, 'Cb': 11,
};

export function semitoneOf(root) {
  return SEMITONE[root];
}

export function rootsEqualBySemi(a, b) {
  const sa = SEMITONE[a];
  const sb = SEMITONE[b];
  return sa !== undefined && sa === sb;
}
