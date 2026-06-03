# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 프로젝트 개요

chordscore.com 의 표준 기타 코드를 Instachord 연주용 **KANTAN 숫자 표기** (예: `C G Am F` → `1 5 6 4`) 로 변환해 페이지에 덧입혀 보여주는 Chrome Manifest V3 확장입니다.

KANTAN 표기 규칙(슬롯 매핑, `~` 스왑, `[b]`/`[#]` 크로매틱, 대괄호 수식어, 슬래시 베이스, 키 자동 추론 휴리스틱)의 자세한 정의는 `README.md` 를 참고하세요. 코드 변경 시 그 규칙을 깨고 있지 않은지 확인이 필요합니다.

## 주요 명령

JS 측 (확장 코어 + Node CLI):

```bash
npm test                                            # 모든 단위 테스트 실행
node --test tests/chord-parser.test.js              # 단일 테스트 파일만 실행
node --test --test-name-pattern='슬래시' tests/*.test.js  # 이름 패턴으로 단일 테스트 실행

npm run cli -- convert --key C "C G Am F"           # CLI 로 변환 테스트
npm run cli -- detect-key "C G Am F G7 C"           # 키 자동 추론
npm run cli -- table --key C                        # KANTAN 테이블 출력
```

Python 측 (PDF 처리용 CLI, `python/`):

```bash
cd python && uv sync                                # 가상환경 + 의존성 설치
uv run pytest                                       # Python 단위 테스트
uv run pytest tests/test_kantan_converter.py        # 단일 테스트 파일
uv run instachorda convert path/to/score.pdf       # PDF 코드 식별 + KANTAN 변환
uv run instachorda annotate score.pdf -o out.pdf   # KANTAN 배지를 그린 새 PDF
```

확장 자체는 빌드 단계가 없습니다. `chrome://extensions` 에서 **압축해제된 확장 프로그램 로드** → `extension/` 폴더 선택. 코드 변경 후에는 확장 카드의 새로고침 아이콘을 눌러 재로드.

## 아키텍처

### 단일 진실 소스: `extension/lib/` (JS) + `python/src/instachorda/` (Python 미러)

JS 측 코어 변환 로직은 `extension/lib/` 한 곳에만 있고, 확장 콘텐츠 스크립트(`extension/adapters/`), CLI(`bin/instachorda.js`), 단위 테스트(`tests/`) 모두 여기서 직접 ES 모듈로 import 합니다. **로직을 수정할 때 절대 다른 곳에 복제하지 마세요** — 깨지면 모든 진입점이 같이 깨져야 합니다.

Python CLI(`python/src/instachorda/{chord_parser,kantan_tables,kantan_converter,key_detector}.py`) 는 JS 코어의 **수동 미러**입니다. 변환 규칙·테이블·휴리스틱이 바뀌면 양쪽을 함께 수정하고, `tests/*.test.js` 와 `python/tests/test_*.py` 의 동일 케이스도 함께 갱신하세요. 동등성은 두 테스트 묶음이 동일한 입력에 대해 동일한 결과를 내는지로 확인합니다.

코어 모듈 의존 그래프:
```
chord-parser.js   ← 표준 코드 텍스트 → 구조화 객체
kantan-tables.js  ← 12 키 × 9 슬롯 매핑 + 반음/이명동음 유틸
kantan-converter.js  → parser + tables
key-detector.js   → converter + tables (마커 최소화 휴리스틱)
```

### 콘텐츠 스크립트 부트스트랩 (왜 두 단계인가)

Manifest V3 의 콘텐츠 스크립트는 ES 모듈을 직접 선언할 수 없습니다. 그래서:

1. `content-bootstrap.js` (manifest 의 `content_scripts` 진입점, 클래식 스크립트) 가
2. `content-main.js` 를 동적 `import()` 하고
3. `content-main.js` 가 host 별 어댑터(`adapters/chordscore.js`) 를 동적 import 합니다.

