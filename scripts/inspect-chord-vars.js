// chordscore.com 악보 페이지에서 DevTools 콘솔에 붙여넣어 실행.
// 특정 "문제 있는" 코드의 실제 DOM 구조, 텍스트 코드포인트, 가상 요소를 리포트.

(() => {
  const vars = Array.from(document.querySelectorAll('#note-container var, var'));
  const summarize = (v) => {
    const text = v.textContent;
    const codePoints = [...text].map(c => {
      const h = c.codePointAt(0).toString(16).toUpperCase().padStart(4, '0');
      return `${c}(U+${h})`;
    }).join(' ');
    const innerHTML = v.innerHTML;
    const before = getComputedStyle(v, '::before').content;
    const after = getComputedStyle(v, '::after').content;
    return {
      text,
      codePoints,
      innerHTML: innerHTML.slice(0, 200),
      outerHTML: v.outerHTML.slice(0, 300),
      before: (before !== 'none' && before !== 'normal') ? before : null,
      after: (after !== 'none' && after !== 'normal') ? after : null,
    };
  };

  // 1) 모든 var 의 unique text 목록
  const unique = new Map();
  for (const v of vars) {
    const t = v.textContent;
    if (!unique.has(t)) unique.set(t, v);
  }
  const uniqueList = Array.from(unique.entries()).map(([t, v]) => ({
    text: t,
    count: vars.filter(x => x.textContent === t).length,
    sample: summarize(v),
  }));

  // 2) B 또는 C 로 시작하는 것들 자세히
  const bcVars = uniqueList.filter(u => /^[BC]/.test(u.text));

  // 3) ASCII 가 아닌 문자가 있는 것들
  const nonAscii = uniqueList.filter(u => /[^\x20-\x7E]/.test(u.text));

  // 4) 가상 요소가 있는 것들
  const withPseudo = uniqueList.filter(u => u.sample.before || u.sample.after);

  const report = {
    totalVars: vars.length,
    uniqueTexts: uniqueList.length,
    bcVars,
    nonAscii,
    withPseudo,
    // 처음 10개 모든 variant (디버깅용)
    firstTen: uniqueList.slice(0, 10),
  };

  console.log('%c=== Instachorda Chord Var Inspector ===', 'font-weight:bold; color:#0a0');
  console.log(JSON.stringify(report, null, 2));
  try { navigator.clipboard.writeText(JSON.stringify(report, null, 2)); console.log('클립보드 복사됨.'); } catch {}
  return report;
})();
