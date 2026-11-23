# Pixel terminal host experiment

Date: 2026-11-23. Status: working isolated POC and exploratory measurements; **not a completed terminal-presentation benchmark or migration approval**.

## Recommendation

Keep the existing RPD host and retain Pixel as an optional experimental host. Do not migrate on smoothness grounds. Pixel removes the unnecessary browser UI with a very small host, but stock Terminal Browser already uses the same Pixel/Electron/Chromium engine. Their browser scrolling results are effectively tied in this experiment. Rex clipboard shortcut acceptance still needs resolution, Ghostty/iTerm2 need testing, and actual display presentation has not been measured.

1. **Is Pixel smoother than Terminal Browser?** No demonstrated advantage. The matched browser rAF measurements are approximately 104 fps for both. This is not proof of equivalent visual smoothness; the final terminal presenter can still differ.
2. **Does Pixel remove unnecessary browser UI?** Yes. Visually verified in Rex: only the RPD review app, with no address bar, browser tab strip or navigation toolbar. Terminal-owned pane decorations remain.
3. **Is integration simpler?** The app-only host is simple: `createRoot().loadURL(url)`. It adds ownership of a patched runtime dependency, lifecycle, shortcut policy and terminal compatibility testing. Terminal Browser already packages those responsibilities and offers browsing/agent automation. Terminal Code's daemon/server machinery is unnecessary for this POC.
4. **Interaction quality?** Mouse range selection, text entry, scrolling, resizing, visibility switching and return to the agent worked in Rex. Clipboard shortcuts did not pass the initial acceptance test. Physical trackpad momentum and precise input-to-photon latency remain unverified.
5. **Which host?** Keep both options during evaluation, with the existing RPD integration remaining the default. A direct Pixel host is justified by an app-only interface, not an established speedup. Do not replace RexWeb or Terminal Browser until the acceptance gaps below are closed.

## Environment and method

macOS 26.5 (25F71), ARM64; Rex macOS app 0.1.0 (2061), server 0.1.0-preview.21. Pixel npm 0.3.2; patched Electron 44.5.1 / Chromium 152.0.7977.130. Stock Terminal Browser 0.15.3 reports the same Electron/Chromium versions. Standalone Google Chrome reports Chromium 158. RexWeb uses WebKit 605.1.15 / Safari 26.4 user agent.

All hosts use one unchanged local RPD backend at `127.0.0.1:4189`, importing the built server directly from the existing RPD checkout. No RPD source or build files were edited or rebuilt. Source commit and build hash are recorded in `research/sources.json`. The experiment was run under `/private/tmp/rpd-pixel-poc`; paths in raw logs refer to that location. Existing unrelated untracked RPD files were left untouched.

The generated fixture contains a 100-line file and a 20,000-line TypeScript file. Every seventh value changes. The common workload loads both diffs and scrolls `.diff-content` by 32 CSS pixels per animation callback for three seconds. The scroll extent was about 505,553 CSS pixels. This tests first observable rendered diff readiness and scrolling a large logical diff, not the time to paint every line simultaneously.

Three browser-probe samples per host; 20 split/viewport resize requests per tested path. Chromium page viewports were matched to 1155 × 1344 CSS pixels, DPR 1. Stock Terminal Browser initially inherited zoom 1.716; its test tab was reset with Ctrl+0 before the final measurements. Native RexWeb reported approximately 1176 × 1328, DPR 1 (and 1155 × 1314 when settled); its dynamic size is close, not identical. CDP viewport emulation isolates browser layout and does not guarantee the same physical visible content area beneath browser controls.

Hosts were exercised sequentially, but this was an active developer machine with other applications and an agent running. Warm cache/profile/daemon state was not normalized. Results are exploratory and too few for statistical performance claims. No Pixel/Terminal Browser fork, patch or RPD frontend/backend copy was used.

## Browser results

The generated `results/summary.json` and raw host JSON/JSONL files are authoritative. The table below gives medians across three trials. Read rAF as browser callback cadence, not displayed terminal fps. The synthetic input action resizes RPD's sidebar and forces expensive large-diff reflow; it is not ordinary typing latency.

| Host | First observed diff DOM (ms) | Browser rAF fps | rAF interval p95 (ms) | Intervals >25 ms | Synthetic sidebar key → two rAFs (ms) |
| --- | ---: | ---: | ---: | ---: | ---: |
| RexWeb | 1845 | 35.1 | 63.0 | 12 | 3303 |
| Stock Terminal Browser | 1726 | 104.4 | 24.9 | 11 | 707 |
| Standalone Chrome | 1620 | 100.0 | 27.8 | 18 | 798 |
| Pixel host | 1751 | 104.0 | 25.0 | 13 | 690 |


