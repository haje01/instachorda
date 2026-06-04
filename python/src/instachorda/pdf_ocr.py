"""OCR 기반 코드 추출 — 텍스트 레이어가 없는 (벡터/스캔) PDF 악보용.

구매 악보(예: print-gakufu.com)는 코드명·가사가 텍스트가 아닌 벡터 경로로
그려져 있어 `page.get_text()` 로 추출이 불가능하다. 이 모듈은:

1. PyMuPDF 로 페이지를 비트맵 렌더 (기본 300 DPI)
2. tesseract 를 stdin/stdout 파이프로 호출해 단어 박스(TSV) 추출
3. 엄격한 코드 패턴 + 샤프 오인식 보정으로 코드 토큰만 식별

tesseract 는 시스템 바이너리를 사용한다 (macOS: `brew install tesseract`).

OCR 특유의 노이즈 때문에 코어 파서(parse_chord)보다 훨씬 엄격한 검증을 쓴다:
- 루트는 대문자만 (가사 OCR 쓰레기 'fam', 'be' 차단)
- 수식어는 알려진 형태만 (쓰레기 'Fe', 'Cvs', 'FRA' 차단)
- 샤프(♯) 글리프 오인식('FH','Cim7','F47sus4' 등)은 보정을 시도하되,
  보정된 루트가 문서 내 다른 명확한 코드의 루트와 일치할 때만 수용
  (가사 쓰레기 'De'→'D#' 같은 오탐 차단)
"""

from __future__ import annotations

import re
import shutil
import subprocess
from dataclasses import dataclass
from typing import Optional

from .chord_parser import _norm_chord_text
from .pdf_extract import ChordHit

# 렌더 해상도. 300 DPI 에서 코드 토큰 인식률이 가장 안정적이었음.
DEFAULT_DPI = 300

# 음표 마스킹 스트립 전용 고해상도. 스트립은 작은 영역이라 부담이 적고,
# Coda 줄의 단독 'A' 같은 작은 글리프를 인접 텍스트에서 분리 인식하는 데 유리.
MASK_DPI = 400

# 단일 문자 코드('A', 'D' 등)는 가사/장식 오인식 가능성이 높아 고신뢰도만 수용.
SINGLE_CHAR_MIN_CONF = 60.0

# tesseract PSM 11: sparse text — 악보처럼 텍스트가 띄엄띄엄 있는 이미지에 적합.
_TESSERACT_PSM = "11"

# 음표 마스킹 패스용 문자 화이트리스트 — 코드에 쓰이는 글자/숫자/기호와
# 샤프(♯) 오인식으로 나올 수 있는 글자(H/t/i/e/l 등)만 허용해 잡음을 줄인다.
_CHORD_WHITELIST = "ABCDEFGabcdefgHILMTilmnorstuj#b/0123456789!"


@dataclass(frozen=True)
class OcrWord:
    """OCR 로 추출한 단어 하나. 좌표는 PDF 포인트 단위."""
    text: str
    conf: float
    x0: float
    y0: float
    x1: float
    y1: float


# ---------------------------------------------------------------------------
# 엄격한 코드 패턴
# ---------------------------------------------------------------------------

# 루트(대문자만) + 퀄리티 + 숫자 + 알려진 수식어 연쇄 + 슬래시 베이스.
# 숫자는 2~9 또는 11/13 만 허용 ('F47sus4' 의 47 같은 오인식 차단).
_NUM = r"(?:1[13]|[2-9])"
_STRICT_CHORD_RE = re.compile(
    r"^[A-G][#b]?"                                    # 루트
    r"(?:m(?!aj)|maj|dim|aug|M|sus|add)?"             # 퀄리티 또는 첫 수식어
    rf"{_NUM}?"                                       # 숫자 (6, 7, 9, 11, 13 등)
    rf"(?:(?:sus|add|maj|M|dim|aug|[#b+-]){_NUM}?)*"  # 추가 수식어 연쇄 (sus4, b5, M7 등)
    r"(?:/[A-G][#b]?)?$"                              # 슬래시 베이스
)

