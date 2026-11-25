# Standalone macOS ARM64 build

Build on an Apple Silicon Mac with an SEA-enabled Node.js 25.5 or newer binary (Node.js 26 recommended). Homebrew's shared-libnode build disables SEA; use the official Node.js binary or another SEA-enabled build.

```sh
npm ci
npm run build:standalone
npm run test:standalone
```

The output is `dist-standalone/`: `local-diff` and the sibling `dist/` directory of frontend assets. Keep the directory together. Node.js, npm, pnpm, and Bun are not needed to run it. macOS 14 or newer, Git, Rex, and `rexweb` remain external requirements. Install [rexweb](https://github.com/acoyfellow/rexweb), ensure it is on your PATH, and run `rexweb doctor` before opening the viewer.

To run it from a Git repository in Rex after building from this repository:

```sh
export PATH="$PWD/dist-standalone:$PATH"
cd /path/to/your/repository
local-diff
```

The build bundles the TypeScript CLI, server, and `chokidar` into one Node Single Executable Application script. SEA does not load package imports from disk by default, so bundling includes the runtime dependencies. Vite's HTML, JavaScript, CSS, and other assets remain beside the executable. The binary is ad-hoc signed for local use; public distribution needs a signing and notarization decision.

Node's older SEA flow uses `--experimental-sea-config` and a binary injection tool such as `postject` when `--build-sea` is unavailable but SEA is enabled. A directory carrying a private Node runtime is another self-contained option.
