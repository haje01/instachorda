"""표준 코드 -> KANTAN 숫자 표기 변환.

extension/lib/kantan-converter.js 의 Python 포팅. 변환 규칙:
  1) 슬롯(root + quality) 정확 일치 → 그 숫자
  2) 근음 일치, 입력 minor / 슬롯 major → 숫자 + '~'
  3) 근음 일치, 입력 major / 슬롯 minor + 수식어 → 숫자만 (수식어가 차이 흡수)
  4) 근음이 어느 슬롯에도 없으면 크로매틱: 반음 위 슬롯 + [b] 우선, 없으면 반음 아래 + [#]
  5) 수식어는 대괄호 안. 크로매틱 기호와 결합하면 같은 대괄호에 (예: Bb7 → 3[b7])
  6) 슬래시 코드는 각 파트를 변환 후 '/' 로 연결
"""

from __future__ import annotations

from typing import Optional

from .chord_parser import parse_chord
from .kantan_tables import (
    Slot,
    get_table,
    roots_equal_by_semi,
    semitone_of,
)


def _lookup(parsed_root: str, parsed_quality: str, table: dict[int, Slot]) -> Optional[dict]:
    root_only: Optional[dict] = None
    for num, slot in table.items():
        if roots_equal_by_semi(slot["root"], parsed_root):
            if slot["quality"] == parsed_quality:
                return {"num": str(num), "kind": "exact"}
            if root_only is None:
                root_only = {"num": str(num), "slot_quality": slot["quality"], "kind": "root-only"}
    return root_only


def _chromatic_lookup(root: str, table: dict[int, Slot]) -> Optional[dict]:
    """입력 근음과 반음 관계인 슬롯 찾기.
    우선순위: 반음 위 슬롯(입력은 그 슬롯의 b) > 반음 아래 슬롯(입력은 그 슬롯의 #).
    """
    input_semi = semitone_of(root)
    if input_semi is None:
        return None
    above = (input_semi + 1) % 12
    below = (input_semi + 11) % 12
    below_match: Optional[dict] = None
    for num, slot in table.items():
        s = semitone_of(slot["root"])
        if s == above:
            return {"num": str(num), "shift": "b"}
        if s == below and below_match is None:
            below_match = {"num": str(num), "shift": "#"}
    return below_match


def _bass_to_kantan(bass_root: str, table: dict[int, Slot]) -> Optional[str]:
    for num, slot in table.items():
        if roots_equal_by_semi(slot["root"], bass_root):
            return str(num)
    chroma = _chromatic_lookup(bass_root, table)
    return f"{chroma['num']}[{chroma['shift']}]" if chroma else None


def to_kantan(chord_text: str, key: str) -> Optional[str]:
    parsed = parse_chord(chord_text)
    if parsed is None:
        return None
    table = get_table(key)
    if table is None:
        return None

    num: Optional[str] = None
    swap = False
    shift = ""
    quality_mod = ""  # dim/aug 같은 퀄리티가 수식어로 흡수될 때

    is_sus = bool(parsed.modifier) and parsed.modifier.startswith("sus")

    hit = _lookup(parsed.root, parsed.quality, table)
    if hit and hit["kind"] == "exact":
        num = hit["num"]
    elif hit and hit["kind"] == "root-only":
        num = hit["num"]
        in_q = parsed.quality
        slot_q = hit["slot_quality"]
        is_maj_min_flip = (
            (in_q == "maj" and slot_q == "min")
            or (in_q == "min" and slot_q == "maj")
        )
        if is_maj_min_flip:
            # sus 수식어는 3도를 제거하므로 swap 불필요
            if not is_sus:
                swap = True
        elif in_q in ("dim", "aug"):
            # 슬롯에 없는 퀄리티(dim/aug)는 수식어로 흡수
            quality_mod = in_q
        else:
            return None
    else:
        chroma = _chromatic_lookup(parsed.root, table)
        if not chroma:
            return None
        num = chroma["num"]
        shift = chroma["shift"]
        if parsed.quality == "min":
            swap = True
        elif parsed.quality in ("dim", "aug"):
            quality_mod = parsed.quality

    out = num or ""
    if swap:
        out += "~"
    bracket = f"{shift}{quality_mod}{parsed.modifier}"
    if bracket:
        out += f"[{bracket}]"

    if parsed.bass:
        bass_out = _bass_to_kantan(parsed.bass, table)
        out += f"/{bass_out}" if bass_out else f"/{parsed.bass}"

    return out
