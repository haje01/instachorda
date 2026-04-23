// 표준 기타 코드 텍스트를 구조화된 객체로 파싱
// 예: "Am7/G" -> { root: 'A', quality: 'min', modifier: '7', bass: 'G' }

const ROOT_PATTERN = /^([A-G])([#b]?)/;

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
  const trimmed = text.trim();
  if (!trimmed) return null;

  const rootMatch = trimmed.match(ROOT_PATTERN);
  if (!rootMatch) return null;

  const root = rootMatch[1] + rootMatch[2];
  let rest = trimmed.slice(root.length);

  // 슬래시 베이스 분리
  let bass = null;
  const slashIdx = rest.indexOf('/');
  if (slashIdx >= 0) {
    const bassPart = rest.slice(slashIdx + 1).trim();
    const bassMatch = bassPart.match(ROOT_PATTERN);
    if (bassMatch) {
      bass = bassMatch[1] + bassMatch[2];
    }
    rest = rest.slice(0, slashIdx);
  }

  const { quality, rest: afterQuality } = detectQuality(rest);
  const modifier = afterQuality.trim();

  // 수식어 유효성: 내부 공백이 있거나 코드 루트 문자([A-G]) 를 포함하면
  // 실제로는 "두 코드가 공백으로 붙은 것" 으로 간주하고 거부.
  if (modifier && /[\sA-G]/.test(modifier)) return null;

  return { root, quality, modifier, bass };
}
