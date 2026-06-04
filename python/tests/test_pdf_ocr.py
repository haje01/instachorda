"""pdf_ocr 모듈 단위 테스트 — OCR 토큰 검증/보정/좌표 변환.

tesseract 바이너리 없이도 돌아가는 순수 로직 테스트가 중심이고,
마지막 통합 테스트만 tesseract + 실제 PDF 가 있을 때 실행된다.
"""

import shutil
from pathlib import Path

import pytest

from instachorda.pdf_ocr import (
    OcrWord,
    correct_misread,
    match_strict_chord,
    ocr_words_to_chord_hits,
    parse_tsv,
)


# ---------------------------------------------------------------------------
# 엄격한 코드 패턴 (match_strict_chord)
# ---------------------------------------------------------------------------

def test_엄격패턴_기본_코드_통과():
    for token in ["A", "C", "G", "F#", "Bb", "Bm", "E7", "A6", "AM7",
                  "Asus4", "Bm7", "BmM7", "Fmaj7", "C#m7", "C#aug7",
                  "F#7sus4", "Dadd9", "Cm7b5", "Bdim7", "Am7/G", "C/G"]:
        assert match_strict_chord(token), f"{token} 은 코드로 인정되어야 함"


def test_엄격패턴_OCR_쓰레기_거부():
    # 실제 namida.pdf OCR 출력에서 나온 쓰레기 토큰들
    for token in ["Fe", "De", "FRA", "Cvs", "Cc", "EHE", "CAE", "BS",
                  "CHoE-", "GheEd-", "Foe", "Go", "EnlsleC", "ANSW",
                  "G1sMGT1", "FRIZ(E", "Endl"]:
        assert not match_strict_chord(token), f"{token} 은 거부되어야 함"


def test_엄격패턴_소문자_루트_거부():
    # 코어 파서(parse_chord)와 달리 OCR 경로는 소문자 루트를 허용하지 않음
    for token in ["a", "fam", "be", "ce", "as"]:
        assert not match_strict_chord(token), f"{token} 은 거부되어야 함"


def test_엄격패턴_샤프_오인식_형태_거부():
    # 보정 전 형태는 그대로는 거부 (보정은 correct_misread 의 몫)
    for token in ["FH", "Ft", "Cim7", "C4m7", "F47sus4", "Ctaug7"]:
        assert not match_strict_chord(token), f"{token} 은 보정 전에는 거부되어야 함"


# ---------------------------------------------------------------------------
# 오인식 보정 (correct_misread)
# ---------------------------------------------------------------------------

def test_샤프_오인식_보정():
    assert correct_misread("FH") == "F#"
    assert correct_misread("Ft") == "F#"
    assert correct_misread("Fe") == "F#"
    assert correct_misread("CH") == "C#"
    assert correct_misread("Ct") == "C#"
    assert correct_misread("Cim7") == "C#m7"
    assert correct_misread("C4m7") == "C#m7"
    assert correct_misread("F47sus4") == "F#7sus4"
    assert correct_misread("Ctaug7") == "C#aug7"
    assert correct_misread("Fim7") == "F#m7"
    assert correct_misread("Ft7") == "F#7"


def test_정상_코드는_보정하지_않음():
    # 이미 유효한 코드는 보정 대상이 아님 (A6 의 6 을 #로 바꾸면 안 됨)
    assert correct_misread("A6") is None
    assert correct_misread("Asus4") is None
    assert correct_misread("Bm7") is None
    assert correct_misread("F#7sus4") is None


def test_보정_불가능한_쓰레기는_None():
    assert correct_misread("FRA") is None
    assert correct_misread("Cvs") is None
    assert correct_misread("CHoE-") is None
    assert correct_misread("hello") is None
    assert correct_misread("") is None


def test_on_베이스_보정():
    # on-베이스 표기를 슬래시 베이스로 (베이스 샤프 오인식도 함께 보정)
    assert correct_misread("DonE") == "D/E"
    assert correct_misread("AonC#") == "A/C#"
    assert correct_misread("Aonct") == "A/C#"   # AonC# 의 # 가 t 로 OCR
    assert correct_misread("Bm7onE") == "Bm7/E"