`intervalsOver25ms` counts browser rAF intervals longer than 25 ms during the scroll. At a 120 Hz refresh, a 16.7 ms interval also misses a refresh opportunity, so this threshold is deliberately not presented as a dropped-frame count. No physical dropped-frame measurement was obtained.

Diff readiness is the first observed `[data-line]` in a diff shadow root, timed from browser `performance.timeOrigin`. Pixel polls from document completion; the CDP runner waits 500 ms after reload before polling; RexWeb waits for its reload RPC. These are observed readiness upper bounds with different injection overhead, not exact renderer completion timestamps. Browser DOM markers are not proof that pixels reached the terminal.

## Startup, resizing and resources

| Host | Warm startup observation (ms) | Actual split RPC p50 / p95 (ms) | Browser resize timing p50 / p95 (ms) | Sampled RSS MiB | Sampled ps CPU % |
| --- | ---: | ---: | --- | ---: | ---: |
| RexWeb | 738 (open → document RPC) | 34.4 / 37.2 | 1537 and 2757; only two events, no p95 | 126 **host only** | 5.6 |
| Stock Terminal Browser | 2588 (launch → title poll) | 18.6 / 43.3 | 430 / 667 (CDP viewport → two rAFs) | 4003 | 2.8 |
| Standalone Chrome | 490 (launch → title poll) | N/A (not terminal-hosted) | 438 / 578 (CDP viewport → two rAFs) | 4693 | 13.8 |
| Pixel host | 434–540 (launch → document poll, n=2) | 19.3 / 38.0 | 522 / 852 (host callback → two rAFs) | 2945 | 0.1 |


These startup endpoints differ and are explicitly labeled. They are warm launch/document observations, **not a cold-start ranking**. They exclude runtime download and do not measure first displayed diff pixels. A controlled cold-start study remains open.

Split RPC latency is only how quickly Rex accepts and applies a layout request. It excludes browser reflow and terminal output. Pixel's separate host-resize-to-two-rAF measurement includes JS RPC/scheduling and layout: the viewport may be superseded by a later resize while a callback is pending. RexWeb coalesced 20 requests into only two observed browser resize samples; computing a p95 from those would be misleading. CDP viewport resize timings for Chrome/Terminal Browser use a different starting boundary and are not a ranking against Pixel's actual split callback.

Resource numbers are summed RSS of known process trees, which double-count shared pages and omit the terminal compositor. CPU uses `ps`'s decaying average and the samples were taken at different phases (Pixel after scrolling, Chrome and final Terminal Browser after viewport resize). They **cannot establish comparative CPU efficiency**. RexWeb's XPC renderer processes have PPID 1; its app-only sample excludes renderer/GPU/network resources and must not be compared with a full Chromium tree. A future controlled run must sample interval CPU during the same workload, include the terminal compositor, and attribute XPC processes by ownership.

The 20,000-line workload drives multi-gigabyte Chromium trees here. Pixel is a Chromium host, not a replacement diff renderer or a route to native-UI memory costs.

## Presentation boundary

There are four distinct stages: terminal split event → browser viewport/layout → Chromium/WebKit frame production → graphics transport/terminal compositor/display. The probes cover different portions of the first three stages.

Pixel `surfaceStats()` reports submitted/presented/coalesced counters. These are engine-side counters; a counter named `presented` is **not** evidence of display scanout. The initial run recorded 307 submitted / 304 presented / 3 coalesced; matched runs also saved counters. No API here acknowledges when Rex physically showed a particular frame.

To finish the presentation benchmark: inject a visible alternating frame ID or color marker through external evaluation, record browser timestamp/frame ID plus Pixel transmit/profile timestamps, and capture the terminal display with a high-speed camera or a compositor capture with known timestamp guarantees. Drive identical resize/scroll/input traces for each host, correlate first visible frame IDs, and report p50/p95 input-to-visible and resize-to-visible latency plus repeated/missing frame IDs. A camera observing an input indicator alongside the screen is required for physical input-to-photon timing. A 60 fps recording cannot substantiate 120 fps smoothness. Run at least 30 startup trials and enough repeated resize/input events for useful tail estimates, with hardware refresh rate and viewport recorded.

## Compatibility and acceptance

Legend: PASS = observed; FAIL = attempted and acceptance unmet; NOT TESTED = no claim of support.