`lib/*.js`, `adapters/*.js`, `content-main.js` 는 `web_accessible_resources` 에 등록되어 있어야 페이지 컨텍스트에서 import 가능합니다. 새 파일을 추가했는데 로드되지 않으면 `manifest.json` 의 `web_accessible_resources` 를 먼저 확인하세요.

### 사이트 어댑터 패턴

`adapters/chordscore.js` 가 사이트별 모든 DOM 지식을 격리합니다. 다른 사이트 지원을 추가하려면 같은 인터페이스(`init`, `setMode`, `setKey`, `getStatus`)로 새 어댑터를 만들고 `content-main.js` 의 `ADAPTERS` 맵에 host 를 등록 + `manifest.json` 의 `matches` / `web_accessible_resources` 에 도메인을 추가하면 됩니다.

### chordscore.com 어댑터에서 깨지기 쉬운 부분 (주의)

- **셀렉터**: `.css-XXXX` 해시 클래스는 빌드마다 바뀝니다. 절대 의존하지 말고, `<var>` 태그 + `#note-container` ID 셀렉터를 쓰세요. "Original key:" 텍스트를 가진 span 도 텍스트로 찾아야 합니다.
- **MutationObserver 는 `#root` 를 감시**: `#note-container` 는 SPA 네비게이션 때 통째로 교체될 수 있으므로 그것을 감시하면 새 곡 진입 시 죽습니다.
- **배지는 sibling DOM 이 아닌 CSS `::after`**: React 가 자기 트리 밖의 형제 노드를 re-render 시 청소해버리므로, `<var>` 에 `data-kantan` 속성을 걸고 CSS 가 `attr(data-kantan)` 을 읽어 `::after` 로 그리는 방식을 씁니다. 이 구조를 바꾸려면 React 가 안 지운다는 것을 먼저 검증하세요.
- **유니코드 정규화**: chordscore 는 플랫을 `♭`(U+266D) 가 아니라 **`ᵇ`(U+1D47, MODIFIER LETTER SMALL B)** 로 렌더합니다. 샤프는 `♯`(U+266F). 파서 입력 직전에 ASCII `b`/`#` 로 정규화해야 합니다 (`normAccidentals` / `chord-parser.js` 양쪽에 방어 코드 있음).
- **렌더 루프 방지**: `renderAll()` 은 자기가 호출한 MutationObserver 가 본인 DOM 변경에 또 반응하는 무한루프를 막기 위해 렌더 동안 observer 를 `disconnect()` 했다가 `finally` 블록에서 다시 `observe()` 합니다.

### 상태 모델

- 표시 모드(`mode`) — `chrome.storage.local` 에 영속, 페이지 간 유지.
- 사용자 지정 키(`userKey`) — `chrome.storage.local` 에 저장은 되지만, **새 곡 진입(URL 변경) 시 항상 `null`(Auto) 로 리셋**. 콘텐츠 스크립트 `init()` 마지막 단계에서도 리셋. 의도된 동작이므로 "수동 키가 유지 안 됨" 같은 보고는 버그가 아닙니다.
- 팝업 ↔ 콘텐츠 스크립트 통신은 `chrome.storage.local` + `onChanged` 리스너로만. 메시지 패싱 안 씁니다.

## 개발 규약

- Node 20+, ES Modules (`"type": "module"`), 외부 런타임 의존성 0개. 새 npm 의존성 추가는 신중히.
- 모든 주석/문서/사용자 출력은 한국어. LLM 프롬프트가 추가된다면 그것만 영어.
- 새 기능은 `tests/*.test.js` 에 단위 테스트부터. 코어 로직은 DOM 무관하게 작성되어 있어서 Node 테스트 러너로 충분히 검증 가능합니다.
- CLI(`bin/instachorda.js`) 는 단순 디버깅 도구이자 회귀 확인용 — 새 변환 규칙을 추가했다면 CLI 한 줄로 즉시 검증하는 흐름을 유지하세요.
