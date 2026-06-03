"""코드 목록에서 기본 키 자동 추론.

extension/lib/key-detector.js 의 Python 포팅.
휴리스틱: 각 후보 키로 전체 코드를 KANTAN 으로 변환했을 때
  보조 마커(`~`, `[b]`, `[#]`) 가 가장 적게 쓰이는 키를 선택.
[7], [maj7] 같은 순수 수식어는 키와 무관하므로 점수에 포함하지 않음.
보너스 슬롯(8/9)은 임시 차용 코드용이므로 사용 시 약한 패널티 —
  토닉처럼 자주 나오는 코드가 보너스 슬롯에 배치되는 키를 피한다.
"""

from __future__ import annotations

import re
from typing import Optional

from .chord_parser import parse_chord
from .kantan_converter import to_kantan
from .kantan_tables import SUPPORTED_KEYS, get_table, roots_equal_by_semi

_BRACKET_ACCIDENTAL = re.compile(r"\[[^\]]*[#b]")


def _chord_penalty(chord_text: str, key: str) -> float:
    k = to_kantan(chord_text, key)
    if k is None:
        return 10.0  # 변환 불가 — 매우 부적합
    p = 0.0
    if "~" in k:
        p += 1  # 마이너 스왑
    if _BRACKET_ACCIDENTAL.search(k):
        p += 2  # 크로매틱 대괄호
    if k.startswith(("8", "9")):
        p += 0.5  # 보너스 슬롯 (8/9) 사용
    return p


def _score_key(parsed_chords: list, texts: list[str], key: str) -> float:
    total = 0.0
    for t in texts:
        total += _chord_penalty(t, key)
    # 첫/끝 코드가 슬롯 1(토닉)과 같은 음이면 보너스
    table = get_table(key)
    if table is None:
        return total
    tonic = table[1]
    if parsed_chords:
        first = parsed_chords[0]
        last = parsed_chords[-1]
        if roots_equal_by_semi(first.root, tonic["root"]):
            total -= 0.5
        if roots_equal_by_semi(last.root, tonic["root"]):
            total -= 0.5
    return total


def detect_key(chord_texts: list[str]) -> Optional[str]:
    parsed = [p for p in (parse_chord(t) for t in chord_texts) if p is not None]
    if not parsed:
        return None
    # 파싱 성공한 원본 텍스트만 사용
    valid = [t for t in chord_texts if parse_chord(t) is not None]

    best_key: Optional[str] = None
    best_penalty = float("inf")
    for key in SUPPORTED_KEYS:
        p = _score_key(parsed, valid, key)
        if p < best_penalty:
            best_penalty = p
            best_key = key
    return best_key
