# Standalone macOS ARM64 build

Build on an Apple Silicon Mac with an SEA-enabled Node.js 25.5 or newer binary (Node.js 26 recommended). Homebrew's shared-libnode build disables SEA; use the official Node.js binary or another SEA-enabled build.

```sh
npm ci
npm run build:standalone
npm run test:standalone
```

The output is `dist-standalone/`: `local-diff`, frontend assets in `dist/`, the viewer in `hosts/`, and Pixel dependencies in `node_modules/` with `package.json`. Keep the directory together. Node.js, npm, pnpm, and Bun are not needed to run it. macOS 14 or newer, Git, and Rex remain external requirements. The build installs Pixel and its Electron runtime into the distribution and requires network access.

To run it from a Git repository in Rex after building from this repository:

```sh
export PATH="$PWD/dist-standalone:$PATH"
cd /path/to/your/repository
local-diff
```

The build bundles the TypeScript CLI, server, and `chokidar` into one Node Single Executable Application script. The CLI and server dependencies are bundled. Pixel’s launcher and Electron runtime load from the sibling `node_modules/` using an explicit filesystem require. Vite's HTML, JavaScript, CSS, and other assets remain beside the executable. Release binaries are ad-hoc signed and are not notarized.

Stable GitHub releases build and test this distribution on macOS ARM64, then attach `local-diff-darwin-arm64.tar.gz` and its `.sha256` checksum. The root `install.sh` verifies and installs that archive without Node.js or npm.

Node's older SEA flow uses `--experimental-sea-config` and a binary injection tool such as `postject` when `--build-sea` is unavailable but SEA is enabled. A directory carrying a private Node runtime is another self-contained option.
