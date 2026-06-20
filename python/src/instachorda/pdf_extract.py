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


# 같은 코드 행으로 묶을 y(세로) 허용 오차(PDF 포인트). 한 행 안 코드들의 박스
# 높이는 ~7~13pt 라 중심 좌표는 몇 pt 내로 모이고, 행 사이 간격은 그보다 훨씬 큼.
_CHORD_ROW_TOLERANCE = 10.0


def _cluster_rows(hits: list[ChordHit]) -> list[list[ChordHit]]:
    """히트를 y 중심 기준으로 가로 '행' 밴드로 군집화.

    중심 좌표를 정렬해 인접 간격이 허용 오차를 넘으면 새 행으로 끊는다.
    """
    if not hits:
        return []
    ordered = sorted(hits, key=lambda h: (h.y0 + h.y1) / 2)
    rows: list[list[ChordHit]] = [[ordered[0]]]
    prev_center = (ordered[0].y0 + ordered[0].y1) / 2
    for h in ordered[1:]:
        center = (h.y0 + h.y1) / 2
        if center - prev_center > _CHORD_ROW_TOLERANCE:
            rows.append([])
        rows[-1].append(h)
        prev_center = center
    return rows


def _is_chord_row(row: list[ChordHit]) -> bool:
    """이 행 밴드가 진짜 코드 행인지 다수결로 판정.

    진짜 코드 행은 멀티문자 코드(Am, G7, Eb 등) 가 가로로 여러 개 늘어선다.
    반면 가사/장식 오탐은 단일 문자('A')가 흩어지거나 같은 글자만 반복된다.
    - 멀티문자 코드가 2개 이상 → 코드 행으로 인정.
    - 멀티문자 코드 1개라도 있고 서로 다른 토큰이 3종 이상 → 코드 행으로 인정
      (단일 문자 위주의 단순한 곡 보호; 같은 글자 반복 오탐은 종 수로 배제).
    """
    multi = sum(1 for h in row if len(h.text) >= 2)
    if multi >= 2:
        return True
    distinct = len({h.text for h in row})
    return multi >= 1 and distinct >= 3


def filter_likely_chords(hits: Iterable[ChordHit]) -> list[ChordHit]:
    """코드 행 밀도(다수결) 로 가사/장식 오탐을 거르는 휴리스틱.

    오선(staff) 벡터 검출이 실패한 PDF 에서도 동작하도록, 오선 기하학 대신
    1패스에서 잡힌 코드들이 이루는 가로 행 밀도로 코드 영역을 정한다.
    멀티문자 코드가 모이는 행만 진짜 코드 행으로 보고, 그 행에 정렬된 히트만
    남긴다. 코드 행 밖에 흩어진 단일 문자('A','E') 나 같은 글자만 반복되는
    밀집 오탐은 제거된다.

    페이지에 멀티문자 코드가 전혀 없으면 보수적으로 전부 버린다.
    """
    by_page: dict[int, list[ChordHit]] = {}
    for h in hits:
        by_page.setdefault(h.page_index, []).append(h)

    out: list[ChordHit] = []
    for page_hits in by_page.values():
        for row in _cluster_rows(page_hits):
            if _is_chord_row(row):
                out.extend(row)
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
