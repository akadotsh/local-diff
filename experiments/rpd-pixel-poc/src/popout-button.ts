/** Inject a small control that opens an independent viewer in a new Rex tab. */
export function installPopoutButton(): void {
  if (document.getElementById("rpd-pixel-popout")) return;
  const button = document.createElement("button");
  button.id = "rpd-pixel-popout";
  button.type = "button";
  button.title = "Open review in a separate Rex tab";
  button.setAttribute("aria-label", button.title);
  button.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 3h7v7"/><path d="M10 14 21 3"/><path d="M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5"/></svg>`;
  Object.assign(button.style, {
    position: "fixed", top: "40px", right: "12px", zIndex: "2147483647",
    width: "30px", height: "28px", display: "grid", placeItems: "center",
    border: "1px solid #45484f", borderRadius: "5px", background: "#24262b",
    color: "#c7c9ce", cursor: "pointer", padding: "0",
  });
  button.addEventListener("mouseenter", () => { button.style.background = "#35383f"; });
  button.addEventListener("mouseleave", () => { button.style.background = "#24262b"; });
  button.addEventListener("click", () => { window.location.href = "rpd-pixel://popout"; });
  document.body.append(button);
}
