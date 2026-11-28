# Pixel viewer

Display Local Diff inside your terminal using Pixel's Chromium WebView. Pixel is the default host for the root dev command, local preview, and `local-diff` CLI.

Requires Node.js 22 or newer, Git, and a Pixel-supported terminal. Tested on macOS ARM64 in Rex. Pixel installs its own Electron runtime.

From the repository root:

```sh
npm ci
npm run dev
```

This builds the viewer, starts this checkout’s backend and Vite, and enables frontend hot reload. Inside Rex it opens a split beside the invoking pane; elsewhere it runs in the current terminal. Ctrl+Q in Pixel or Ctrl+C in the launcher stops the preview. Use `npm run local` for a production build.

The isolated host can still be built and run from `hosts/pixel` with `npm ci`, `npm run build`, and `npm run dev -- /absolute/path/to/repository`, after building the root project. That launcher has no hot reload. Omit the repository argument to review this checkout.

To connect to an existing Local Diff server:

```sh
npm start -- http://127.0.0.1:4189
```

This leaves the existing server running when the viewer closes. Only local HTTP URLs are accepted, and navigation to other origins and browser popups are blocked.

Ctrl+Q closes the viewer. Ctrl/Cmd plus, minus, and zero adjust page zoom when forwarded by the terminal. Copy/paste depends on terminal shortcut forwarding; macOS Rex clipboard acceptance remains unresolved. Agent discovery and context insertion require Rex.

On resize, the old browser image is cleared while the new viewport repaints. This avoids stretching stale content but can briefly show a blank frame.
