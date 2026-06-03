// 표준 기타 코드 텍스트를 구조화된 객체로 파싱
// 예: "Am7/G" -> { root: 'A', quality: 'min', modifier: '7', bass: 'G' }

// 루트 문자는 대소문자 모두 허용 (예: "c7" 도 C 로 해석). 파싱 후 대문자로 정규화.
const ROOT_PATTERN = /^([A-Ga-g])([#b]?)/;

// 퀄리티 감지 우선순위: dim/aug/sus 는 따로 처리, 마이너는 'm' 뒤에 'a'(maj)가 오지 않는 경우
function detectQuality(body) {
  if (body.startsWith('dim')) return { quality: 'dim', rest: body.slice(3) };
  if (body.startsWith('aug')) return { quality: 'aug', rest: body.slice(3) };
  // 'maj' 로 시작하면 메이저로 보고 수식어에 포함
  if (body.startsWith('maj')) return { quality: 'maj', rest: body };
  // 'm' 뒤에 'aj' 가 없으면 마이너
  if (body.startsWith('m') && !body.startsWith('maj')) {
    return { quality: 'min', rest: body.slice(1) };
  }
  return { quality: 'maj', rest: body };
}

export function parseChord(text) {
  if (!text || typeof text !== 'string') return null;
  // 유니코드 플랫/샾 변형을 ASCII b/# 로 정규화 (사이트별 렌더링 차이 대응).
  // ♭(U+266D), ᵇ(U+1D47 MODIFIER LETTER SMALL B), ♯(U+266F).
  let trimmed = text.replace(/[♭ᵇ]/g, 'b').replace(/♯/g, '#').trim();
  // 위첨자 마커(^) 제거, 괄호 텐션((13),(b9) 등) 무시,
  // on-베이스(DonE) 를 슬래시 베이스(D/E) 로 정규화.
  trimmed = trimmed
    .replace(/\^/g, '')
    .replace(/\([^)]*\)/g, '')
    .replace(/on([A-Ga-g][#b]?)/g, '/$1');
  if (!trimmed) return null;

  const rootMatch = trimmed.match(ROOT_PATTERN);
  if (!rootMatch) return null;

  const root = rootMatch[1].toUpperCase() + rootMatch[2];
  // 매칭한 원본 길이만큼 소비 (대소문자 섞여도 길이는 같음)
  let rest = trimmed.slice(rootMatch[0].length);

  // 슬래시 베이스 분리
  let bass = null;
  const slashIdx = rest.indexOf('/');
  if (slashIdx >= 0) {
    const bassPart = rest.slice(slashIdx + 1).trim();
    const bassMatch = bassPart.match(ROOT_PATTERN);
    if (bassMatch) {
      bass = bassMatch[1].toUpperCase() + bassMatch[2];
    }
    rest = rest.slice(0, slashIdx);
  }

  const { quality, rest: afterQuality } = detectQuality(rest);
  const modifier = afterQuality.trim();

  // 수식어 유효성: 내부 공백이 있거나 대문자 루트 문자([A-G]) 를 포함하면
  // 실제로는 "두 코드가 공백으로 붙은 것" 으로 간주하고 거부.
  // 소문자는 maj/add/sus 등 정상 수식어의 일부이므로 금지하지 않음.
  if (modifier && /[\sA-G]/.test(modifier)) return null;

  return { root, quality, modifier, bass };
}