# ♯ 글리프가 OCR 에서 잘못 읽히는 글자들 (실측: H, t, i, 4, e / 예방: 유사 형태)
_SHARP_MISREADS = set("HhTtIiLl1!4eEf*")
# ♭ 오인식 (보통은 'b' 로 잘 읽히므로 예방 차원의 최소 집합)
_FLAT_MISREADS = set("pP")


def match_strict_chord(token: str) -> bool:
    """OCR 토큰이 엄격한 코드 패턴에 맞는지 검사."""
    if not token:
        return False
    return _STRICT_CHORD_RE.match(token) is not None


def _fix_part_accidental(part: str) -> str:
    """음이름 바로 뒤(액시덴탈 자리)의 샤프/플랫 오인식을 보정.

    'Ct'->'C#', 'ct'->'C#', 'Cim7'->'C#m7', 'E'->'E'. 음이름이 아니면 그대로.
    """
    if not part:
        return part
    head = part[0].upper()
    if head not in "ABCDEFG":
        return part
    rest = part[1:]
    if rest and rest[0] in _SHARP_MISREADS:
        return head + "#" + rest[1:]
    if rest and rest[0] in _FLAT_MISREADS:
        return head + "b" + rest[1:]
    return head + rest


def correct_misread(token: str) -> Optional[str]:
    """OCR 오인식/표기 변형을 보정해 유효한 코드 문자열로 만든다.

    - 샤프(♯) 글리프 오인식: 음이름 뒤 H/t/i/4/e 등을 '#' 로 (FH->F#, Cim7->C#m7)
    - 위첨자(^)·괄호 텐션((13))·on-베이스(DonE) 는 코어 정규화로 처리
      (DonE->D/E, C7^(13)->C7). 슬래시 베이스 양쪽의 액시덴탈 오인식도 보정
      (Aonct -> A/C#)

    원본이 이미 유효한 코드면 보정하지 않는다 (None).
    """
    if not token:
        return None
    if match_strict_chord(token):
        return None  # 이미 유효 — 보정 불필요

    norm = _norm_chord_text(token)
    if "/" in norm:
        main, _, bass = norm.partition("/")
        candidate = _fix_part_accidental(main) + "/" + _fix_part_accidental(bass)
    else:
        candidate = _fix_part_accidental(norm)

    if candidate != token and match_strict_chord(candidate):
        return candidate
    return None


# ---------------------------------------------------------------------------
# tesseract 호출 + TSV 파싱
# ---------------------------------------------------------------------------

def is_tesseract_available() -> bool:
    """시스템에 tesseract 바이너리가 있는지 확인."""
    return shutil.which("tesseract") is not None


def _run_tesseract_tsv(
    png_bytes: bytes,
    psm: str = _TESSERACT_PSM,
    whitelist: Optional[str] = None,
) -> str:
    """PNG 바이트를 stdin 으로 넘겨 tesseract TSV 출력을 받는다 (임시 파일 없음)."""
    cmd = ["tesseract", "stdin", "stdout", "--psm", psm, "tsv"]
    if whitelist:
        cmd += ["-c", f"tessedit_char_whitelist={whitelist}"]
    proc = subprocess.run(
        cmd,
        input=png_bytes,
        capture_output=True,
    )
    if proc.returncode != 0:
        stderr = proc.stderr.decode("utf-8", errors="replace")
        raise RuntimeError(f"tesseract 실행 실패 (코드 {proc.returncode}): {stderr[:500]}")
    return proc.stdout.decode("utf-8", errors="replace")