def test_괄호_텐션_위첨자_보정():
    # C7(13), C7^(13) 의 텐션/위첨자를 제거해 C7 로
    assert correct_misread("C7(13)") == "C7"
    assert correct_misread("C7^(13)") == "C7"


# ---------------------------------------------------------------------------
# TSV 파싱 (parse_tsv)
# ---------------------------------------------------------------------------

_SAMPLE_TSV = """level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext
1\t1\t0\t0\t0\t0\t0\t0\t2481\t3509\t-1\t
5\t1\t1\t1\t1\t1\t633\t644\t140\t40\t93.0\tAsus4
5\t1\t2\t1\t1\t1\t100\t200\t50\t30\t40.6\tFH
5\t1\t3\t1\t1\t1\t300\t400\t60\t30\t0.0\t
5\t1\t4\t1\t1\t1\t500\t600\t60\t30\t-1\tignored"""


def test_TSV_파싱_좌표_스케일_변환():
    # 300 DPI 렌더 → scale = 300/72, PDF 포인트로 환산하려면 픽셀 / scale
    scale = 300.0 / 72.0
    words = parse_tsv(_SAMPLE_TSV, scale)
    assert len(words) == 2  # 빈 텍스트와 conf<0 행은 제외
    w = words[0]
    assert w.text == "Asus4"
    assert w.conf == 93.0
    assert w.x0 == pytest.approx(633 / scale)
    assert w.y0 == pytest.approx(644 / scale)
    assert w.x1 == pytest.approx((633 + 140) / scale)
    assert w.y1 == pytest.approx((644 + 40) / scale)


def test_TSV_파싱_빈_입력():
    assert parse_tsv("", 1.0) == []
    assert parse_tsv("level\tpage_num\ttext", 1.0) == []


# ---------------------------------------------------------------------------
# OCR 단어 → 코드 히트 변환 (ocr_words_to_chord_hits)
# ---------------------------------------------------------------------------

def _word(text, conf=90.0, x0=0.0, y0=0.0):
    return OcrWord(text=text, conf=conf, x0=x0, y0=y0, x1=x0 + 10, y1=y0 + 10)


def test_직접_매치_코드는_그대로_수용():
    hits = ocr_words_to_chord_hits({0: [_word("Asus4"), _word("Bm7"), _word("E7")]})
    assert [h.text for h in hits] == ["Asus4", "Bm7", "E7"]


def test_보정_매치는_루트가_문서에서_확인될_때만_수용():
    # F#7sus4 가 명확히 잡혔으므로 FH → F# 보정 수용
    hits = ocr_words_to_chord_hits({0: [_word("F#7sus4"), _word("FH")]})
    assert sorted(h.text for h in hits) == ["F#", "F#7sus4"]


def test_보정_매치는_루트_미확인_시_거부():
    # 문서 어디에도 명확한 D# 루트가 없으므로 De → D# 보정 거부
    hits = ocr_words_to_chord_hits({0: [_word("Asus4"), _word("De")]})
    assert [h.text for h in hits] == ["Asus4"]


def test_루트_확인은_문서_전체_범위():
    # 1페이지의 C#aug7 가 2페이지의 Cim7 → C#m7 보정을 정당화
    hits = ocr_words_to_chord_hits({
        0: [_word("C#aug7")],
        1: [_word("Cim7")],
    })
    assert sorted(h.text for h in hits) == ["C#aug7", "C#m7"]


def test_수식어_있는_샤프_보정은_직접인식_없어도_수용():
    # C#/G# 는 OCR 에서 늘 깨져 직접 인식이 한 번도 없을 수 있다.
    # 수식어가 붙은 보정 코드(C#m7, G#7)는 가사 오탐 가능성이 낮으므로
    # 루트 확인 없이도 수용하고, 그 루트를 confirmed 에 추가한다.
    hits = ocr_words_to_chord_hits({
        0: [_word("Ctm7"), _word("Gi7")],  # C#m7, G#7
    })
    assert sorted(h.text for h in hits) == ["C#m7", "G#7"]


