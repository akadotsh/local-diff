// Pixel denies browser popups. Route the viewer's toolbar action to its Rex host.
export function installPopoutButton(): void {
  document.addEventListener("click", event => {
    if (!(event.target instanceof Element) || !event.target.closest("header button.popout-button")) return;
    event.preventDefault();
    event.stopPropagation();
    window.location.href = "rpd-pixel://popout";
  }, true);
}