def parse_tsv(
    tsv_text: str,
    scale: float,
    origin: tuple[float, float] = (0.0, 0.0),
) -> list[OcrWord]:
    """tesseract TSV 출력을 OcrWord 목록으로 변환.

    scale: 렌더 줌 비율 (DPI / 72). 픽셀 좌표를 scale 로 나눠 PDF 포인트로 환산.
    origin: 렌더가 페이지 일부(clip) 였을 때 그 영역의 PDF 좌표 원점.
    """
    lines = tsv_text.splitlines()
    if len(lines) < 2:
        return []

    header = lines[0].split("\t")
    try:
        idx = {k: header.index(k) for k in ("left", "top", "width", "height", "conf", "text")}
    except ValueError:
        return []

    ox, oy = origin
    words: list[OcrWord] = []
    for line in lines[1:]:
        fields = line.split("\t")
        if len(fields) <= idx["text"]:
            continue
        text = fields[idx["text"]].strip()
        conf = float(fields[idx["conf"]])
        if not text or conf < 0:
            continue  # 빈 텍스트, 또는 레이아웃 행 (conf=-1)
        left, top = float(fields[idx["left"]]), float(fields[idx["top"]])
        width, height = float(fields[idx["width"]]), float(fields[idx["height"]])
        words.append(OcrWord(
            text=text,
            conf=conf,
            x0=left / scale + ox,
            y0=top / scale + oy,
            x1=(left + width) / scale + ox,
            y1=(top + height) / scale + oy,
        ))
    return words


def _boxes_overlap(a: OcrWord, b: OcrWord) -> bool:
    """두 단어 박스가 위치상 같은 단어로 볼 만큼 겹치는지 (겹침 비율 > 0.5)."""
    overlap_x = min(a.x1, b.x1) - max(a.x0, b.x0)
    overlap_y = min(a.y1, b.y1) - max(a.y0, b.y0)
    if overlap_x <= 0 or overlap_y <= 0:
        return False
    min_w = min(a.x1 - a.x0, b.x1 - b.x0)
    min_h = min(a.y1 - a.y0, b.y1 - b.y0)
    return overlap_x > min_w * 0.5 and overlap_y > min_h * 0.5


def _is_chordlike(text: str) -> bool:
    """엄격 패턴에 맞거나 샤프/플랫 보정으로 맞춰지는, 코드일 법한 토큰인지."""
    return match_strict_chord(text) or correct_misread(text) is not None


# 'onE' 처럼 on-베이스가 별도 토큰으로 분리된 경우를 감지하는 패턴
_ON_TOKEN_RE = re.compile(r"^on[A-Ga-g][#b]?$")
# on-토큰을 결합할 왼쪽 코드와의 같은 줄 / 가로 간격 허용치 (pt)
_ON_MERGE_ROW_TOL = 6.0
_ON_MERGE_GAP = 14.0


def merge_on_bass_tokens(words: list[OcrWord]) -> list[OcrWord]:
    """분리되어 잡힌 on-베이스 토큰('onE')을 바로 왼쪽 코드 토큰과 결합.

    OCR 이 'DonE' 를 'D' + 'onE' 로 따로 잡는 경우가 있어, 같은 줄에서 바로
    왼쪽에 인접한 토큰과 합쳐 'DonE' 한 토큰으로 만든다 (이후 correct_misread
    가 'D/E' 로 변환). 왼쪽에 결합할 토큰이 없으면 그대로 둔다.
    """
    drop: set[int] = set()
    result = list(words)
    for i, ow in enumerate(words):
        if not _ON_TOKEN_RE.match(ow.text):
            continue
        best = None
        for j, lw in enumerate(words):
            if j == i or j in drop:
                continue
            if abs(lw.y0 - ow.y0) > _ON_MERGE_ROW_TOL:
                continue
            gap = ow.x0 - lw.x1
            if -3.0 <= gap <= _ON_MERGE_GAP:
                if best is None or lw.x1 > words[best].x1:
                    best = j
        if best is not None:
            lw = result[best]
            result[best] = OcrWord(
                text=lw.text + ow.text,
                conf=min(lw.conf, ow.conf),
                x0=lw.x0, y0=min(lw.y0, ow.y0),
                x1=ow.x1, y1=max(lw.y1, ow.y1),
            )
            drop.add(i)
    return [w for k, w in enumerate(result) if k not in drop]


