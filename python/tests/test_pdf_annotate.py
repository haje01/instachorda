"""annotate_pdf 동작 테스트 — 자동 KANTAN 키 식별 + 원본 코드 덮어쓰기.

크롬 익스텐션과 동일한 워크플로우:
1. 코드 토큰들로부터 주 KANTAN 키를 자동 식별
2. 그 키 중심으로 변환해 원본 코드 위에 덮어쓰기 (배지 추가가 아님)
3. 식별된 KANTAN 키를 1페이지에 라벨로 표시
"""

import shutil
from pathlib import Path

import pytest

from instachorda.pdf_extract import annotate_pdf


def test_통일_폰트크기는_중앙값_기반_이상치에_강건():
    import statistics

    from instachorda.pdf_extract import ChordHit, uniform_font_size

    def hit(h):  # 높이 h 인 더미 히트
        return ChordHit(page_index=0, x0=0, y0=0, x1=10, y1=h, text="A")

    # 대부분 7~8 인데 음표와 합쳐진 큰 박스(29) 가 섞여도 중앙값을 따른다
    heights = [7.0, 7.4, 7.2, 29.0, 7.0]
    fs = uniform_font_size([hit(h) for h in heights])
    expected = max(9.0, statistics.median(heights) * 1.15)
    assert abs(fs - expected) < 0.01
    # 이상치 29 에 끌려가지 않음
    assert fs < 12.0


def test_통일_폰트크기_빈_입력():
    from instachorda.pdf_extract import uniform_font_size

    assert uniform_font_size([]) == 9.0


def _page_text(pdf_path, page_index=0):
    """출력 PDF 페이지의 텍스트 추출 (insert_text 로 그린 텍스트 포함)."""
    import pymupdf
    with pymupdf.open(str(pdf_path)) as doc:
        return doc[page_index].get_text()


def _white_fill_rects(pdf_path, page_index=0):
    """페이지에서 흰색으로 채워진 사각형 (원본 가림용) 목록."""
    import pymupdf
    with pymupdf.open(str(pdf_path)) as doc:
        drawings = doc[page_index].get_drawings()
    return [d for d in drawings if d.get("fill") == (1.0, 1.0, 1.0)]


def test_KANTAN_키_자동_식별_후_변환(make_text_pdf, tmp_path):
    # C 장조 진행 — 자동 식별 키는 C
    pdf = make_text_pdf(["C", "G", "Am", "F", "G7", "C"])
    out = tmp_path / "out.pdf"

    result = annotate_pdf(pdf, str(out), key=None)

    assert result["key"] == "C"  # 자동 식별
    assert result["count"] == 6


def test_원본_코드를_가리고_KANTAN_으로_덮어씀(make_text_pdf, tmp_path):
    pdf = make_text_pdf(["C", "G", "Am", "F", "G7", "C"])
    out = tmp_path / "out.pdf"

    result = annotate_pdf(pdf, str(out))

    # 덮어쓴 KANTAN 텍스트가 출력 PDF 에 존재
    text = _page_text(out)
    assert "5[7]" in text  # G7 → 5[7]
    assert "6" in text     # Am → 6

    # 원본 코드마다 흰색 가림 사각형이 그려짐
    assert len(_white_fill_rects(out)) >= result["count"]


def test_KANTAN_키_라벨이_1페이지에_표시(make_text_pdf, tmp_path):
    pdf = make_text_pdf(["C", "G", "Am", "F", "G7", "C"])
    out = tmp_path / "out.pdf"

    annotate_pdf(pdf, str(out))

    assert "KANTAN key: C" in _page_text(out, page_index=0)


def test_키_수동_지정도_가능(make_text_pdf, tmp_path):
    pdf = make_text_pdf(["C", "G", "Am", "F"])
    out = tmp_path / "out.pdf"

    result = annotate_pdf(pdf, str(out), key="G")

    assert result["key"] == "G"
    assert "KANTAN key: G" in _page_text(out, page_index=0)


# ---------------------------------------------------------------------------
# 통합 테스트 — tesseract + 실제 PDF 가 있을 때만
# ---------------------------------------------------------------------------

_NAMIDA = Path(__file__).resolve().parent.parent / "namida.pdf"


@pytest.mark.skipif(
    shutil.which("tesseract") is None or not _NAMIDA.exists(),
    reason="tesseract 또는 namida.pdf 없음",
)
def test_통합_namida_자동_키_식별_및_덮어쓰기(tmp_path):
    out = tmp_path / "namida_out.pdf"

    result = annotate_pdf(str(_NAMIDA), str(out))

    # 자동 식별된 KANTAN 키로 변환되어야 함 (이 곡은 B 가 마커 최소 키)
    assert result["method"] == "ocr"
    assert result["key"] is not None
    assert result["count"] > 0

    # 키 라벨 + 덮어쓴 KANTAN 텍스트 확인
    text = _page_text(out)
    assert f"KANTAN key: {result['key']}" in text
