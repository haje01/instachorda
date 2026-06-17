# Instachorda

기타 코드 제공 사이트 ([chordscore.com](https://chordscore.com), [ultimate-guitar.com](https://ultimate-guitar.com), [songsterr.com](https://songsterr.com)) 의 표준 기타 코드를 [Instachord](https://en.instachord.com/) 연주용 **KANTAN 숫자 표기** 로 변환해 주는 크롬 확장.

예 (C 키): `C G Am F` → `1 5 6 4`, `Dm7` → `2[7]`, `Cm` → `1~`, `C/G` → `1/5`

## 주요 기능

- **12개 기본 키 × 9 슬롯** 의 KANTAN 매핑 테이블 (Instachord 실제 배치 기준)
- 표준 기타 코드 파싱 — 메이저/마이너/7/maj7/sus2/sus4/add/dim/aug, 슬래시 베이스, 이명동음(`B♭` = `Bb` = `A#` = `Bᵇ`), 소문자 루트(`c7`) 지원
  - on-베이스 표기(`DonE` = `D/E`), 괄호 텐션(`C7(13)` → `C7`), 위첨자 마커(`^`) 정규화 포함
- **기본 키 자동 추론** — 각 후보 키로 전체 코드를 변환했을 때 보조 마커(`~`, `[b]`, `[#]`) 가 가장 적게 쓰이는 키를 선택. 토닉 보너스, 보너스 슬롯(8/9) 사용 패널티 포함 (자주 나오는 코드가 보너스 슬롯에 배치되는 키 회피)
- **Instachord 연주용 코드 간략화 (항상 적용)** — 복잡한 텐션·알터레이션(`m7b5`, `13`, `add9` 등)을 연주 가능한 표현으로 축약. 예: `D#m7b5`(E 키) → `7[7]`. 자세한 규칙은 아래 KANTAN 표기 규칙 참고
- 지원 사이트(chordscore.com, ultimate-guitar.com, songsterr.com) 페이지에서 각 코드 위치에 **KANTAN 배지 렌더링** (CSS `::after` 기반)
- **전조 / SPA 네비게이션 자동 감지** — MutationObserver 로 DOM 변화를, URL 변화로 새 곡 진입을 감지해 자동 재변환
- **3-모드 표시 토글** — 코드만 / 코드+KANTAN / KANTAN만 (기본값: KANTAN만)
- 새 곡 진입 시 **기본 키는 자동(Auto) 으로 리셋** (사용자의 수동 지정은 해당 페이지 동안만 유지)
- 곡 제목/키 표시 근처에 **감지된 KANTAN 키 표시** (chordscore 는 "Original key" 아래, ultimate-guitar·songsterr 는 곡 제목 아래)
- **악보 인쇄 (chordscore.com)** — KANTAN 키 표시 옆 `🖨 악보 인쇄` 버튼으로 사이트 헤더·네비·광고를 제외하고 악보(`#note-container`)만 깔끔하게 인쇄. 현재 표시 모드(코드/KANTAN)를 그대로 반영하며, 인쇄 시 배지는 잉크 절약을 위해 검은 글씨로 출력

## KANTAN 표기 규칙

- 각 기본 키에 **슬롯 1~9** 로 특정 코드가 매핑됨 (Instachord 버튼 배열 기준)
  - C 키 예시: `1=C, 2=Dm, 3=Em, 4=F, 5=G, 6=Am, 7=Bm, 8=Eb, 9=Bb`
  - G 키 예시: `1=G, 2=Am, 3=Bm, 4=C, 5=D, 6=Em, 7=F#m, 8=A#, 9=F`
- **수식어는 대괄호 `[ ]` 안에** — `G7` → `5[7]`, `Fmaj7` → `4[maj7]`, `Dsus4` → `2[sus4]`
- **`~` 스왑** — 슬롯의 메이저/마이너 퀄리티를 반전 (양방향)
  - C 키 슬롯 1 은 `C`(major). `Cm` → `1~`
  - B 키 슬롯 6 은 `G#m`(minor). `G#` → `6~`
  - `sus` 수식어는 3도를 제거하므로 swap 불필요
- **크로매틱 시프트** — 테이블에 없는 근음은 가까운 슬롯 + `[b]`/`[#]`
  - 반음 위 슬롯이 있으면 `[b]` 우선, 없으면 반음 아래 슬롯 + `[#]`
  - 예: G 키에 Db 가 없으므로 `Db` → `5[b]` (슬롯 5 가 D)
- **크로매틱 + 수식어 결합** — 같은 대괄호에 — 예: `Bb7` → `3[b7]` (Bb가 크로매틱인 키에서)
- **dim / aug** — 퀄리티 수식어로 흡수 — 예: `Bdim` (C 키) → `7[dim]`
- **슬래시 코드** — 각 파트를 변환하여 `/` 로 — `C/G` (C 키) → `1/5`
- **연주용 간략화 (항상 적용)** — Instachord 에서 직접 누를 수 있는 표현(퀄리티 maj/min(`~`)/dim/aug, 수식어 `6`·`7`·`maj7`·`9`·`sus4`, 크로매틱 `b`/`#`)만 남기고, 그 밖의 복잡한 텐션·알터레이션은 성격을 보존하는 선에서 축약함. 복잡한 코드(`D#m7b5` → `5~[b7b5]`)가 연주 불가능·무의미해지는 것을 방지.
  - `m7b5`(하프디미니시드) → **m7** (b5 만 버리고 단3도+단7도 보존, 실연주 시 dim 트라이어드보다 잘 어울림) — `D#m7b5`(E 키) → `7[7]`, `Bm7b5`(A 키) → `2[7]`. (7 없는 드문 `mb5` 표기만 dim 트라이어드)
  - **확장/알터레이션 도미넌트 → `7`** (단독 `9` 는 유지) — `E13`/`E7b9`/`E11` → `5[7]`, `E9` → `5[9]`
  - **maj 계열 → `maj7`** — `Emaj9` → `5[maj7]`
  - **`6`·`sus4` 유지, `sus2`·`add9` 등 → 트라이어드** — `D6` → `4[6]`, `Dsus4` → `4[sus4]`, `Dsus2`/`Dadd9` → `4`
  - `dim`/`aug` 는 지원 퀄리티이므로 유지하되 붙은 수식어만 제거 — `Cdim7` → `8[dim]`

## 실행 환경

- Chrome / Chromium 계열 (확장 로드용)
- Node.js 20+ (단위 테스트 실행용)

## 프로젝트 디렉토리 구성

```
instachorda/
├── extension/                   # 크롬 확장 본체 (유일 진실 소스)
│   ├── manifest.json            # Manifest V3
│   ├── content-bootstrap.js     # 동적 import 부트스트랩
│   ├── content-main.js          # 호스트별 어댑터 로더
│   ├── popup.html / popup.js    # 팝업 UI (모드 토글, 키 수동 지정)
│   ├── adapters/
│   │   ├── chordscore.js        # chordscore.com 전용 어댑터
│   │   ├── ultimate-guitar.js   # ultimate-guitar.com 전용 어댑터
│   │   └── songsterr.js         # songsterr.com 전용 어댑터
│   └── lib/                     # 코어 로직 (사이트 무관)
│       ├── chord-parser.js      # 표준 코드 텍스트 → 구조화 객체
│       ├── kantan-converter.js  # 코드 → KANTAN 숫자 표기
│       ├── kantan-tables.js     # 12 키 × 9 슬롯 매핑 + 이명동음 유틸
│       └── key-detector.js      # 기본 키 자동 추론
├── tests/                       # node --test 단위 테스트
├── scripts/                     # DOM 분석용 콘솔 스크립트
├── package.json
└── README.md
```

코어 로직(`extension/lib/`) 은 확장과 단위 테스트가 직접 import 하여 중복이 없습니다.

## 빠른 시작

### 확장 로드 (개발 모드)

1. Chrome 주소창에 `chrome://extensions` 접속
2. 우상단 **개발자 모드** 토글 ON
3. **압축해제된 확장 프로그램 로드** 클릭 → 이 저장소의 `extension/` 폴더 선택
4. chordscore.com / ultimate-guitar.com / songsterr.com 의 곡 페이지로 이동. 각 코드 위치에 녹색 KANTAN 배지가 표시되면 성공
5. 확장 아이콘(퍼즐 조각) 클릭 → **Instachorda 팝업** 에서 모드/키 전환

### 팝업

- **표시 모드** — `코드만` / `코드+KANTAN` / `KANTAN만` 중 선택 (기본: KANTAN만)
- **기본 키** — `자동` 또는 12 개 키 중 수동 지정
  - 수동 지정은 해당 페이지 내에서만 유지. 새 곡으로 이동하면 자동으로 리셋
- 팝업과 content script 는 `chrome.storage.local` 을 통해 상태 공유

### 사이트 지원 범위

현재 **chordscore.com**, **ultimate-guitar.com**(무료 코드 탭), **songsterr.com**(코드 보기) 지원. 사이트마다 DOM 구조가 다르므로 각각 전용 어댑터로 격리:

- **chordscore.com** — 코드가 `<var>` 태그에 담기고, 플랫/샾을 유니코드 기호(`ᵇ`/`♯`)로 렌더. 슬래시 베이스가 별도 `<var>` 로 쪼개져 어댑터가 결합.
- **ultimate-guitar.com** — 코드가 모노스페이스 `<pre>` 안 `<span data-name="...">` 에 담기며, 코드명이 `data-name` 속성에 그대로 들어있음. 슬래시 베이스(`Am/G`)도 한 span 에 통째로 담김. `data-name` 을 단일 진실 소스로 사용. 코드 `<span>` 이 없는 탭 악보/Pro 페이지에서는 자동으로 동작하지 않음. 흰 배경이라 배지 색은 어두운 초록(`#15803d`). UG 가 코드 span 의 `::after` 에 `opacity:0.1` 을 걸어두므로 배지 CSS 에서 `opacity:1` 로 복구해야 함(안 하면 배지가 거의 안 보임).
- **songsterr.com** — 각 코드는 `<label data-chord="C">` 형태이며 코드명이 `data-chord` 속성에 담김(샾은 유니코드 `♯`). 슬래시 베이스도 한 label. 가사 줄은 코드가 음절 **위 줄**에 쌓이는 컬럼 구조라, 원본 코드 label 의 박스(코드 행 높이)를 `visibility:hidden` 으로 유지한 채 `::after` 를 absolute 로 덧그려 KANTAN 을 코드 자리에 표시(label 내부 span 을 `display:none` 으로 지우면 코드 행이 사라져 KANTAN 이 가사와 겹침). 흰 배경이라 배지 색은 어두운 초록(`#15803d`). 키 인디케이터는 `h1`(flex 컨테이너) 바로 뒤에 블록으로 삽입해 제목 아래 줄에 표시.

다른 기타 코드 사이트는 `extension/adapters/` 에 동일한 인터페이스(`init`/`setMode`/`setKey`/`getStatus`)로 어댑터를 추가하고, `content-main.js` 의 `ADAPTERS` 맵과 `manifest.json` 의 `matches`/`web_accessible_resources` 에 도메인을 등록하면 지원 가능.

## 테스트 하기

Node.js 내장 테스트 러너 사용.

```bash
npm test
# 또는
node --test tests/*.test.js
```

테스트 대상:
- `chord-parser.test.js` — 코드 파싱 (루트/퀄리티/수식어/슬래시/유니코드/소문자)
- `kantan-converter.test.js` — KANTAN 변환 규칙 (~ 스왑, 크로매틱, dim/aug, 이명동음)
- `key-detector.test.js` — 기본 키 자동 추론 (마커 최소화 휴리스틱)

## PDF 악보 변환 (Python CLI)

PDF 악보에서 코드를 식별해 KANTAN 으로 변환하는 Python CLI 도 함께 제공합니다. 코어 변환 로직은 위 JS 모듈을 그대로 포팅한 것이고, PDF 처리는 PyMuPDF 기반입니다.

```bash
cd python && uv sync
uv run instachorda convert path/to/score.pdf            # 식별된 코드 + KANTAN 표 출력
uv run instachorda annotate score.pdf -o out.pdf        # 코드를 KANTAN 표기로 덮어쓴 새 PDF
uv run instachorda chord --key C "C G Am F"             # PDF 없이 문자열만 변환
```

`annotate` 는 크롬 익스텐션과 동일하게 **주 KANTAN 키를 자동 식별**한 뒤, 원본 코드를 KANTAN 표기로 덮어쓰고 식별된 키를 1페이지에 라벨로 표시합니다.

텍스트 레이어가 없는 (벡터/스캔) PDF — 예: ぷりんと楽譜 등 구매 악보 — 는 자동으로 OCR 로 폴백해 코드를 식별합니다. OCR 사용에는 [tesseract](https://github.com/tesseract-ocr/tesseract) 가 필요합니다 (`brew install tesseract`).

> ⚠️ **OCR 기반 PDF 변환의 한계.** 텍스트 레이어가 없는 악보는 OCR 로 코드를 읽으므로 완벽하지 않습니다. 다음과 같은 경우 코드가 누락·오인식될 수 있습니다.
> - 멜로디 음이 높아 음표가 코드 글자와 심하게 겹치면 글자 일부(특히 `m`)나 작은 위첨자 텐션(`(13)` 등)을 통째로 놓쳐, 해당 코드가 부분 인식되거나(예: `C#m7` → `C#`) 누락될 수 있음
> - 샤프(`#`) 가 `t`/`i`/`4` 등으로, 베이스/on-표기가 깨져 읽히는 등 글리프 오인식
> - 세컨더리 도미넌트가 많은 곡은 키 자동 추론이 흔들릴 수 있음 → `--key` 로 직접 지정 권장
>
> 변환 결과는 **참고용**으로 보고, 중요한 부분은 원본과 대조해 수동 확인하세요. 텍스트 레이어가 있는 PDF 는 OCR 없이 정확히 처리됩니다.

자세한 내용은 [`python/README.md`](python/README.md) 참조.

## 고품질 OCR PDF 변환 (python2 / instachord)

`python2/` 에는 OCR 품질 개선을 목표로 한 새 CLI 가 있습니다. 텍스트 레이어가 있으면 먼저 사용하고, 스캔/벡터 PDF 는 GPT Vision OCR 또는 tesseract OCR 로 코드 위치를 찾아 KANTAN 표기로 덮어쓴 PDF 를 저장합니다.

```bash
cd python2
uv sync
uv run instachord annotate path/to/score.pdf -o out.pdf
uv run instachord convert path/to/score.pdf
```

GPT OCR 을 사용하려면 OpenAI API 키와 선택 의존성을 설정합니다.

```bash
cd python2
uv sync --extra gpt
export OPENAI_API_KEY=...
uv run instachord annotate score.pdf -o out.pdf --ocr --ocr-engine gpt
```

자세한 내용은 [`python2/README.md`](python2/README.md) 참조.