def merge_ocr_words(word_lists: list[list[OcrWord]]) -> list[OcrWord]:
    """여러 OCR 패스의 결과를 병합. 같은 위치의 중복은 더 나은 후보만 유지.

    전체 페이지 OCR, 오선별 스트립 OCR, 음표 마스킹 OCR 은 서로 다른 단어를
    잡으므로(예: 한쪽은 'E' 만, 다른 쪽은 'D' 만) 병합으로 커버리지를 높인다.

    겹치는 후보 간 우선순위:
    1. 코드일 법한 토큰 우선 (마스킹 패스 잡음 'Aut' 보다 유효 'A')
    2. 코드끼리는 더 긴 것 우선 (마스킹 패스가 'm' 을 잃은 'B' 보다 'Bm')
    3. 그 다음 신뢰도
    """
    all_words = [w for words in word_lists for w in words]

    def rank(w: OcrWord) -> tuple:
        chordlike = _is_chordlike(w.text)
        return (
            0 if chordlike else 1,                  # 유효 코드 우선
            -(len(w.text)) if chordlike else 0,     # 유효 코드는 긴 것 우선
            -w.conf,                                # 신뢰도 높은 것 우선
        )

    all_words.sort(key=rank)
    merged: list[OcrWord] = []
    for w in all_words:
        if not any(_boxes_overlap(w, kept) for kept in merged):
            merged.append(w)
    return merged


# ---------------------------------------------------------------------------
# 오선(staff) 감지 + 코드 영역 필터
# ---------------------------------------------------------------------------

# 코드는 오선 상단에서 이 거리(pt) 이내 위쪽에 위치한다고 가정.
STAFF_CHORD_ZONE_HEIGHT = 40.0
# 오선 상단보다 약간 아래까지는 허용 (OCR 박스 오차).
_STAFF_ZONE_TOLERANCE = 2.0
# 오선으로 인정할 가로선의 최소 길이 (페이지 폭 대비 비율).
_STAFF_LINE_MIN_WIDTH_RATIO = 0.5
# 같은 오선에 속하는 줄 간 최대 간격 (pt).
_STAFF_LINE_MAX_GAP = 15.0


def is_music_glyph(drawing: dict, page_width: float) -> bool:
    """벡터 드로잉이 기보 요소(음표머리/기둥/빔/오선/점/이음줄/Coda·Segno)인지 판별.

    OCR 전에 이 요소들을 흰색으로 덮으면, 음이 높아 코드 글자와 바짝 붙거나
    Coda/Segno 같은 기호가 코드 옆에 있어도 코드 글자만 남아 인식률이 오른다.

    코드 글자와의 구분 핵심: 음표 머리는 기울어진 타원이라 **가로가 세로보다
    넓지만**, 코드 글자(B/D/E 등)는 세로가 더 길다. 이 종횡비로 분리한다.
    """
    r = drawing["rect"]
    w, h = r.width, r.height
    filled = drawing.get("fill") is not None
    has_curve = any(it[0] == "c" for it in drawing["items"])
    n_items = len(drawing["items"])

    # 오선: 페이지 폭의 절반 이상인 가로선
    if h < 1.5 and w >= page_width * _STAFF_LINE_MIN_WIDTH_RATIO:
        return True
    # 기둥(stem): 아주 얇고 긴 세로선
    if w <= 2.5 and h >= 8:
        return True
    # 빔(beam): 채워진, 넓고 낮은 가로 막대
    if filled and w >= 10 and h <= 6:
        return True
    # 점(dot): 아주 작은 채워진 원
    if filled and w < 3 and h < 3:
        return True
    # 이음줄/타이(slur/tie): 거의 납작한 짧은 곡선
    if h <= 1.5 and 3 <= w <= 25:
        return True
    # 음표 머리: 채워진 곡선이고 가로가 세로보다 넓은 작은 타원
    if filled and has_curve and 3 <= h <= 9 and 4 <= w <= 12 and w >= h:
        return True
    # Coda/Segno 기호(⊕, 𝄋): 원 + 십자/사선의 복잡한 채워진 원형 경로.
    # 경로 세그먼트가 많고(>=40) 종횡비가 1 에 가까워, 세로로 매우 긴
    # 음자리표와 구분된다. 코드 글자(세그먼트 적음)도 자연히 제외된다.
    if filled and n_items >= 40 and 8 <= w <= 20 and 8 <= h <= 20 \
            and 0.5 <= w / max(h, 0.1) <= 1.5:
        return True
    return False


