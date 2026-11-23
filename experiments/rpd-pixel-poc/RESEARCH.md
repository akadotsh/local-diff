# Pixel host research — 2026-11-23

The npm registry currently resolves `@zenbu-labs/pixel` to **0.3.2**. This experiment pins that release and its lockfile, and compiles against the actual published `.d.ts` files. Upstream main is additional context, not a substitute for validating the release. Source revisions and package checksum are in `research/sources.json`.

## Smallest documented host

The [hello example](https://github.com/zenbu-labs/terminal-browser/blob/main/pixel/examples/hello/src/main.ts) uses `createRoot()` followed by `root.loadURL(url)`. The [API guide](https://github.com/zenbu-labs/terminal-browser/blob/main/pixel/AGENT-DOCS.md) documents `pixel ENTRY -- ARGS`: it launches the entry inside the patched Electron runtime. `createRoot()` does not work in plain Node. No bundler, React component tree, address bar, tab strip or navigation toolbar is needed for this app.

The release's postinstall pins patched Electron **44.5.1**; the actual runtime reports Chromium **152.0.7977.130**. The host uses sandboxed, isolated WebContents with Node integration disabled by Pixel defaults. It keeps storage in memory, denies popup windows and blocks off-origin main-frame navigation. It does not change RPD's frontend, Git backend, renderer or authentication.

## Terminal Code architecture

Inspected current `src/main.ts`, `src/launch.ts`, `src/runtime/launcher.ts`, `src/app/daemon.ts`, `src/app/control.ts`, and `src/codeserver/server.ts` at the recorded revision.

Terminal Code starts/reuses code-server on loopback with a generated secret, plus an injector process for its VS Code customization. Its launcher starts a detached Electron daemon, communicates through a socket, and relays terminal lifecycle and resize messages. A daemon can manage multiple roots: `openWindow()` calls `createRoot({tty,sessionEnv,onExit})`, mounts a WebView and tracks it in a map. Connection closure stops the root; root exit notifies the launcher, removes the window and schedules idle daemon shutdown. Explicit shutdown handles the daemon and server processes.

RPD already supplies a local server. None of Terminal Code's code-server, injector, session reuse, SSH or persistent daemon infrastructure is necessary here. The POC uses Pixel's shipped foreground launcher and root lifecycle instead.

## Input, resize and lifecycle

Pixel supplies pointer, wheel and key forwarding to Chromium, plus browser text selection. Root key handlers see keys first and can consume them. This host consumes only Ctrl+Q; it avoids the hello example's Ctrl+C quit binding to preserve copy-related input. macOS terminal menu shortcuts can intercept input before Pixel sees it; the Rex clipboard smoke test is recorded as a failed acceptance case in REPORT.md.

Root resize notifications contain pixel dimensions. Pixel sizes the full-pane WebView; no manual SIGWINCH forwarding or resize debounce is added. Visibility/focus callbacks and resize timing are logged only when `RPD_PIXEL_LOG` is set. The published engine has Rex-specific automatic tile presentation; this is evidence of integration code, not a guarantee of interaction compatibility.

`root.stop()` unmounts and restores the terminal; the default `onExit` calls Electron app exit. The shipped `pixel` CLI forwards SIGINT/SIGTERM/SIGHUP to its child, escalates to SIGKILL after two seconds, and restores terminal modes after a signal crash. The POC sends signals to `root.stop()` and creates no backend child. Quit, pane close and SIGTERM were tested against all descendants recorded before shutdown. The shared RPD server is deliberately a separate process, stopped independently.

## Platforms and terminal support

[Pixel's site](https://pixelgui.com/) lists macOS ARM64/x64 and Linux ARM64/x64. Native Windows is work in progress; WSL is documented. Listed terminals include Ghostty, iTerm2, xterm.js, Konsole, WezTerm, Warp, noctty, mobile SSH, patched st, wayst, AbsoluteTelnet/SSH, cmux, tty7, VS Code and Cursor. The npm release also contains a Rex terminal adapter. Rex is not on the site's terminal list; this experiment independently verified pixel graphics there.

The [README](https://github.com/zenbu-labs/terminal-browser/blob/main/pixel/README.md) describes Kitty graphics, shared-memory transport when local, inline data over SSH, and reduced efficiency/possible precision loss through multiplexers. The site advertises 120 fps; that is not a benchmark result. The docs distinguish native React UI from the WebView: the latter retains Chromium renderer memory costs. No expectation of a lightweight non-browser renderer is justified.
