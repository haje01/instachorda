# instachorda (Python)

PDF 악보에서 기타 코드를 식별해 KANTAN 숫자 표기로 변환하는 CLI.

기존 Chrome 확장(`extension/`) 의 코어 로직(`chord-parser`, `kantan-tables`, `kantan-converter`, `key-detector`) 을 Python 으로 1:1 포팅한 모듈 위에, PyMuPDF 기반 PDF 코드 추출/주석 기능을 얹은 도구입니다.

## 설치 / 셋업

```bash
cd python
uv sync                # 가상환경 생성 + 의존성 설치

# (선택) 텍스트 레이어가 없는 벡터/스캔 PDF 를 처리하려면 tesseract 필요
brew install tesseract
```

## 사용법

```bash
# PDF 에서 코드 식별 + KANTAN 변환 결과를 콘솔에 출력
uv run instachorda convert path/to/score.pdf

# 키를 지정하고 변환
uv run instachorda convert path/to/score.pdf --key G

# 원본 코드를 KANTAN 표기로 덮어쓴 새 PDF 생성 (주 키 자동 식별)
uv run instachorda annotate path/to/score.pdf -o output.pdf

# 키를 직접 지정
uv run instachorda annotate path/to/score.pdf -o output.pdf --key A

# PDF 사용 없이 코드 문자열만 변환
uv run instachorda chord --key C "C G Am F"
uv run instachorda detect-key "C G Am F G7 C"
uv run instachorda table --key C
```

### OCR 폴백 (벡터/스캔 악보)

ぷりんと楽譜(print-gakufu.com) 등의 구매 악보는 코드명·가사가 텍스트가 아닌
벡터 경로로 그려져 있어 일반적인 텍스트 추출이 불가능합니다.
`convert` / `annotate` 는 텍스트 레이어에서 코드를 찾지 못하면 자동으로
OCR(tesseract) 로 폴백합니다. `--ocr` 플래그로 강제할 수도 있습니다.

```bash
uv run instachorda convert score.pdf --key A          # 자동 폴백
uv run instachorda annotate score.pdf -o out.pdf --ocr  # 강제 OCR
```

OCR 경로는 다음 단계로 코드를 식별합니다:

1. **다중 패스 OCR** — 패스마다 잡는 단어가 달라서 여러 방식으로 읽은 뒤
   위치 기반으로 병합합니다:
   - 전체 페이지(PSM 11)
   - 오선별 코드 영역 스트립(PSM 7/11)
   - **음표 마스킹 + 스트립(PSM 6)** — 멜로디 음이 높아 음표 머리가 코드
     글자와 바짝 붙으면 OCR 이 한 덩어리로 잘못 읽는다. 벡터 드로잉에서
     음표 기보(음표머리·기둥·빔·오선·점·이음줄)를 식별해 흰색으로 덮어
     글자만 남긴 뒤 읽어, 음표와 겹친 단일 문자 코드(`B`/`D`/`E`)를 복구한다.
     음표 머리(가로가 세로보다 넓은 기울어진 타원)와 코드 글자(세로가 더 긴
     글리프)는 종횡비로 구분한다.
2. **병합 우선순위** — 같은 위치의 후보가 겹치면 ① 유효 코드 우선
   (잡음 `Aut` 보다 `A`), ② 더 긴 유효 코드 우선 (마스킹 패스가 `m` 을 잃은
   `B` 보다 일반 패스의 `Bm`), ③ 신뢰도 순. 마스킹 패스가 수식어를 잃어도
   일반 패스 결과로 보존된다.
3. **엄격한 코드 패턴** — 대문자 루트 + 알려진 퀄리티/수식어만 허용
   (가사 OCR 노이즈 차단)
4. **샤프 오인식 보정** — ♯ 글리프가 `H`/`t`/`i`/`4` 등으로 잘못 읽힌 토큰
   (`FH`→`F#`, `Cim7`→`C#m7`, `F47sus4`→`F#7sus4`) 을 보정. 수식어가 붙은
   보정 코드(`C#m7`, `G#7`)는 가사 오탐 가능성이 낮아 직접 인식 없이도 수용하고
   그 루트를 확인 목록에 추가한다. 단독 루트(`C#`, `F#`) 보정은 같은 루트가
   문서 내에서 확인된 경우에만 수용해 가사 오탐(`De`→`D#`)을 막는다.
5. **on-베이스 / 텐션 / 위첨자 정규화** — `DonE`→`D/E`, `AonC#`→`A/C#`
   (베이스의 ♯ 오인식 `Aonct`→`A/C#` 포함), `C7(13)`/`C7^(13)`→`C7`.
   분리되어 잡힌 on-토큰(`D` + `onE`)은 인접 코드와 결합한다.
6. **오선 영역 필터** — 오선 바로 위쪽 코드 영역의 토큰만 남기고 가사/장식
   영역의 오탐을 제거
7. **단일 문자 코드는 고신뢰도만 수용** — `A`, `D` 같은 한 글자 토큰은
   OCR 신뢰도가 높을 때만 코드로 인정

키는 추출된 코드로부터 자동 식별되며, 세컨더리 도미넌트가 많은 곡은
`--key` 로 직접 지정하는 것이 안전합니다.

> 한계: 음표가 코드 글자와 심하게 겹쳐 OCR 이 글자 일부(특히 `m`)나 작은
> 위첨자 텐션(`(13)`)을 통째로 놓치는 경우, 해당 코드는 부분 인식되거나
> 누락될 수 있습니다. 이런 곳은 변환 후 수동 확인을 권장합니다.

## 테스트

```bash
uv run pytest
```

PDF 의존 부분 외 코어 변환 로직은 `tests/` 하위 단위 테스트로 검증됩니다. JS 측 테스트(`../tests/`) 와 동일한 케이스를 공유합니다.

## 아키텍처

```
python/
├── src/instachorda/
│   ├── chord_parser.py      # 코드 텍스트 → 구조화 객체
│   ├── kantan_tables.py     # 12 키 × 9 슬롯 매핑
│   ├── kantan_converter.py  # 코드 → KANTAN 숫자
│   ├── key_detector.py      # 기본 키 자동 추론
│   ├── pdf_extract.py       # PDF 단어 + 좌표 추출, 코드 식별 (텍스트 레이어)
│   ├── pdf_ocr.py           # OCR 코드 추출 (다중 패스 + 음표 마스킹, 벡터/스캔 폴백)
│   └── cli.py               # 서브커맨드 라우터
└── tests/
```

KANTAN 표기 규칙의 정의(슬롯 매핑, `~` 스왑, 크로매틱 `[b]`/`[#]`, 슬래시 베이스 등)는 프로젝트 루트 `README.md` 를 따릅니다.
