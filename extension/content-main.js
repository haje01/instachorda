// content-main.js - 페이지 주입 엔트리.
// 호스트명에 따라 사이트별 어댑터를 동적 로드.

const LOG = '[Instachorda]';

const ADAPTERS = {
  'chordscore.com': './adapters/chordscore.js',
  'www.chordscore.com': './adapters/chordscore.js',
  'tabs.ultimate-guitar.com': './adapters/ultimate-guitar.js',
  'www.ultimate-guitar.com': './adapters/ultimate-guitar.js',
  'ultimate-guitar.com': './adapters/ultimate-guitar.js',
};

export async function init() {
  const host = location.hostname;
  const adapterPath = ADAPTERS[host];
  if (!adapterPath) {
    console.log(`${LOG} 지원하지 않는 호스트:`, host);
    return;
  }
  try {
    const url = chrome.runtime.getURL(adapterPath.replace(/^\.\//, ''));
    const mod = await import(url);
    mod.init?.();
    // 다른 스크립트에서 제어할 수 있게 전역 참조 노출
    window.__instachorda__ = mod;
    console.log(`${LOG} 어댑터 로드 완료: ${host}`);
  } catch (e) {
    console.error(`${LOG} 어댑터 로드 실패:`, e);
  }
}
