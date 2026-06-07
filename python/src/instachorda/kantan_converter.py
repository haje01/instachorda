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

import re
from typing import Optional

from .chord_parser import ParsedChord, parse_chord
from .kantan_tables import (
    Slot,
    get_table,
    roots_equal_by_semi,
    semitone_of,
)


# --- Instachord 연주용 코드 간략화 (항상 적용) ---
#
# Instachord 에서 실제로 누를 수 있는 표현은 한정적이다:
#   퀄리티: maj / min(~) / dim / aug,  수식어: 6, 7, maj7, 9, sus4,  크로매틱: b/#
# 그 밖의 복잡한 텐션·알터레이션(9 초과, b5/#5/b9/#9, add9, 11, 13 ...)은
# 성격을 최대한 보존하는 선에서 위 집합으로 축약한다.
#   - m7b5(하프디미니시드) 등 min+b5 계열 → dim 트라이어드
#   - dim/aug 에 붙은 수식어(dim7, aug7) → 트라이어드 dim/aug
#   - 도미넌트 계열(7 포함, 11/13, 알터레이션) → 7 (단, 단독 9 는 9 유지)
#   - maj 계열(maj7/maj9 ...) → maj7
#   - sus4 유지, 그 밖 sus(sus2 등) → 트라이어드
#   - 6 계열 → 6,  그 외(add9 등) → 트라이어드
def _simplify_modifier(mod: str) -> str:
    if not mod:
        return ""
    if re.match(r"^maj", mod, re.IGNORECASE) or mod.startswith("M7"):
        return "maj7"
    if mod.startswith("sus4"):
        return "sus4"
    if mod.startswith("sus"):
        return ""
    if mod.startswith("6"):
        return "6"
    if mod == "9":
        return "9"
    if "7" in mod:
        return "7"
    if mod in ("11", "13"):
        return "7"
    return ""


def _simplify_chord(p: ParsedChord) -> ParsedChord:
    mod = p.modifier or ""
    # 하프디미니시드(min + b5) → dim 트라이어드 (성격 보존)
    if p.quality == "min" and re.search(r"b5|-5", mod):
        return ParsedChord(root=p.root, quality="dim", modifier="", bass=p.bass)
    # dim/aug 는 지원 퀄리티이므로 유지하되 붙은 수식어는 제거
    if p.quality in ("dim", "aug"):
        return ParsedChord(root=p.root, quality=p.quality, modifier="", bass=p.bass)
    return ParsedChord(
        root=p.root, quality=p.quality, modifier=_simplify_modifier(mod), bass=p.bass
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
    raw = parse_chord(chord_text)
    if raw is None:
        return None
    parsed = _simplify_chord(raw)
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
