import { createRoot, type WebViewHandle } from "@zenbu-labs/pixel";
import { viewerURL } from "./url.js";
import { installTreeCompatibility } from "./tree-compat.js";
import { zoomForKey } from "./zoom.js";

const url = viewerURL(process.argv[2]);
let page: WebViewHandle | undefined;
let viewerZoom = 1;
const root = createRoot({
  name: "Local Diff", devtools: false,
  onKey(event) {
    // Preserve Ctrl+C for copying selected text; reserve Ctrl+Q for closing.
    if (event.kind === "press" && event.mods.ctrl && event.key === "q") {
      root.stop(); return true;
    }
    if (page && event.kind !== "release" && !event.mods.alt && (event.mods.ctrl || event.mods.super)) {
      const next = zoomForKey(viewerZoom, event.key);
      if (next !== undefined) {
        viewerZoom = next;
        page.webContents.setZoomFactor(viewerZoom);
        return true;
      }
    }
  },
});
// Clear the old bitmap on resize so it cannot stretch into the new viewport.
page = root.loadURL(url, { persist: false, keepFrame: false, onOpenWindow: "deny" });
root.setTitle("Local Diff");
page.webContents.on("will-navigate", (event, next) => {
  if (new URL(next).origin !== new URL(url).origin) event.preventDefault();
});
for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"] as const)
  process.once(signal, () => root.stop());
page.webContents.on("did-fail-load", (_event, code, description) => {
  console.error(`Local Diff failed to load (${code}): ${description}`);
  root.stop(1);
});
page.webContents.on("did-finish-load", () => {
  page?.webContents.setZoomFactor(viewerZoom);
  void page?.webContents.executeJavaScript(`(${installTreeCompatibility.toString()})()`)
    .catch(error => console.error("Tree compatibility failed:", error));
});
