// Runs inside the existing viewer; no RPD source files are changed.
export function installTreeCompatibility() {
  const apply = () => {
    const shadow = document.querySelector('.repository-tree')?.shadowRoot;
    if (!shadow || shadow.getElementById('pixel-tree-rounding')) return;
    const style = document.createElement('style');
    style.id = 'pixel-tree-rounding';
    // Fractional Chromium zoom can make a single 30px line measure 30.03px.
    // Keep genuine multi-line overflow markers, tolerate subpixel rounding.
    style.textContent = `@container measure (height <= calc(1lh + 1px)) {
      [data-truncate-marker] { opacity: 0 !important; transition: none !important; }
    }`;
    shadow.append(style);
  };
  new MutationObserver(apply).observe(document.body, { childList: true, subtree: true });
  apply();
}
