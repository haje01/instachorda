"""PDF 악보에서 단어 단위로 텍스트를 뽑고, 코드처럼 보이는 토큰만 식별.

PyMuPDF(`pymupdf`) 의 `page.get_text("words")` 는 각 단어를
(x0, y0, x1, y1, text, block_no, line_no, word_no) 튜플로 반환한다.
이 좌표를 가지고 있어야 KANTAN 배지를 같은 위치에 그릴 수 있다.
"""

from __future__ import annotations

import statistics
from dataclasses import dataclass
from typing import Iterable, Optional

from .chord_parser import parse_chord


@dataclass(frozen=True)
class ChordHit:
    page_index: int  # 0-based
    x0: float
    y0: float
    x1: float
    y1: float
    text: str  # 원본 텍스트 (유니코드 변형 정규화 전)


def _is_chord_token(token: str) -> bool:
    """parse_chord 가 통과시키면 코드로 인정.

    파서가 충분히 엄격해서(루트 + 선택적 #/b + 알려진 퀄리티/수식어, 공백/대문자 루트 금지)
    "in", "on", "at" 같은 가사 단어는 거의 걸러진다.
    다만 단일 문자 'A','B','C','D','E','F','G' 와 'a','b','c'... 는 코드로 인식되므로
    호출자가 컨텍스트(주변 단어 비율)로 추가 필터를 걸 수 있다.
    """
    return parse_chord(token) is not None


def extract_chord_hits(pdf_path: str) -> list[ChordHit]:
    """PDF 의 모든 페이지에서 코드로 식별된 단어 위치를 좌표와 함께 반환."""
    # 지역 import — PyMuPDF 가 없어도 코어 라이브러리는 동작.
    import pymupdf  # type: ignore

    hits: list[ChordHit] = []
    with pymupdf.open(pdf_path) as doc:
        for page_index, page in enumerate(doc):
            for w in page.get_text("words"):
                # (x0, y0, x1, y1, text, block, line, word)
                x0, y0, x1, y1, text = w[0], w[1], w[2], w[3], w[4]
                if not text:
                    continue
                if _is_chord_token(text):
                    hits.append(ChordHit(
                        page_index=page_index,
                        x0=float(x0), y0=float(y0),
                        x1=float(x1), y1=float(y1),
                        text=text,
                    ))
    return hits


def filter_likely_chords(hits: Iterable[ChordHit]) -> list[ChordHit]:
    """단일 문자 알파벳 코드(예: 'A', 'a') 가 가사로 끼었을 가능성을 줄이는 휴리스틱.

    - 페이지 안에 다중 문자 코드(예: 'Am', 'G7', 'F#') 가 충분히 있을 때만
      단일 문자 코드를 유지. 코드가 거의 다중 문자(보통의 악보) 라면 안전.
    - 다중 문자 코드 자체가 전혀 없으면 보수적으로 전부 버림.
    """
    by_page: dict[int, list[ChordHit]] = {}
    for h in hits:
        by_page.setdefault(h.page_index, []).append(h)

    out: list[ChordHit] = []
    for page_index, page_hits in by_page.items():
        multi = [h for h in page_hits if len(h.text) >= 2]
        if not multi:
            # 가사 'a'/'A' 만 잔뜩 잡혔을 가능성 — 모두 버림
            continue
        # 다중 문자 코드가 있는 페이지라면 단일 문자도 그대로 신뢰
        out.extend(page_hits)
    return out


def hits_to_tokens(hits: Iterable[ChordHit]) -> list[str]:
    return [h.text for h in hits]


# KANTAN 표기 색 (초록) — 원본과 구분되도록
_KANTAN_COLOR = (0.13, 0.55, 0.27)


def uniform_font_size(hits: list[ChordHit]) -> float:
    """모든 코드에 적용할 단일 KANTAN 폰트 크기를 산출.

    OCR 박스 높이는 코드마다(글자/음표 겹침, 단일 문자 vs 긴 코드) 들쭉날쭉해
    개별 박스에 비례시키면 크기가 일관되지 않다. 그래서 전체 코드 박스 높이의
    중앙값(median) 을 대표 높이로 써서 한 크기로 통일한다. 중앙값은 음표와
    합쳐진 비정상적으로 큰 박스 같은 이상치에 강건하다.
    """
    heights = [h.y1 - h.y0 for h in hits]
    if not heights:
        return 9.0
    return max(9.0, statistics.median(heights) * 1.15)


def annotate_pdf(
    pdf_path: str,
    output_path: str,
    key: Optional[str] = None,
    force_ocr: bool = False,
) -> dict:
    """원본 PDF 의 코드를 KANTAN 표기로 덮어쓴 새 PDF 를 저장.

    크롬 익스텐션과 동일한 워크플로우:
    1. 코드 토큰들로부터 주 KANTAN 키를 자동 식별 (key 인자로 수동 지정 가능)
    2. 그 키 중심으로 변환해 원본 코드 글자를 가리고 KANTAN 표기로 대체
    3. 식별된 KANTAN 키를 1페이지 좌측 상단에 라벨로 표시

    텍스트 레이어가 없는 (벡터/스캔) PDF 는 자동으로 OCR 로 폴백한다.

    Returns: {"key": 사용된 키, "count": 덮어쓴 코드 수, "pages": 처리된 페이지 수,
              "method": "text" 또는 "ocr"}
    """
    import pymupdf  # type: ignore

    from .kantan_converter import to_kantan
    from .key_detector import detect_key
    from .pdf_ocr import extract_chord_hits_auto

    hits, method = extract_chord_hits_auto(pdf_path, force_ocr=force_ocr)
    if not hits:
        return {"key": None, "count": 0, "pages": 0, "method": method}

    auto_key = detect_key(hits_to_tokens(hits))
    effective_key = key or auto_key
    if not effective_key:
        return {"key": None, "count": 0, "pages": 0, "method": method}

    # 모든 코드를 동일한 폰트 크기로 그린다 (개별 OCR 박스 높이가 들쭉날쭉해도
    # 일관되게). 대표 높이는 전체 코드 박스 높이의 중앙값을 사용.
    font_size = uniform_font_size(hits)

    count = 0
    pages_touched: set[int] = set()
    with pymupdf.open(pdf_path) as doc:
        for h in hits:
            kantan = to_kantan(h.text, effective_key)
            if not kantan:
                continue
            page = doc[h.page_index]
            # 원본 코드 글자를 흰 사각형으로 가린 뒤 KANTAN 표기로 대체.
            # insert_text 는 베이스라인 좌표를 받으므로 y1(아래쪽 경계) 기준.
            page.draw_rect(
                pymupdf.Rect(h.x0 - 1, h.y0 - 1, h.x1 + 1, h.y1 + 1),
                color=(1, 1, 1), fill=(1, 1, 1), width=0,
            )
            page.insert_text(
                (h.x0, h.y1 - 1),
                kantan,
                fontsize=font_size,
                color=_KANTAN_COLOR,
            )
            count += 1
            pages_touched.add(h.page_index)

        # 식별된 KANTAN 키 라벨 — 익스텐션의 "KANTAN key: X (자동)" 인디케이터와 동일.
        # 한글 태그를 위해 PyMuPDF 내장 한국어 폰트 사용.
        tag = "수동" if key else "자동"
        doc[0].insert_text(
            (36, 36),
            f"KANTAN key: {effective_key} ({tag})",
            fontsize=11,
            fontname="korea",
            color=_KANTAN_COLOR,
        )
        doc.save(output_path)

    return {
        "key": effective_key,
        "count": count,
        "pages": len(pages_touched),
        "method": method,
    }
