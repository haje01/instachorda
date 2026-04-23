// 콘텐츠 스크립트는 ES 모듈을 직접 쓸 수 없어 동적 import 로 메인 모듈 로드.
// 실제 로직은 content-main.js 에 있음.

(async () => {
  try {
    const url = chrome.runtime.getURL('content-main.js');
    const mod = await import(url);
    mod.init?.();
  } catch (e) {
    console.error('[Instachorda] bootstrap 실패:', e);
  }
})();