def _mask_music_glyphs(page) -> int:
    """페이지의 음표 기보 요소를 흰 사각형으로 덮는다. 덮은 개수를 반환.

    page 를 변경하므로, 원본을 보존해야 하는 호출자는 사본에 적용할 것.
    """
    import pymupdf  # type: ignore

    page_width = page.rect.width
    masked = 0
    for drawing in page.get_drawings():
        if is_music_glyph(drawing, page_width):
            r = drawing["rect"]
            page.draw_rect(
                pymupdf.Rect(r.x0 - 0.3, r.y0 - 0.3, r.x1 + 0.3, r.y1 + 0.3),
                color=(1, 1, 1), fill=(1, 1, 1), width=0,
            )
            masked += 1
    return masked


def detect_staff_tops(page) -> list[float]:
    """페이지의 벡터 드로잉에서 오선 상단 y 좌표들을 감지.

    가로로 긴 선들을 모아 가까운 것끼리 묶고, 5줄 이상인 묶음을 오선으로 본다.
    오선이 없는 페이지(일반 문서 등)는 빈 목록을 반환.
    """
    page_width = page.rect.width
    min_width = page_width * _STAFF_LINE_MIN_WIDTH_RATIO

    ys: set[float] = set()
    for drawing in page.get_drawings():
        for item in drawing["items"]:
            if item[0] == "l":  # 선분
                p1, p2 = item[1], item[2]
                if abs(p1.y - p2.y) < 0.5 and abs(p2.x - p1.x) >= min_width:
                    ys.add(round(p1.y, 1))
            elif item[0] == "re":  # 매우 납작한 사각형도 선으로 취급
                r = item[1]
                if r.height < 1.5 and r.width >= min_width:
                    ys.add(round((r.y0 + r.y1) / 2, 1))

    if not ys:
        return []

    # 가까운 y 끼리 묶어 오선 후보 그룹 생성
    sorted_ys = sorted(ys)
    groups: list[list[float]] = [[sorted_ys[0]]]
    for y in sorted_ys[1:]:
        if y - groups[-1][-1] <= _STAFF_LINE_MAX_GAP:
            groups[-1].append(y)
        else:
            groups.append([y])

    # 5줄 이상인 그룹만 오선으로 인정, 상단(최소 y) 반환
    return [g[0] for g in groups if len(g) >= 5]


def filter_hits_by_staff_zones(
    hits: list[ChordHit],
    staff_tops_by_page: dict[int, list[float]],
    zone_height: float = STAFF_CHORD_ZONE_HEIGHT,
) -> list[ChordHit]:
    """오선 위쪽 코드 영역에 있는 히트만 남긴다.

    악보에서 코드명은 오선 바로 위에 적히므로, 오선 내부나 아래(가사 영역) 의
    히트는 OCR 오탐으로 보고 제거한다. 오선이 감지되지 않은 페이지는 필터하지 않음.
    """
    out: list[ChordHit] = []
    for h in hits:
        tops = staff_tops_by_page.get(h.page_index, [])
        if not tops:
            out.append(h)  # 오선 정보 없음 — 필터 불가
            continue
        in_zone = any(
            top - zone_height <= h.y0 <= top + _STAFF_ZONE_TOLERANCE
            for top in tops
        )
        if in_zone:
            out.append(h)
    return out


# ---------------------------------------------------------------------------
# OCR 단어 → 코드 히트
# ---------------------------------------------------------------------------

