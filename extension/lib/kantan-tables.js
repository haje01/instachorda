// KANTAN 숫자 -> 실제 코드 매핑 테이블 (기본 키별)
//
// C 키는 사용자 확인값 (1~9 전부). 나머지 키는 다이어토닉 1~7 만 플레이스홀더 —
// 8, 9 슬롯은 키마다 달라서 실제값 확인 전까지 비워 둠.
// 테이블에 없는 근음은 변환기의 크로매틱 로직이 가장 가까운 슬롯 + [b]/[#] 로 처리.

function maj(root) { return { root, quality: 'maj' }; }
function min(root) { return { root, quality: 'min' }; }

const TABLES = {
  C:  { 1: maj('C'),  2: min('D'),  3: min('E'),  4: maj('F'),  5: maj('G'),  6: min('A'),  7: min('B'),  8: maj('Eb'), 9: maj('Bb') },
  G:  { 1: maj('G'),  2: min('A'),  3: min('B'),  4: maj('C'),  5: maj('D'),  6: min('E'),  7: min('F#') },
  D:  { 1: maj('D'),  2: min('E'),  3: min('F#'), 4: maj('G'),  5: maj('A'),  6: min('B'),  7: min('C#') },
  A:  { 1: maj('A'),  2: min('B'),  3: min('C#'), 4: maj('D'),  5: maj('E'),  6: min('F#'), 7: min('G#') },
  E:  { 1: maj('E'),  2: min('F#'), 3: min('G#'), 4: maj('A'),  5: maj('B'),  6: min('C#'), 7: min('D#') },
  F:  { 1: maj('F'),  2: min('G'),  3: min('A'),  4: maj('Bb'), 5: maj('C'),  6: min('D'),  7: min('E')  },
  Bb: { 1: maj('Bb'), 2: min('C'),  3: min('D'),  4: maj('Eb'), 5: maj('F'),  6: min('G'),  7: min('A')  },
  Eb: { 1: maj('Eb'), 2: min('F'),  3: min('G'),  4: maj('Ab'), 5: maj('Bb'), 6: min('C'),  7: min('D')  },
};

export const SUPPORTED_KEYS = Object.keys(TABLES);

export function getTable(key) {
  return TABLES[key] || null;
}

// 이명동음 처리용 반음값 (0 = C, 11 = B). 같은 음이면 반음값이 같음.
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

// 반음값 기반 동일음 비교 (이명동음 포함)
export function rootsEqualBySemi(a, b) {
  const sa = SEMITONE[a];
  const sb = SEMITONE[b];
  return sa !== undefined && sa === sb;
}
