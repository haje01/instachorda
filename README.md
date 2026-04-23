# Instachorda

기타 코드 제공 사이트(우선 [chordscore.com](https://chordscore.com))의 표준 기타 코드를 [Instachord](https://www.instachord.com/) 연주용 **KANTAN 숫자 표기**로 변환하여 원본 옆에 병기해 주는 크롬 확장.

예: `C G Am F` → `C(1) G(5) Am(6) F(4)`

## 주요 기능 (MVP)

- 표준 기타 코드 파싱 (메이저/마이너/7th/maj7/sus4/슬래시 코드 등)
- 페이지 코드 목록에서 **기본 키 자동 추론**
- 키별 **KANTAN 테이블**을 기반으로 숫자 변환 (수식어는 `[ ]`, 마이너 `m` → `~` 스왑)
- chordscore.com 페이지 로드 및 전조(transpose) 시 자동 재변환 (구현 예정)
- 팝업에서 키 수동 지정 / 표시 토글 (구현 예정)

## 실행 환경

- Node.js 20+ (테스트/CLI 실행용)
- Chrome / Chromium 계열 (확장 로드용)

## 프로젝트 디렉토리 구성

```
instachorda/
├── extension/               # 크롬 확장 본체 (유일 진실 소스)
│   ├── manifest.json        # Manifest V3
│   ├── content-bootstrap.js # 동적 import 부트스트랩
│   ├── content-main.js      # 페이지 주입 엔트리
│   ├── popup.html / popup.js
│   └── lib/                 # 코어 로직 (파서, 변환기, 키 추론, 테이블)
├── bin/instachorda.js       # Node CLI (변환 로직 터미널 테스트)
├── tests/                   # node --test 단위 테스트
├── configs/                 # 설정 파일 (yaml, 추후 사용)
├── package.json
└── README.md
```

코어 로직은 `extension/lib/` 아래에 두고, 테스트와 CLI도 이곳을 import 하여 **중복을 없앴음**.

## 빠른 시작

### 테스트

```bash
npm test
```

### CLI 사용

```bash
# 특정 키로 변환
node bin/instachorda.js convert --key C "C G Am F G7 C/G"

# 키 자동 추론
node bin/instachorda.js detect-key "C G Am F"

# 키별 테이블 확인
node bin/instachorda.js table --key C
```

`package.json` 의 `bin` 등록으로 `npm link` 후에는 `instachorda ...` 로도 실행 가능.

### 확장 로드 (개발 모드)

1. Chrome 주소창에 `chrome://extensions` 접속
2. 우상단 **개발자 모드** 토글 ON
3. **압축해제된 확장 프로그램 로드** 클릭 → 이 저장소의 `extension/` 폴더 선택
4. chordscore.com 페이지로 이동 후 DevTools 콘솔에 `[Instachorda]` 로그가 보이면 로드 성공

## KANTAN 표기 규칙

- 각 **기본 키별로 1~9 슬롯**에 특정 코드가 매핑됨 (Instachord 버튼 배열 기준)
- C키 예: `{1: C, 2: Dm, 3: Em, 4: F, 5: G, 6: Am, 7: Bm, 8: Eb, 9: Bb}`
- 수식어는 `[ ]` 안에: `G7` → `5[7]`, `Fmaj7` → `4[maj7]`
- 테이블에 없는 마이너는 `m` → `~` 스왑: C키에서 `Cm` → `1~`
- 슬래시 코드는 `/` 로 연결: `C/G` → `1/5`

> 현재 C키 외 다른 키의 테이블은 **다이어토닉 추정치(플레이스홀더)** 입니다.
> 사용자가 각 키의 Instachord 실제 화면을 확인한 뒤 `extension/lib/kantan-tables.js` 에서 교체할 예정.

## 로드맵 / TODO

- [x] chordscore.com DOM 분석 및 어댑터 작성 (`extension/adapters/chordscore.js`)
- [x] 코드 옆 KANTAN 병기 렌더링
- [x] 전조/페이지 갱신 감지 (MutationObserver) → 재변환
- [x] 팝업과 content script 간 `chrome.storage.local` 기반 상태 공유 (키 수동 지정, 토글)
- [ ] C키 외 다른 키별 실제 KANTAN 테이블 확인 및 반영
- [ ] 확장 아이콘 (16/48/128 PNG)
- [ ] 다른 한국 기타코드 사이트 어댑터 추가

### 수집 스크립트

`scripts/inspect-chordscore.js` — chordscore.com 페이지 DOM 구조를 리포트하는 콘솔 스크립트.
다른 사이트 어댑터를 작성할 때 참고용으로 활용 가능.

## 테스트 하기

`node --test` 기반 단위 테스트.

```bash
npm test
# 또는
node --test tests/*.test.js
```

테스트 대상:
- `chord-parser.test.js` — 코드 파싱 (루트/퀄리티/수식어/슬래시)
- `kantan-converter.test.js` — KANTAN 숫자 변환 규칙
- `key-detector.test.js` — 기본 키 자동 추론