def test_수식어_보정이_단독_샤프_보정을_정당화():
    # C#m7(수식어 보정) 이 같은 루트의 단독 C#(루트만 보정) 수용을 정당화
    hits = ocr_words_to_chord_hits({
        0: [_word("Ctm7"), _word("Ct")],  # C#m7, C#
    })
    assert sorted(h.text for h in hits) == ["C#", "C#m7"]


def test_근거없는_단독_샤프_보정은_여전히_거부():
    # 'De'→'D#' 같은 단독 루트 보정은 같은 루트의 근거가 없으면 거부 (가사 오탐 차단)
    hits = ocr_words_to_chord_hits({
        0: [_word("Asus4"), _word("De")],
    })
    assert [h.text for h in hits] == ["Asus4"]


def test_on_베이스_결합토큰_변환():
    hits = ocr_words_to_chord_hits({0: [_word("DonE"), _word("Aonct")]})
    assert sorted(h.text for h in hits) == ["A/C#", "D/E"]


def test_on_베이스_분리토큰_결합():
    from instachorda.pdf_ocr import merge_on_bass_tokens

    # OCR 이 'D' 와 'onE' 를 따로 잡은 경우 → 'DonE' 한 토큰으로 결합
    words = [
        OcrWord("D", 89.0, 259.0, 271.0, 266.0, 281.0),
        OcrWord("onE", 93.0, 267.0, 270.0, 285.0, 280.0),
    ]
    merged = merge_on_bass_tokens(words)
    texts = [w.text for w in merged]
    assert "DonE" in texts
    assert "onE" not in texts


def test_on_토큰_왼쪽_코드_없으면_그대로():
    from instachorda.pdf_ocr import merge_on_bass_tokens

    # 왼쪽에 결합할 코드가 없으면 onE 단독으로 남음 (나중 단계에서 버려짐)
    words = [OcrWord("onE", 93.0, 267.0, 270.0, 285.0, 280.0)]
    merged = merge_on_bass_tokens(words)
    assert [w.text for w in merged] == ["onE"]


def test_단일_문자_코드는_고신뢰도만_수용():
    hits = ocr_words_to_chord_hits({0: [
        _word("Asus4"),
        _word("A", conf=96.8),   # 고신뢰도 → 수용
        _word("A", conf=31.1),   # 저신뢰도 → 거부 (가사/장식 오인식 가능성)
    ]})
    assert [h.text for h in hits] == ["Asus4", "A", ]


def test_쓰레기_토큰은_모두_거부():
    hits = ocr_words_to_chord_hits({0: [
        _word("FRA", conf=63.0), _word("Cvs", conf=49.8), _word("Cc", conf=39.1),
    ]})
    assert hits == []


def test_페이지와_좌표가_히트에_보존():
    hits = ocr_words_to_chord_hits({2: [_word("Bm7", x0=12.5, y0=34.5)]})
    assert len(hits) == 1
    h = hits[0]
    assert h.page_index == 2
    assert h.x0 == 12.5
    assert h.y0 == 34.5


# ---------------------------------------------------------------------------
# 다중 OCR 패스 병합 (merge_ocr_words)
# ---------------------------------------------------------------------------

def _w(text, conf, x0, y0, w=30.0, h=10.0):
    return OcrWord(text=text, conf=conf, x0=x0, y0=y0, x1=x0 + w, y1=y0 + h)


def test_같은_위치의_중복_단어는_고신뢰도만_유지():
    from instachorda.pdf_ocr import merge_ocr_words

    # 같은 자리를 서로 다른 패스가 'AM7'(91) / 'Am7'(56) 으로 읽음 → AM7 만 유지
    merged = merge_ocr_words([
        [_w("AM7", 91.0, x0=100, y0=50)],
        [_w("Am7", 56.0, x0=101, y0=51)],
    ])
    assert [(m.text, m.conf) for m in merged] == [("AM7", 91.0)]


def test_다른_위치의_단어는_모두_유지():
    from instachorda.pdf_ocr import merge_ocr_words

    merged = merge_ocr_words([
        [_w("AM7", 91.0, x0=100, y0=50)],
        [_w("A6", 81.0, x0=200, y0=50)],   # x 가 멀리 떨어짐
    ])
    assert sorted(m.text for m in merged) == ["A6", "AM7"]


