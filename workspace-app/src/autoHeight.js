// Auto-height: when embedded in a Softr iframe, report our real
// content height to the parent so the iframe sizes to content instead
// of being forced to 100vh. That keeps the page's footer (e.g. the
// ticket footer) directly below the panel — no dead scroll space.
//
// Pairs with the listener in Reference/softr-workspace-embed.html,
// which sets the iframe height from these messages. Origin-checked on
// both ends.

export function startAutoHeight() {
  if (window.self === window.top) return; // not embedded — nothing to do

  // Measure the app root's laid-out box, NOT document.body.scrollHeight:
  // once the iframe is sized, scrollHeight floors at the iframe's own
  // height and can only ever grow. getBoundingClientRect on #root
  // reflects true content height and shrinks correctly.
  const root = document.getElementById('root') || document.body;
  let last = -1;
  const send = () => {
    const h = Math.max(60, Math.ceil(root.getBoundingClientRect().height));
    if (h !== last) {
      last = h;
      window.parent.postMessage({ source: 'ngsw-workspace', ngswHeight: h }, '*');
    }
  };

  // Content changes (panel swaps, async loads, expanding cards).
  if ('ResizeObserver' in window) {
    new ResizeObserver(send).observe(root);
  }
  window.addEventListener('hashchange', () => setTimeout(send, 50));
  window.addEventListener('load', send);
  // Safety net for late layout (fonts, images) without an observer.
  setInterval(send, 1000);
  send();
}
