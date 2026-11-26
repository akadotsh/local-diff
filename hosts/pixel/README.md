# Pixel viewer

Display Local Diff inside your terminal using Pixel's Chromium WebView. The viewer uses the same backend and diff interface as the RexWeb host.

Requires Node.js 22 or newer, Git, and a Pixel-supported terminal. Tested on macOS ARM64 in Rex. Pixel installs its own Electron runtime.

From the repository root:

```sh
npm ci
npm run build
cd hosts/pixel
npm ci
npm run build
npm test
npm run dev -- /absolute/path/to/repository
```

The launcher starts a backend on an available port and closes it when the viewer exits. Inside Rex it opens a split beside the invoking pane; elsewhere it runs in the current terminal. There is no hot reload. Omit the repository argument to review this checkout.

To connect to an existing Local Diff server:

```sh
npm start -- http://127.0.0.1:4189
```

This leaves the existing server running when the viewer closes. Only local HTTP URLs are accepted, and navigation to other origins and browser popups are blocked.

Ctrl+Q closes the viewer. Ctrl/Cmd plus, minus, and zero adjust page zoom when forwarded by the terminal. Copy/paste depends on terminal shortcut forwarding; macOS Rex clipboard acceptance remains unresolved. Agent discovery and context insertion require Rex.

On resize, the old browser image is cleared while the new viewport repaints. This avoids stretching stale content but can briefly show a blank frame.