def test_패스간_보완_병합():
    from instachorda.pdf_ocr import merge_ocr_words

    # 패스 1 은 E 만, 패스 2 는 D 만 인식 → 병합하면 둘 다
    merged = merge_ocr_words([
        [_w("E", 92.0, x0=300, y0=50)],
        [_w("D", 93.0, x0=150, y0=50)],
    ])
    assert sorted(m.text for m in merged) == ["D", "E"]


def test_유효_코드가_쓰레기보다_우선():
    from instachorda.pdf_ocr import merge_ocr_words

    # 같은 위치: 쓰레기 'be:'(conf 67) vs 유효 'B'(conf 92) → B 유지
    merged = merge_ocr_words([
        [_w("be:", 67.0, x0=100, y0=50)],
        [_w("B", 92.0, x0=101, y0=50)],
    ])
    assert [m.text for m in merged] == ["B"]


def test_쓰레기가_고신뢰도여도_유효코드_우선():
    from instachorda.pdf_ocr import merge_ocr_words

    # 마스킹 패스 잡음 'Aut'(conf 80) vs 유효 'A'(conf 60) → A 유지 (유효 우선)
    merged = merge_ocr_words([
        [_w("Aut", 80.0, x0=100, y0=50)],
        [_w("A", 60.0, x0=101, y0=50)],
    ])
    assert [m.text for m in merged] == ["A"]


def test_긴_유효코드가_짧은것보다_우선():
    from instachorda.pdf_ocr import merge_ocr_words

    # 마스킹 패스는 'm' 을 잃어 'B'(93), 일반 패스는 'Bm'(80) → 더 긴 Bm 유지
    merged = merge_ocr_words([
        [_w("B", 93.0, x0=101, y0=50)],
        [_w("Bm", 80.0, x0=100, y0=50)],
    ])
    assert [m.text for m in merged] == ["Bm"]


# ---------------------------------------------------------------------------
# 음표 글리프 분류 (is_music_glyph) — 마스킹 대상 판별
# ---------------------------------------------------------------------------

def _drawing(w, h, fill=True, curve=True, x=100.0, y=100.0, n_items=1):
    """is_music_glyph 테스트용 합성 드로잉 dict."""
    import pymupdf
    return {
        "rect": pymupdf.Rect(x, y, x + w, y + h),
        "items": [("c",) if curve else ("l",)] * n_items,
        "fill": (0.0, 0.0, 0.0) if fill else None,
    }


def test_음표머리는_마스킹대상():
    from instachorda.pdf_ocr import is_music_glyph
    # 음표 머리: 채워진 곡선, 가로(6.4)가 세로(5.7)보다 넓은 기울어진 타원
    assert is_music_glyph(_drawing(6.4, 5.7, fill=True, curve=True), page_width=595)


def test_코드_글자는_마스킹_안함():
    from instachorda.pdf_ocr import is_music_glyph
    # 코드 글자 B/D: 세로(7.1)가 가로(5.4)보다 김 → 음표 아님
    assert not is_music_glyph(_drawing(5.4, 7.1, fill=True, curve=True), page_width=595)
    # 코드 글자 E: 곡선 없는 선분만 → 음표 아님
    assert not is_music_glyph(_drawing(5.2, 7.1, fill=True, curve=False), page_width=595)


def test_기둥과_빔과_오선과_점은_마스킹대상():
    from instachorda.pdf_ocr import is_music_glyph
    pw = 595
    assert is_music_glyph(_drawing(0.5, 16.0), page_width=pw)    # 기둥(stem): 얇고 긴 세로선
    assert is_music_glyph(_drawing(17.8, 4.6), page_width=pw)    # 빔(beam): 넓고 낮은 가로 막대
    assert is_music_glyph(_drawing(481.0, 0.3), page_width=pw)   # 오선(staff line): 페이지 폭의 절반 이상
    assert is_music_glyph(_drawing(1.6, 1.6), page_width=pw)     # 점(dot): 아주 작은 원


