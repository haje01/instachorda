"""instachorda CLI — KANTAN 변환 및 PDF 악보 처리.

사용법:
  instachorda convert <PDF>            PDF 에서 코드 식별 + KANTAN 변환 표 출력
  instachorda annotate <PDF> -o <OUT>  KANTAN 배지를 그린 새 PDF 생성
  instachorda chord --key C "C G Am F" 문자열 코드만 변환 (PDF 없이)
  instachorda detect-key "C G Am F"    코드 목록에서 키 추론
  instachorda table [--key C]          KANTAN 테이블 출력

convert / annotate 는 텍스트 레이어가 없는 (벡터/스캔) PDF 를 만나면
자동으로 OCR(tesseract) 로 폴백한다. --ocr 플래그로 강제 가능.
"""

from __future__ import annotations

import argparse
import sys
from typing import Optional

from .kantan_converter import to_kantan
from .kantan_tables import SUPPORTED_KEYS, get_table
from .key_detector import detect_key


def _split_chords(s: str) -> list[str]:
    import re
    return [x for x in re.split(r"[\s|]+", s.strip()) if x]


def _cmd_chord(args: argparse.Namespace) -> int:
    chords = _split_chords(" ".join(args.chords))
    if not chords:
        print('에러: 변환할 코드를 인자로 전달해 주세요. 예: instachorda chord --key C "C G Am F"',
              file=sys.stderr)
        return 1
    key = args.key or detect_key(chords) or "C"
    print(f"[키: {key}]")
    for c in chords:
        k = to_kantan(c, key)
        print(f"  {c:<8} -> {k if k is not None else '(변환불가)'}")
    return 0


def _cmd_detect_key(args: argparse.Namespace) -> int:
    chords = _split_chords(" ".join(args.chords))
    if not chords:
        print("에러: 코드를 전달해 주세요.", file=sys.stderr)
        return 1
    key = detect_key(chords)
    print(key if key is not None else "(감지실패)")
    return 0


def _cmd_table(args: argparse.Namespace) -> int:
    if not args.key:
        print("지원 키:", ", ".join(SUPPORTED_KEYS))
        return 0
    table = get_table(args.key)
    if table is None:
        print(f"에러: 키 '{args.key}' 는 아직 지원되지 않습니다.", file=sys.stderr)
        return 1
    print(f"[{args.key} 키 테이블]")
    for n, slot in table.items():
        suffix = "m" if slot["quality"] == "min" else ("dim" if slot["quality"] == "dim" else "")
        print(f"  {n}: {slot['root']}{suffix}")
    return 0


def _cmd_convert(args: argparse.Namespace) -> int:
    """PDF 에서 코드를 식별해 KANTAN 변환 결과를 페이지/좌표와 함께 출력."""
    from .pdf_extract import hits_to_tokens
    from .pdf_ocr import extract_chord_hits_auto, is_tesseract_available

    try:
        hits, method = extract_chord_hits_auto(args.pdf, force_ocr=args.ocr)
    except FileNotFoundError:
        print(f"에러: 파일을 찾을 수 없습니다: {args.pdf}", file=sys.stderr)
        return 1
    except ImportError:
        print("에러: PyMuPDF 가 설치되어 있지 않습니다. `uv sync` 로 설치해 주세요.", file=sys.stderr)
        return 1
    except RuntimeError as e:
        print(f"에러: {e}", file=sys.stderr)
        return 1

    if not hits:
        if method == "text" or is_tesseract_available():
            print("코드로 식별된 토큰이 없습니다.")
        else:
            print("코드로 식별된 토큰이 없습니다.\n"
                  "이 PDF 는 텍스트 레이어가 없는 (벡터/스캔) 악보일 수 있습니다. "
                  "OCR 을 사용하려면 tesseract 를 설치해 주세요: brew install tesseract",
                  file=sys.stderr)
        return 0

    key: Optional[str] = args.key or detect_key(hits_to_tokens(hits))
    if not key:
        print("KANTAN 키 식별 실패. --key 로 지정해 보세요.", file=sys.stderr)
        return 1

    tag = "수동" if args.key else "자동"
    method_tag = " · OCR" if method == "ocr" else ""
    print(f"[KANTAN 키: {key} ({tag}) · 코드 {len(hits)}개{method_tag}]")
    print(f"{'페이지':>4}  {'좌표':>22}  {'원본':<10}  KANTAN")
    print("-" * 60)
    for h in hits:
        kantan = to_kantan(h.text, key) or "(변환불가)"
        coord = f"({h.x0:6.1f},{h.y0:6.1f})"
        print(f"{h.page_index + 1:>4}  {coord:>22}  {h.text:<10}  {kantan}")
    return 0


