// KANTAN 숫자 -> 실제 코드 매핑 테이블 (기본 키별)
//
// 각 키별 9개 슬롯 (1~9) 에 어떤 코드가 할당되는지 정의.
// C 키만 실제 확인된 값이고, 나머지 키는 플레이스홀더(diatonic 추정치).
// 사용자가 각 키별 Instachord 화면을 확인한 뒤 실제 값으로 교체 예정.
//
// 구조:
//   {
//     [key]: {
//       1: { root: 'C', quality: 'maj' },
//       2: { root: 'D', quality: 'min' },
//       ...
//     }
//   }

function maj(root) { return { root, quality: 'maj' }; }
function min(root) { return { root, quality: 'min' }; }

// 아래는 플레이스홀더(추정) 테이블. 각 키의 다이어토닉 1~7 + 병행조 느낌의 보너스 2개(8, 9).
// 실제 Instachord 값과 다를 수 있으므로 추후 사용자 검증 필요.
const PLACEHOLDER = {
  // [TODO] 각 키별 실제 Instachord 표시값으로 교체
  C:  { 1: maj('C'),  2: min('D'),  3: min('E'),  4: maj('F'),  5: maj('G'),  6: min('A'),  7: min('B'),  8: maj('Eb'), 9: maj('Bb') },
  G:  { 1: maj('G'),  2: min('A'),  3: min('B'),  4: maj('C'),  5: maj('D'),  6: min('E'),  7: min('F#'), 8: maj('Bb'), 9: maj('F')  },
  D:  { 1: maj('D'),  2: min('E'),  3: min('F#'), 4: maj('G'),  5: maj('A'),  6: min('B'),  7: min('C#'), 8: maj('F'),  9: maj('C')  },
  A:  { 1: maj('A'),  2: min('B'),  3: min('C#'), 4: maj('D'),  5: maj('E'),  6: min('F#'), 7: min('G#'), 8: maj('C'),  9: maj('G')  },
  E:  { 1: maj('E'),  2: min('F#'), 3: min('G#'), 4: maj('A'),  5: maj('B'),  6: min('C#'), 7: min('D#'), 8: maj('G'),  9: maj('D')  },
  F:  { 1: maj('F'),  2: min('G'),  3: min('A'),  4: maj('Bb'), 5: maj('C'),  6: min('D'),  7: min('E'),  8: maj('Ab'), 9: maj('Eb') },
  Bb: { 1: maj('Bb'), 2: min('C'),  3: min('D'),  4: maj('Eb'), 5: maj('F'),  6: min('G'),  7: min('A'),  8: maj('Db'), 9: maj('Ab') },
  Eb: { 1: maj('Eb'), 2: min('F'),  3: min('G'),  4: maj('Ab'), 5: maj('Bb'), 6: min('C'),  7: min('D'),  8: maj('Gb'), 9: maj('Db') },
  // 나머지 키는 추후 추가
};

// 키 목록 (MVP 범위)
export const SUPPORTED_KEYS = Object.keys(PLACEHOLDER);

// 실제 확인된 키 목록 (TODO 제거된 것들)
export const VERIFIED_KEYS = []; // C 도 아직 8,9 슬롯은 미검증이라 일단 비워둠

// 특정 키의 테이블 반환
export function getTable(key) {
  return PLACEHOLDER[key] || null;
}

// 음 이름 정규화 (이명동음 처리: Db <-> C#, Eb <-> D# 등)
const ENHARMONIC = {
  'C#': 'Db', 'Db': 'Db',
  'D#': 'Eb', 'Eb': 'Eb',
  'F#': 'F#', 'Gb': 'F#',
  'G#': 'Ab', 'Ab': 'Ab',
  'A#': 'Bb', 'Bb': 'Bb',
};

export function normalizeRoot(root) {
  return ENHARMONIC[root] || root;
}