def test_coda_segno_과녁기호는_마스킹대상():
    from instachorda.pdf_ocr import is_music_glyph
    # Coda/Segno: 원 + 십자/사선의 채워진 원형 기호. 복잡한 경로(items 많음),
    # 음표머리보다 크고 종횡비가 1 에 가깝다.
    d = _drawing(10.8, 13.9, fill=True, curve=True, n_items=96)
    assert is_music_glyph(d, page_width=595)


def test_음자리표는_마스킹_안함():
    from instachorda.pdf_ocr import is_music_glyph
    # treble clef: 경로는 복잡하지만 세로로 매우 길어(종횡비 작음) Coda 기호와 구분
    d = _drawing(12.6, 33.6, fill=True, curve=True, n_items=118)
    assert not is_music_glyph(d, page_width=595)


# ---------------------------------------------------------------------------
# 오선(staff) 영역 필터 — 코드는 오선 위쪽에만 존재
# ---------------------------------------------------------------------------

def test_오선_상단_감지(tmp_path):
    """가로로 긴 선 5개 묶음(오선) 의 상단 y 좌표를 찾아야 함."""
    import pymupdf

    from instachorda.pdf_ocr import detect_staff_tops

    doc = pymupdf.open()
    page = doc.new_page(width=600, height=800)
    # 오선 2개: y=200~220, y=400~420 (각 5줄, 간격 5)
    for top in (200.0, 400.0):
        for i in range(5):
            y = top + i * 5
            page.draw_line((50, y), (550, y))
    # 짧은 선(오선 아님) 과 세로선은 무시되어야 함
    page.draw_line((50, 600), (100, 600))
    page.draw_line((300, 100), (300, 700))
    pdf = tmp_path / "staves.pdf"
    doc.save(str(pdf))
    doc.close()

    with pymupdf.open(str(pdf)) as d:
        tops = detect_staff_tops(d[0])
    assert tops == pytest.approx([200.0, 400.0], abs=1.0)


def test_오선_없는_페이지는_빈_목록(tmp_path):
    import pymupdf

    from instachorda.pdf_ocr import detect_staff_tops

    doc = pymupdf.open()
    doc.new_page()
    pdf = tmp_path / "blank.pdf"
    doc.save(str(pdf))
    doc.close()

    with pymupdf.open(str(pdf)) as d:
        assert detect_staff_tops(d[0]) == []


def _hit(text, y0, page_index=0):
    from instachorda.pdf_extract import ChordHit
    return ChordHit(page_index=page_index, x0=10.0, y0=y0, x1=40.0, y1=y0 + 10, text=text)


def test_오선_위쪽_코드_영역의_히트만_수용():
    from instachorda.pdf_ocr import filter_hits_by_staff_zones

    # 오선 상단 y=200, 400 인 페이지
    staff_tops = {0: [200.0, 400.0]}
    hits = [
        _hit("Asus4", y0=180),   # 오선 1 위쪽 → 수용
        _hit("Bm7", y0=378),     # 오선 2 위쪽 → 수용
        _hit("F#", y0=210),      # 오선 1 내부 → 거부
        _hit("F#", y0=450),      # 마지막 오선 아래 (가사 영역) → 거부
    ]
    out = filter_hits_by_staff_zones(hits, staff_tops)
    assert [(h.text, h.y0) for h in out] == [("Asus4", 180), ("Bm7", 378)]


def test_오선_미감지_페이지는_필터_안함():
    from instachorda.pdf_ocr import filter_hits_by_staff_zones

    hits = [_hit("Asus4", y0=180), _hit("F#", y0=450)]
    # 오선 정보가 없으면 (빈 목록) 모든 히트 유지
    out = filter_hits_by_staff_zones(hits, {0: []})
    assert len(out) == 2


# ---------------------------------------------------------------------------
# 텍스트 레이어 → OCR 자동 폴백 (extract_chord_hits_auto)
# ---------------------------------------------------------------------------