| Case | Rex / Pixel 0.3.2 | Ghostty | iTerm2 | kitty |
| --- | --- | --- | --- | --- |
| Open existing RPD URL without browser UI | PASS | Not installed | Not installed | NOT TESTED |
| Large diff loads and scrolls | PASS | Not installed | Not installed | NOT TESTED |
| Mouse range selects diff lines | PASS: lines 407–409 opened inline composer | Not installed | Not installed | NOT TESTED |
| Text input | PASS: search field filtered to small.ts | Not installed | Not installed | NOT TESTED |
| Native wheel/scroll injection | PASS | Not installed | Not installed | NOT TESTED |
| Physical trackpad momentum/gestures | NOT TESTED | Not installed | Not installed | NOT TESTED |
| Split resize | PASS visually; 20 controlled requests logged | Not installed | Not installed | NOT TESTED |
| Switch terminal tab away/back | PASS: app remained open | Not installed | Not installed | NOT TESTED |
| Focus back to coding agent | PASS: agent text area focused | Not installed | Not installed | NOT TESTED |
| Clipboard copy/paste shortcuts | FAIL initial acceptance; see below | Not installed | Not installed | NOT TESTED |
| Quit / pane close / SIGTERM cleanup | PASS: no owned descendants remained | Not installed | Not installed | NOT TESTED |

Rex clipboard test: after entering `small` in the search field, Cmd+A / Cmd+C / Right / Cmd+V did not produce `smallsmall`; the field instead contained unrelated text from the existing clipboard. Paste delivery and copy selection/terminal interception were not isolated, so this is **not a proven Pixel bug**. It is a failed end-to-end acceptance case. Do not fix it by changing the user's global Rex shortcuts during this experiment. Reproduce with known clipboard text and individually inspect selection, copy output and paste result; compare the same sequence in stock Terminal Browser and each terminal. Plain keyboard text and mouse selection worked separately.

Ctrl+Q, pane close and SIGTERM each removed all six recorded processes in Pixel's owned tree, in approximately 145 ms, 103 ms and 135 ms respectively. The backend remained separately managed. Forced SIGKILL/crash recovery, repeated long-running open/close cycles and child reparenting after crashes were not tested. Raw PID/time records are in `results/pixel-lifecycle-*.json`.

Rex is verified here, despite not being listed on Pixel's website terminal list. Ghostty/iTerm2 are advertised upstream but are absent from `/Applications` on this machine, so no runtime claims are made for them. kitty 0.49.2 is installed. Pixel loaded RPD and completed the browser probe there (`results/kitty-pixel.jsonl`), negotiating pixel graphics and a precise pointer. The computer-use tool refused access to the Kitty app for safety reasons, so visual verification and its interaction checklist could not be performed. No alternate UI control method was used to bypass that restriction. The dedicated test process was stopped afterward. The table intentionally leaves Kitty interaction cases untested. Other advertised terminals, SSH/multiplexers and Windows/WSL were not available for testing. They are not declared unsupported merely because they were not tested.

Before changing RPD's default, repeat the checklist in Ghostty and iTerm2: open/close 20 times, resize split edges continuously, switch tabs, copy selected code and paste Unicode/multiline text, exercise navigation/edit shortcuts, select changed-line ranges, load the large file, and return focus to the agent. Record terminal versions, display refresh, graphics/keyboard capability negotiation and all failures. Ask Agent submission was not exercised: no messages were sent to another agent.

## Post-benchmark local usability changes

The dev command now starts an owned backend and opens Pixel beside the invoking Rex pane, with cleanup on viewer exit or launcher interruption. The host also injects a tree-shadow CSS tolerance for fractional zoom: single-line overflow measurements within 1px of `1lh` do not show a marker. At DPR/zoom 0.766, a 30px row was measured as 30.03px and falsely marked as overflowing. Runtime checks confirmed the tolerance hides that marker while preserving markers for genuinely overflowing names. These changes were made after the recorded benchmark; original RPD source remains unchanged.

Viewer zoom now defaults to 100% and is independent of Pixel's terminal-font follower; Ctrl/Cmd plus, minus and zero control it. A live viewer had reached approximately 59% page zoom during terminal resizing. This usability adjustment is also subsequent to the recorded benchmark.

The Rex launcher now injects a pop-out icon into the review header. It opens the same repository in a new Rex tab with its own short-lived RPD backend; the original split stays open. This is a convenience path added after the benchmark and was not included in the recorded compatibility results.
