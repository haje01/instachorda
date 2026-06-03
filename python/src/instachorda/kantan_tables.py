"""KANTAN 숫자 -> 실제 코드 매핑 테이블 (기본 키별).

extension/lib/kantan-tables.js 와 동일한 값. 변경 시 양쪽 모두 동기화 필요.
12 키 × 9 슬롯 (1~9). 7~9 슬롯은 다이어토닉 밖의 비관습적 배치도 있음.
조회는 반음값 기반이라 Bb/A# 같은 이명동음은 동일 슬롯으로 매칭됨.
"""

from __future__ import annotations

from typing import Optional, TypedDict


class Slot(TypedDict):
    root: str
    quality: str  # 'maj' | 'min'


def _maj(root: str) -> Slot:
    return {"root": root, "quality": "maj"}


def _min(root: str) -> Slot:
    return {"root": root, "quality": "min"}


_TABLES: dict[str, dict[int, Slot]] = {
    "C":  {1: _maj("C"),  2: _min("D"),  3: _min("E"),  4: _maj("F"),  5: _maj("G"),  6: _min("A"),  7: _min("B"),  8: _maj("Eb"), 9: _maj("Bb")},
    "Db": {1: _maj("Db"), 2: _min("Eb"), 3: _min("F"),  4: _maj("Gb"), 5: _maj("Ab"), 6: _min("Bb"), 7: _min("C"),  8: _maj("E"),  9: _maj("B")},
    "D":  {1: _maj("D"),  2: _min("E"),  3: _min("F#"), 4: _maj("G"),  5: _maj("A"),  6: _min("B"),  7: _min("C#"), 8: _maj("F"),  9: _maj("C")},
    "Eb": {1: _maj("Eb"), 2: _min("F"),  3: _min("G"),  4: _maj("Ab"), 5: _maj("Bb"), 6: _min("C"),  7: _min("D"),  8: _maj("Gb"), 9: _maj("Db")},
    "E":  {1: _maj("E"),  2: _min("F#"), 3: _min("G#"), 4: _maj("A"),  5: _maj("B"),  6: _min("C#"), 7: _min("D#"), 8: _maj("G"),  9: _maj("D")},
    "F":  {1: _maj("F"),  2: _min("G"),  3: _min("A"),  4: _maj("Bb"), 5: _maj("C"),  6: _min("D"),  7: _min("E"),  8: _maj("Ab"), 9: _maj("Eb")},
    "F#": {1: _maj("F#"), 2: _min("G#"), 3: _min("A#"), 4: _maj("B"),  5: _maj("C#"), 6: _min("D#"), 7: _min("F"),  8: _maj("A"),  9: _maj("E")},
    "G":  {1: _maj("G"),  2: _min("A"),  3: _min("B"),  4: _maj("C"),  5: _maj("D"),  6: _min("E"),  7: _min("F#"), 8: _maj("A#"), 9: _maj("F")},
    "Ab": {1: _maj("Ab"), 2: _min("Bb"), 3: _min("C"),  4: _maj("Db"), 5: _maj("Eb"), 6: _min("F"),  7: _min("G"),  8: _maj("B"),  9: _maj("Gb")},
    "A":  {1: _maj("A"),  2: _min("B"),  3: _min("C#"), 4: _maj("D"),  5: _maj("E"),  6: _min("F#"), 7: _min("G#"), 8: _maj("C"),  9: _maj("G")},
    "Bb": {1: _maj("Bb"), 2: _min("C"),  3: _min("D"),  4: _maj("Eb"), 5: _maj("F"),  6: _min("G"),  7: _min("A"),  8: _maj("Db"), 9: _maj("Ab")},
    "B":  {1: _maj("B"),  2: _min("C#"), 3: _min("D#"), 4: _maj("E"),  5: _maj("F#"), 6: _min("G#"), 7: _min("A#"), 8: _maj("D"),  9: _maj("A")},
}

# 키 선택 UI 에서 사용할 표시 순서 (반음 상승)
SUPPORTED_KEYS: list[str] = list(_TABLES.keys())


def get_table(key: str) -> Optional[dict[int, Slot]]:
    return _TABLES.get(key)


# 이명동음 처리용 반음값 (0 = C, 11 = B).
_SEMITONE: dict[str, int] = {
    "C": 0, "B#": 0,
    "C#": 1, "Db": 1,
    "D": 2,
    "D#": 3, "Eb": 3,
    "E": 4, "Fb": 4,
    "F": 5, "E#": 5,
    "F#": 6, "Gb": 6,
    "G": 7,
    "G#": 8, "Ab": 8,
    "A": 9,
    "A#": 10, "Bb": 10,
    "B": 11, "Cb": 11,
}


def semitone_of(root: str) -> Optional[int]:
    return _SEMITONE.get(root)


def roots_equal_by_semi(a: str, b: str) -> bool:
    sa = _SEMITONE.get(a)
    sb = _SEMITONE.get(b)
    return sa is not None and sa == sb