def test_텍스트_레이어가_있으면_OCR_없이_추출(make_text_pdf):
    from instachorda.pdf_ocr import extract_chord_hits_auto

    pdf = make_text_pdf(["C", "G", "Am", "F", "G7"])

    hits, method = extract_chord_hits_auto(pdf)
    assert method == "text"
    assert {h.text for h in hits} >= {"Am", "G7"}


def test_강제_OCR_플래그(make_text_pdf):
    from instachorda.pdf_ocr import extract_chord_hits_auto, is_tesseract_available

    if not is_tesseract_available():
        pytest.skip("tesseract 없음")

    pdf = make_text_pdf(["C", "G", "Am", "F", "G7"])

    # 텍스트 레이어가 있어도 force_ocr=True 면 OCR 경로 사용
    hits, method = extract_chord_hits_auto(pdf, force_ocr=True)
    assert method == "ocr"


# ---------------------------------------------------------------------------
# 통합 테스트 — tesseract + 실제 PDF 가 있을 때만
# ---------------------------------------------------------------------------

_NAMIDA = Path(__file__).resolve().parent.parent / "namida.pdf"


@pytest.mark.skipif(
    shutil.which("tesseract") is None or not _NAMIDA.exists(),
    reason="tesseract 또는 namida.pdf 없음",
)
def test_통합_텍스트_레이어_없는_PDF_는_OCR_로_폴백():
    from instachorda.pdf_ocr import extract_chord_hits_auto

    hits, method = extract_chord_hits_auto(str(_NAMIDA))
    assert method == "ocr"
    assert len(hits) > 0


@pytest.mark.skipif(
    shutil.which("tesseract") is None or not _NAMIDA.exists(),
    reason="tesseract 또는 namida.pdf 없음",
)
def test_통합_annotate_가_OCR_폴백으로_PDF_생성(tmp_path):
    from instachorda.pdf_extract import annotate_pdf

    out = tmp_path / "annotated.pdf"
    result = annotate_pdf(str(_NAMIDA), str(out), key="A")

    assert result["method"] == "ocr"
    assert result["key"] == "A"
    assert result["count"] > 0
    assert out.exists()


@pytest.mark.skipif(
    shutil.which("tesseract") is None or not _NAMIDA.exists(),
    reason="tesseract 또는 namida.pdf 없음",
)
def test_통합_namida_pdf_에서_코드_추출():
    from instachorda.chord_parser import parse_chord
    from instachorda.kantan_converter import to_kantan
    from instachorda.pdf_ocr import extract_chord_hits_ocr

    hits = extract_chord_hits_ocr(str(_NAMIDA))
    texts = {h.text for h in hits}

    # 악보에 실제로 존재하는 대표 코드들이 잡혀야 함
    # (음표 마스킹 + 다중 패스 OCR 로 음표와 붙은 단일 문자 코드 'B','D','E' 도 복구)
    for expected in ["Asus4", "Bm7", "E7", "AM7", "A", "B", "D", "E"]:
        assert expected in texts, f"{expected} 가 OCR 결과에 없음: {texts}"

    # 샤프 오인식 보정이 동작해야 함 (F#7sus4 가 명확히 있으므로 F# 계열 수용)
    assert any(t.startswith("F#") for t in texts), f"F# 계열 코드가 없음: {texts}"

    # 모든 히트는 파싱 가능하고, 곡의 실제 키(A) 로 변환 가능해야 함
    # (키 자동 추론은 세컨더리 도미넌트가 많은 곡에서 흔들리는 기존 한계가 있어
    #  여기서는 검증하지 않음 — key_detector 의 별도 이슈)
    for h in hits:
        assert parse_chord(h.text) is not None, f"파싱 불가 토큰: {h.text}"
        assert to_kantan(h.text, "A") is not None, f"A 키 변환 불가: {h.text}"

    # 가사 영역 오탐이 없어야 함 — 1페이지 마지막 오선(y≈735) 아래에는 히트가 없어야 함
    page1_hits = [h for h in hits if h.page_index == 0]
    below_staff = [h for h in page1_hits if h.y0 > 740]
    assert below_staff == [], f"가사 영역 오탐: {[(h.text, h.y0) for h in below_staff]}"