def _cmd_annotate(args: argparse.Namespace) -> int:
    """PDF 의 코드를 KANTAN 표기로 덮어쓴 새 PDF 를 저장."""
    from .pdf_extract import annotate_pdf

    try:
        result = annotate_pdf(
            args.pdf,
            args.output,
            key=args.key,
            force_ocr=args.ocr,
        )
    except FileNotFoundError:
        print(f"에러: 파일을 찾을 수 없습니다: {args.pdf}", file=sys.stderr)
        return 1
    except ImportError:
        print("에러: PyMuPDF 가 설치되어 있지 않습니다. `uv sync` 로 설치해 주세요.", file=sys.stderr)
        return 1
    except RuntimeError as e:
        print(f"에러: {e}", file=sys.stderr)
        return 1

    if result["count"] == 0:
        print("코드를 찾지 못했거나 변환 가능한 토큰이 없어 출력 PDF 를 생성하지 못했습니다.",
              file=sys.stderr)
        return 1

    method_tag = " · OCR" if result["method"] == "ocr" else ""
    key_tag = "수동" if args.key else "자동"
    print(f"[KANTAN 키: {result['key']} ({key_tag}){method_tag}] "
          f"{result['pages']}개 페이지, {result['count']}개 코드 덮어씀")
    print(f"저장됨: {args.output}")
    return 0


def _build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="instachorda",
        description="PDF 악보의 기타 코드를 KANTAN 숫자 표기로 변환",
    )
    sub = p.add_subparsers(dest="cmd", required=True)

    pc = sub.add_parser("chord", help="문자열 코드를 KANTAN 으로 변환")
    pc.add_argument("--key", help="기본 키 (생략 시 자동 추론)")
    pc.add_argument("chords", nargs="+", help='코드들 (예: "C G Am F")')
    pc.set_defaults(func=_cmd_chord)

    pd = sub.add_parser("detect-key", help="코드 목록에서 키 자동 추론")
    pd.add_argument("chords", nargs="+", help='코드들 (예: "C G Am F")')
    pd.set_defaults(func=_cmd_detect_key)

    pt = sub.add_parser("table", help="KANTAN 테이블 출력")
    pt.add_argument("--key", help="볼 키 (생략 시 지원 키 목록)")
    pt.set_defaults(func=_cmd_table)

    pcv = sub.add_parser("convert", help="PDF 에서 코드 식별 + KANTAN 변환 표 출력")
    pcv.add_argument("pdf", help="입력 PDF 경로")
    pcv.add_argument("--key", help="기본 키 (생략 시 자동 추론)")
    pcv.add_argument(
        "--ocr",
        action="store_true",
        help="텍스트 레이어가 있어도 강제로 OCR 사용 (벡터/스캔 악보는 자동 폴백됨)",
    )
    pcv.set_defaults(func=_cmd_convert)

    pan = sub.add_parser("annotate", help="원본 코드를 KANTAN 표기로 덮어쓴 새 PDF 생성")
    pan.add_argument("pdf", help="입력 PDF 경로")
    pan.add_argument("-o", "--output", required=True, help="출력 PDF 경로")
    pan.add_argument("--key", help="KANTAN 키 (생략 시 자동 식별)")
    pan.add_argument(
        "--ocr",
        action="store_true",
        help="텍스트 레이어가 있어도 강제로 OCR 사용 (벡터/스캔 악보는 자동 폴백됨)",
    )
    pan.set_defaults(func=_cmd_annotate)

    return p


def main(argv: Optional[list[str]] = None) -> int:
    parser = _build_parser()
    args = parser.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
