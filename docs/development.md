# Development

Clone the repository and install dependencies:

```sh
git clone https://github.com/akadotsh/local-diff.git
cd local-diff
npm ci
```

Run type checks, tests, and a production build:

```sh
npm run check
npm test
npm run build
```

## Test this checkout locally

From this repository in Rex, run `npm run dev` for the hot-reloading Pixel preview. Use `npm run local` to build and preview the production version. Press `Ctrl+C` to stop either preview.

Run type checks, builds, and automated backend, CLI, and Pixel tests with:

```sh
npm run test:local
```

Legacy RexWeb integration checks are available with `npm run test:explorer:rexweb` inside Rex when RexWeb is installed.

To build and test the macOS ARM64 standalone executable, see the [standalone build guide](standalone.md).