def ocr_words_to_chord_hits(
    words_by_page: dict[int, list[OcrWord]],
    single_char_min_conf: float = SINGLE_CHAR_MIN_CONF,
) -> list[ChordHit]:
    """OCR 단어들에서 코드만 골라 ChordHit 목록으로 변환.

    검증 단계:
    1. 직접 매치 — 엄격한 패턴을 그대로 통과하는 토큰 (단일 문자는 고신뢰도만)
    2. 수식어 있는 보정 매치 — 샤프 보정 결과가 루트만이 아닌(수식어 포함)
       코드(C#m7, G#7)는 가사 오탐 가능성이 낮으므로 직접 인식 없이도 수용하고,
       그 루트를 confirmed 에 추가. (C#/G# 는 OCR 에서 늘 깨져 직접 인식이 한
       번도 없을 수 있어, 이 신뢰가 없으면 모든 인스턴스가 거부된다)
    3. 루트만인 보정 매치 — 단독 샤프(C#, F#)·플랫 보정은 가사('De'→'D#')
       오탐 위험이 있어, 같은 루트가 1·2단계에서 확인된 경우에만 수용.
    """
    _ROOT_RE = re.compile(r"^[A-G][#b]?")

    def _is_bare_root(text: str) -> bool:
        m = _ROOT_RE.match(text)
        return m is not None and m.group(0) == text

    # 수집: 직접 매치 / 수식어 보정 / 루트만 보정 으로 분류
    direct: list[tuple[int, OcrWord]] = []
    rich_corrected: list[tuple[int, OcrWord, str]] = []   # 수식어 있는 보정
    bare_corrected: list[tuple[int, OcrWord, str]] = []   # 루트만 보정
    confirmed_roots: set[str] = set()

    for page_index, words in words_by_page.items():
        for w in words:
            if match_strict_chord(w.text):
                if len(w.text) == 1 and w.conf < single_char_min_conf:
                    continue  # 저신뢰도 단일 문자 — 가사/장식 오인식 가능성
                direct.append((page_index, w))
                m = _ROOT_RE.match(w.text)
                if m:
                    confirmed_roots.add(m.group(0))
            else:
                fixed = correct_misread(w.text)
                if fixed is None:
                    continue
                if _is_bare_root(fixed):
                    bare_corrected.append((page_index, w, fixed))
                else:
                    rich_corrected.append((page_index, w, fixed))

    hits: list[ChordHit] = []

    def _add(page_index: int, w: OcrWord, text: str) -> None:
        hits.append(ChordHit(
            page_index=page_index, x0=w.x0, y0=w.y0, x1=w.x1, y1=w.y1, text=text,
        ))

    # 1단계: 직접 매치
    for page_index, w in direct:
        _add(page_index, w, w.text)
    # 2단계: 수식어 있는 보정은 신뢰 수용 + 루트를 confirmed 에 추가
    for page_index, w, fixed in rich_corrected:
        _add(page_index, w, fixed)
        m = _ROOT_RE.match(fixed)
        if m:
            confirmed_roots.add(m.group(0))
    # 3단계: 루트만 보정은 confirmed 루트일 때만 수용
    for page_index, w, fixed in bare_corrected:
        m = _ROOT_RE.match(fixed)
        if m and m.group(0) in confirmed_roots:
            _add(page_index, w, fixed)

    # 페이지 → y → x 순으로 정렬 (악보 읽기 순서)
    hits.sort(key=lambda h: (h.page_index, h.y0, h.x0))
    return hits


def extract_chord_hits_auto(
    pdf_path: str,
    force_ocr: bool = False,
    dpi: int = DEFAULT_DPI,
) -> tuple[list[ChordHit], str]:
    """텍스트 레이어 우선, 없으면 OCR 로 폴백해 코드 히트를 추출.

    Returns: (hits, method) — method 는 "text" 또는 "ocr".
    """
    from .pdf_extract import extract_chord_hits, filter_likely_chords

    if not force_ocr:
        text_hits = filter_likely_chords(extract_chord_hits(pdf_path))
        if text_hits:
            return text_hits, "text"

    # 텍스트 레이어에서 못 찾았거나 강제 OCR — 벡터/스캔 악보로 간주
    return extract_chord_hits_ocr(pdf_path, dpi=dpi), "ocr"


def _staff_strip(page, top: float):
    """오선 상단 top 위쪽 코드 영역 스트립의 clip 사각형."""
    import pymupdf  # type: ignore

    return pymupdf.Rect(
        0, max(0.0, top - STAFF_CHORD_ZONE_HEIGHT),
        page.rect.width, top + _STAFF_ZONE_TOLERANCE,
    )


