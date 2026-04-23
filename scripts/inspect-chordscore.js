// chordscore.com 악보 페이지에서 DevTools 콘솔에 붙여넣어 실행.
// 기타 코드가 담긴 DOM 구조와 전조 버튼 후보를 리포트.
//
// 사용법:
//   1) chordscore.com 에 로그인 후 예시 곡(Let It Be 등) 페이지 열기
//   2) F12 → Console 탭
//   3) 아래 즉시실행함수 전체를 복사해서 붙여넣고 엔터
//   4) 출력된 JSON 전체를 복사해서 작업자(Claude)에게 전달

(() => {
  const report = { url: location.href, title: document.title };

  // 1) 제목/메타
  const h1 = document.querySelector('h1');
  report.h1 = h1 ? h1.textContent.trim() : null;

  // 2) 기타 코드 패턴: A-G 로 시작 + (#/b)? + (m|dim|aug|maj|sus|7|9|...)? + (/bass)?
  const CHORD_RE = /^[A-G][#b]?(m|dim|aug|maj\d*|sus[24]?|add\d+|\d+)*(\/[A-G][#b]?)?$/;

  // 코드 텍스트를 담고 있을 가능성 있는 element 스캔
  // 텍스트 노드 단위로 훑되, 컨테이너 요소를 수집
  const treeWalker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null);
  const hits = [];
  let n;
  while ((n = treeWalker.nextNode())) {
    const t = n.textContent.trim();
    if (!t || t.length > 8) continue;
    if (!CHORD_RE.test(t)) continue;
    const el = n.parentElement;
    if (!el) continue;
    hits.push({ text: t, el });
  }

  report.totalChordTextNodes = hits.length;

  // 3) 가장 공통적인 부모 클래스 찾기 (코드를 감싸는 span/div 의 className)
  const classCount = {};
  const tagCount = {};
  for (const h of hits) {
    const cls = h.el.className || '(no-class)';
    const tag = h.el.tagName.toLowerCase();
    classCount[cls] = (classCount[cls] || 0) + 1;
    tagCount[tag] = (tagCount[tag] || 0) + 1;
  }
  report.topClasses = Object.entries(classCount).sort((a, b) => b[1] - a[1]).slice(0, 5);
  report.topTags = Object.entries(tagCount).sort((a, b) => b[1] - a[1]).slice(0, 5);

  // 4) 샘플 5개의 완전한 컨텍스트 (태그/클래스/부모 체인)
  report.samples = hits.slice(0, 5).map(h => {
    const chain = [];
    let cur = h.el;
    for (let i = 0; i < 5 && cur; i++) {
      chain.push(`${cur.tagName.toLowerCase()}${cur.className ? '.' + String(cur.className).split(/\s+/).join('.') : ''}${cur.id ? '#' + cur.id : ''}`);
      cur = cur.parentElement;
    }
    return {
      text: h.text,
      outerHTML: h.el.outerHTML.slice(0, 300),
      chain,
    };
  });

  // 5) 전조 관련 후보 버튼/컨트롤 탐색
  const buttons = Array.from(document.querySelectorAll('button, [role="button"], a, input[type="button"]'));
  const keywords = ['조', '전조', '키', 'key', 'transpose', '#', 'b', '♯', '♭', '올림', '내림', '+', '-', '▲', '▼', '△', '▽'];
  const transposeCandidates = buttons
    .map(b => ({ tag: b.tagName.toLowerCase(), text: b.textContent.trim().slice(0, 30), aria: b.getAttribute('aria-label'), cls: b.className }))
    .filter(b => b.text && b.text.length <= 20 && keywords.some(k => (b.text + ' ' + (b.aria || '')).toLowerCase().includes(k.toLowerCase())))
    .slice(0, 20);
  report.transposeCandidates = transposeCandidates;

  // 6) 악보 영역 루트 후보 (코드 텍스트가 많이 몰린 공통 조상)
  const findCommonAncestor = (elements) => {
    if (elements.length === 0) return null;
    let cur = elements[0];
    while (cur && cur !== document.body) {
      if (elements.every(e => cur.contains(e))) return cur;
      cur = cur.parentElement;
    }
    return null;
  };
  const sampleElems = hits.slice(0, Math.min(30, hits.length)).map(h => h.el);
  const ancestor = findCommonAncestor(sampleElems);
  if (ancestor) {
    report.commonAncestor = {
      tag: ancestor.tagName.toLowerCase(),
      cls: ancestor.className,
      id: ancestor.id,
      childCount: ancestor.children.length,
    };
  }

  // 출력
  console.log('%c=== Instachorda DOM Inspector ===', 'font-weight:bold; color:#0a0');
  console.log(JSON.stringify(report, null, 2));
  // 클립보드에도 복사 시도
  try {
    navigator.clipboard.writeText(JSON.stringify(report, null, 2));
    console.log('%c클립보드에 복사됨. 그대로 붙여넣어 전달하세요.', 'color:#08c');
  } catch (e) {
    console.log('(클립보드 복사 실패 — 위 JSON을 수동 복사)');
  }
  return report;
})();
