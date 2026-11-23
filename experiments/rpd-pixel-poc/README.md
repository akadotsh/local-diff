# rpd-pixel-poc

Independent experiment: show the existing React + Pierre Diffs RPD viewer inside Pixel's Chromium WebView. No new Git backend, diff renderer, browser chrome or RPD source copy. See [REPORT.md](REPORT.md) for measured results, limitations and recommendation; [RESEARCH.md](RESEARCH.md) records the API investigation.

## Local development

```sh
cd ~/projects/rpd-pixel-poc
npm run dev
```

This builds the host, starts the existing RPD backend against the real sibling `rex-pierre-code-review` repository on an available port, and opens Pixel in a right-hand 50% split in Rex (in the current terminal elsewhere). Use the pop-out icon in the review header to open an independent review in a new Rex tab. Ctrl+Q closes Pixel and its backend; Ctrl+C stops both. There is no hot reload. Existing servers on port 4189 are left alone.

To review another repository, use `npm run dev -- /absolute/path/to/repository`. The default RPD checkout is the sibling `../rex-pierre-code-review`; override it with `RPD_CHECKOUT=/path/to/rex-pierre-diffs npm run dev`. RPD must already be built; this command does not modify its checkout. Use the **Explorer** button to browse existing source files, or **Changes** to review Git changes.

The synthetic benchmark files are opt-in: `npm run dev -- fixtures/review` (run `npm run fixture` first if the fixture does not exist).

## Run an existing viewer

Requires Node 22+, a local HTTP RPD viewer, and a Pixel-supported terminal. Tested on macOS ARM64 in Rex. Pixel downloads a patched Electron runtime; this is not a plain-Node app.

```sh
npm ci
# If npm withheld postinstall, run the official runtime installer explicitly:
node node_modules/@zenbu-labs/pixel/scripts/postinstall.mjs
npm run build
npm test
npm start -- http://127.0.0.1:4189
```

The Pixel wrapper includes a small tree-label CSS tolerance for fractional Chromium zoom; filenames still truncate when they genuinely overflow. The original RPD files are unchanged.

Viewer zoom starts at 100% and stays independent of terminal font resizing. With the viewer focused, use **Ctrl+= / Ctrl+- / Ctrl+0** to enlarge, shrink or reset it (Cmd equivalents work when forwarded by the terminal).

Only the URL is passed to the host. Pixel owns rendering, input and full-pane resizing. Ctrl+Q exits; SIGINT, SIGTERM and SIGHUP also stop the root and runtime. Copy/paste is subject to terminal shortcut forwarding; Rex's macOS clipboard smoke test did not pass acceptance. The host does not start or stop an already-running RPD backend.

## Reproduce the fixture and server

Use an existing **built** RPD checkout with `dist-node/server.js` and `dist/`. This experiment never builds or edits that checkout. Build it separately beforehand if needed.

```sh
npm run fixture
node scripts/serve.mjs /absolute/path/to/rex-pierre-diffs fixtures/review
# In another terminal:
npm start -- http://127.0.0.1:4189
```

The fixture has 100-line and 20,000-line TypeScript files, with every seventh value changed. Its destination must not already be a Git repository. Both files are shown together in the shared workload. Stop the server with Ctrl+C when finished. All server state belongs to the fixture, not the RPD source checkout.

## Benchmarks (macOS + Rex)

Keep the fixture server running. Run comparisons **sequentially**, keep the tested viewer visible, and close unrelated heavy workloads for a clean study. `REX_SESSION` and `REX_BLOCK` must identify the agent pane. Scripts create and close their own test panes and use only local debugging endpoints. They do not change global terminal or browser settings.

```sh
# Stock installed terminal-browser; resets zoom only in its test tab.
node scripts/terminal-browser-bench.mjs
# Existing rexweb installation, using its native WebKit engine.
node scripts/rexweb-bench.mjs
# Standalone Chrome; dedicated local profile and port, closed afterward.
node scripts/chrome.mjs
# Pixel quit/pane-close/signal smoke tests and warm document startup.
node scripts/smoke.mjs
```

For Pixel browser measurements, launch in a real terminal (or with `rex run`):

```sh
RPD_PIXEL_LOG="$PWD/results/pixel-matched.jsonl" \
RPD_PIXEL_PROBE="$PWD/scripts/probe.js" RPD_PIXEL_RUNS=3 \
node_modules/.bin/pixel dist/main.js -- http://127.0.0.1:4189
```

Then use the explicit pane and launcher PID with these helpers, waiting until browser probes finish before resizing:

```sh
node scripts/resources.mjs pixel LAUNCHER_PID
node scripts/resize-rex.mjs PIXEL_PANE_ID pixel
node scripts/lifecycle.mjs PIXEL_PANE_ID LAUNCHER_PID quit
```

Use a fresh results directory or archive earlier results before rerunning: JSON files are overwritten and Pixel JSONL logs append. CPU sampling uses `ps`'s decaying average, and resource sampling above is an idle snapshot after the workload. For workload CPU, start the sampler concurrently with a probe and record that choice. Summed RSS includes shared pages and excludes the terminal compositor. RexWeb XPC renderer attribution is incomplete.

`probe.js` measures browser rAF cadence, first observed diff DOM readiness, and a synthetic sidebar keyboard action. Its `intervalsOver25ms` is a long-frame count, **not** physical dropped frames. CDP resize runs measure emulated viewport changes; `resize-rex.mjs` measures real split RPC completion; Pixel logs additionally measure host callback to two browser rAFs. None measures display presentation. See REPORT.md for the optical measurement needed before making a smoothness claim.

For Ghostty/iTerm2/kitty, run `npm start` in each terminal and use the acceptance checklist in REPORT.md. The Rex-specific helpers do not automate those terminals.
