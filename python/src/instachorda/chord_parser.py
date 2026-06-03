"""표준 기타 코드 텍스트를 구조화된 객체로 파싱.

extension/lib/chord-parser.js 의 Python 포팅. 동작은 1:1 동일.
예: "Am7/G" -> ParsedChord(root='A', quality='min', modifier='7', bass='G')
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Literal, Optional

Quality = Literal["maj", "min", "dim", "aug"]

# 루트 문자는 대소문자 모두 허용 (예: "c7" 도 C 로 해석). 파싱 후 대문자로 정규화.
_ROOT_PATTERN = re.compile(r"^([A-Ga-g])([#b]?)")


@dataclass(frozen=True)
class ParsedChord:
    root: str
    quality: Quality
    modifier: str
    bass: Optional[str]


def _detect_quality(body: str) -> tuple[Quality, str]:
    """퀄리티 감지 우선순위: dim/aug/sus/maj 따로, 마이너는 'm' 뒤에 'aj' 가 오지 않는 경우."""
    if body.startswith("dim"):
        return "dim", body[3:]
    if body.startswith("aug"):
        return "aug", body[3:]
    # 'maj' 로 시작하면 메이저로 보고 수식어에 포함
    if body.startswith("maj"):
        return "maj", body
    # 'm' 뒤에 'aj' 가 없으면 마이너
    if body.startswith("m") and not body.startswith("maj"):
        return "min", body[1:]
    return "maj", body


_TENSION_PAREN = re.compile(r"\([^)]*\)")
_ON_BASS = re.compile(r"on([A-Ga-g][#b]?)")


def _norm_accidentals(s: str) -> str:
    # 유니코드 플랫/샾 변형을 ASCII b/# 로 정규화.
    # ♭(U+266D), ᵇ(U+1D47 MODIFIER LETTER SMALL B — chordscore.com 이 실제로 쓰는 위첨자 b),
    # ♯(U+266F).
    return s.replace("♭", "b").replace("ᵇ", "b").replace("♯", "#")


def _norm_chord_text(s: str) -> str:
    """파싱 전 코드 텍스트 정규화.

    - 유니코드 플랫/샤프 → ASCII
    - 위첨자 마커(^) 제거
    - 괄호 텐션((13), (b9) 등) 무시 — 키와 무관한 장식
    - on-베이스(DonE) → 슬래시 베이스(D/E)
    """
    s = _norm_accidentals(s)
    s = s.replace("^", "")
    s = _TENSION_PAREN.sub("", s)
    s = _ON_BASS.sub(r"/\1", s)
    return s


def parse_chord(text: object) -> Optional[ParsedChord]:
    if not isinstance(text, str) or not text:
        return None
    trimmed = _norm_chord_text(text).strip()
    if not trimmed:
        return None

    root_match = _ROOT_PATTERN.match(trimmed)
    if not root_match:
        return None

    root = root_match.group(1).upper() + root_match.group(2)
    # 매칭한 원본 길이만큼 소비 (대소문자 섞여도 길이는 같음)
    rest = trimmed[len(root_match.group(0)):]

    # 슬래시 베이스 분리
    bass: Optional[str] = None
    slash_idx = rest.find("/")
    if slash_idx >= 0:
        bass_part = rest[slash_idx + 1:].strip()
        bass_match = _ROOT_PATTERN.match(bass_part)
        if bass_match:
            bass = bass_match.group(1).upper() + bass_match.group(2)
        rest = rest[:slash_idx]

    quality, after_quality = _detect_quality(rest)
    modifier = after_quality.strip()

    # 수식어 유효성: 내부 공백이 있거나 대문자 루트 문자([A-G]) 를 포함하면
    # 실제로는 "두 코드가 공백으로 붙은 것" 으로 간주하고 거부.
    # 소문자는 maj/add/sus 등 정상 수식어의 일부이므로 금지하지 않음.
    if modifier and re.search(r"[\sA-G]", modifier):
        return None

    return ParsedChord(root=root, quality=quality, modifier=modifier, bass=bass)