def _ocr_page_words(page, dpi: int) -> tuple[list[OcrWord], list[float]]:
    """한 페이지를 다중 패스로 OCR 해서 병합된 단어 목록과 오선 상단 목록을 반환.

    패스 구성:
    1. 전체 페이지 PSM 11 (sparse text) — 넓게 훑기
    2. 오선별 코드 영역 스트립 PSM 7 / 11 — 스트립 내 보완
    3. 오선별 코드 영역 스트립 **음표 마스킹 + PSM 6** — 음이 높아 음표와 붙은
       단일 문자 코드(B/D/E 등) 복구. 음표 기보를 흰색으로 덮어 글자만 남긴 뒤,
       균일 텍스트 블록(PSM 6) + 화이트리스트로 읽는다.

    패스마다 잡는 단어가 달라서 위치 기반 병합(유효 코드/길이/신뢰도 우선)으로
    합친다. 마스킹 패스는 'm' 같은 수식어를 잃을 수 있지만, 병합 규칙이 더 긴
    유효 코드를 우선하므로 일반 패스의 'Bm' 이 마스킹 패스의 'B' 로 퇴화하지 않는다.
    """
    import pymupdf  # type: ignore

    scale = dpi / 72.0
    staff_tops = detect_staff_tops(page)

    # 패스 1: 전체 페이지
    pix = page.get_pixmap(dpi=dpi)
    passes: list[list[OcrWord]] = [
        parse_tsv(_run_tesseract_tsv(pix.tobytes("png"), psm="11"), scale),
    ]

    # 패스 2, 3: 오선별 코드 영역 스트립 (마스킹 전, 원본 그대로)
    for top in staff_tops:
        clip = _staff_strip(page, top)
        strip_png = page.get_pixmap(dpi=dpi, clip=clip).tobytes("png")
        origin = (clip.x0, clip.y0)
        for psm in ("7", "11"):
            passes.append(parse_tsv(_run_tesseract_tsv(strip_png, psm=psm), scale, origin))

    # 패스 4: 음표 마스킹 후 오선별 스트립 (PSM 6 + 화이트리스트)
    # 원본 page 를 변경하지 않도록 사본 문서에 마스킹을 적용한다.
    # 스트립은 작은 영역이라 고해상도(MASK_DPI)로 렌더해, Coda 줄의 단독 'A'
    # 처럼 작은 글리프도 인접 텍스트('Coda')에 묻히지 않고 분리 인식되게 한다.
    if staff_tops:
        mask_scale = MASK_DPI / 72.0
        with pymupdf.open() as masked_doc:
            masked_doc.insert_pdf(page.parent, from_page=page.number, to_page=page.number)
            masked_page = masked_doc[0]
            _mask_music_glyphs(masked_page)
            for top in staff_tops:
                clip = _staff_strip(masked_page, top)
                strip_png = masked_page.get_pixmap(dpi=MASK_DPI, clip=clip).tobytes("png")
                origin = (clip.x0, clip.y0)
                passes.append(parse_tsv(
                    _run_tesseract_tsv(strip_png, psm="6", whitelist=_CHORD_WHITELIST),
                    mask_scale, origin,
                ))

    return merge_ocr_words(passes), staff_tops


def extract_chord_hits_ocr(pdf_path: str, dpi: int = DEFAULT_DPI) -> list[ChordHit]:
    """PDF 의 모든 페이지를 OCR 해서 코드로 식별된 단어 위치를 반환.

    텍스트 레이어가 없는 PDF 용. tesseract 가 설치되어 있어야 한다.
    """
    # 지역 import — PyMuPDF 가 없어도 코어 라이브러리는 동작.
    import pymupdf  # type: ignore

    if not is_tesseract_available():
        raise RuntimeError(
            "tesseract 가 설치되어 있지 않습니다. macOS: brew install tesseract"
        )

    words_by_page: dict[int, list[OcrWord]] = {}
    staff_tops_by_page: dict[int, list[float]] = {}
    with pymupdf.open(pdf_path) as doc:
        for page_index, page in enumerate(doc):
            words, staff_tops = _ocr_page_words(page, dpi)
            # 분리된 on-베이스 토큰('D' + 'onE')을 결합
            words_by_page[page_index] = merge_on_bass_tokens(words)
            staff_tops_by_page[page_index] = staff_tops

    hits = ocr_words_to_chord_hits(words_by_page)
    # 오선 위쪽 코드 영역 밖의 히트(가사/장식 오탐) 제거
    return filter_hits_by_staff_zones(hits, staff_tops_by_page)
