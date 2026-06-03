"""공유 pytest 픽스처."""

import pytest


@pytest.fixture
def make_text_pdf(tmp_path):
    """텍스트 레이어가 있는 테스트용 PDF 를 만드는 팩토리 픽스처.

    사용: pdf_path = make_text_pdf(["C", "G", "Am", "F"])
    """
    import pymupdf

    def _make(words, name="text_layer.pdf"):
        path = tmp_path / name
        doc = pymupdf.open()
        page = doc.new_page()
        x = 50.0
        for word in words:
            page.insert_text((x, 100), word, fontsize=12)
            x += 60
        doc.save(str(path))
        doc.close()
        return str(path)

    return _make
