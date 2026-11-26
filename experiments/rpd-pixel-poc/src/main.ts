import { createRoot, type WebViewHandle } from "@zenbu-labs/pixel";
import { appendFileSync, readFileSync } from "node:fs";
import { viewerURL } from "./url.js";
import { installTreeCompatibility } from "./tree-compat.js";
import { zoomForKey } from "./zoom.js";
import { installPopoutButton } from "./popout-button.js";
import { spawn } from "node:child_process";

const url = viewerURL(process.argv[2]);
const started = performance.now();
const log = (event: string, data: unknown) => {
  if (process.env.RPD_PIXEL_LOG) appendFileSync(process.env.RPD_PIXEL_LOG,
    JSON.stringify({ event, elapsedMs: performance.now() - started, data }) + "\n");
};
let page: WebViewHandle | undefined;
let viewerZoom = 1;
let popoutStarted = false;
const root = createRoot({
  name: "RPD Pixel POC", devtools: false,
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
  onResize(size) {
    log("host-resize", size);
    if (process.env.RPD_PIXEL_LOG && page) {
      const at = performance.now();
      void page.webContents.executeJavaScript(`new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve({width:innerWidth,height:innerHeight}))))`)
        .then(viewport => log("resize-to-browser-two-raf", { ms: performance.now() - at, viewport }))
        .catch(error => log("resize-probe-error", String(error)));
    }
  },
  onFocus(focused) { log("focus", focused); },
  onVisible(visible) { log("visible", visible); },
});
// Clear the old bitmap on resize so it cannot stretch into the new viewport.
page = root.loadURL(url, { persist: false, keepFrame: false, onOpenWindow: "deny" });
root.setTitle("RPD Pixel POC");
page.webContents.on("will-navigate", (event, next) => {
  const destination = new URL(next);
  if (destination.protocol === "rpd-pixel:" && destination.hostname === "popout") {
    event.preventDefault();
    if (popoutStarted) return;
    const session = process.env.REX_SESSION;
    const checkout = process.env.RPD_CHECKOUT_PATH;
    const repository = process.env.RPD_REPO_PATH;
    if (!session || !checkout || !repository) {
      log("popout-unavailable", "Launch the viewer with npm run dev inside Rex.");
      return;
    }
    popoutStarted = true;
    const child = spawn("rex", ["window", "new", "RPD Pixel Review", "-s", session,
      "-c", process.cwd(), "--", "node", "scripts/popout.mjs", checkout, repository], {
      stdio: "ignore", env: process.env,
    });
    child.once("error", error => { popoutStarted = false; log("popout-error", String(error)); });
    child.once("exit", code => { if (code) { popoutStarted = false; log("popout-error", `Rex exited ${code}`); } });
    log("popout-started", { session, repository });
    return;
  }
  if (new URL(next).origin !== new URL(url).origin) event.preventDefault();
});
for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"] as const)
  process.once(signal, () => root.stop());
page.webContents.on("did-fail-load", (_event, code, description) => {
  log("load-error", { code, description }); root.stop(1);
});
page.webContents.on("did-finish-load", () => {
  page?.webContents.setZoomFactor(viewerZoom);
  void page?.webContents.executeJavaScript(`(${installTreeCompatibility.toString()})()`)
    .catch(error => log("tree-compat-error", String(error)));
  if (process.env.REX_SESSION && process.env.RPD_CHECKOUT_PATH && process.env.RPD_REPO_PATH) {
    void page?.webContents.executeJavaScript(`(${installPopoutButton.toString()})()`)
      .catch(error => log("popout-button-error", String(error)));
  }
});
page.webContents.once("did-finish-load", async () => {
  if (!page) return;
  log("document-loaded", { engine: root.info, versions: process.versions, zoomFactor: page.webContents.getZoomFactor(), displayScale: root.displayScale });
  if (process.env.RPD_PIXEL_PROBE) {
    try {
      const count = Number(process.env.RPD_PIXEL_RUNS || 1);
      if (!Number.isInteger(count) || count < 1 || count > 10) throw Error("RPD_PIXEL_RUNS must be 1..10");
      for (let i = 0; i < count; i++) {
        if (i) {
          const loaded = new Promise<void>(resolve => page!.webContents.once("did-finish-load", () => resolve()));
          page.webContents.reload();
          await loaded;
        }
        const result = await page.webContents.executeJavaScript(readFileSync(process.env.RPD_PIXEL_PROBE, "utf8"));
        log("browser-probe", result);
        log("surface-stats", root.surfaceStats());
      }
    } catch (error) { log("probe-error", String(error)); root.stop(1); }
  }
});
