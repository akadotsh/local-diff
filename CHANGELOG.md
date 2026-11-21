# Changelog

## 0.1.3

### Upgrade requirement

The viewer now opens in [RexWeb](https://github.com/acoyfellow/rexweb) instead of terminal-browser. Install RexWeb, ensure `rexweb` is on your PATH, and run `rexweb doctor` before using `rpd`. Requires macOS 14 or newer. The npm installation still requires Node.js 20 or newer.

### Improvements

- Ask your coding agent directly below selected diff lines using a compact inline composer.
- Filter the destination picker to recognized coding-agent panes, with agent names and icons for Codex, Claude Code, and OpenCode. Recheck the destination before insertion; messages are inserted without pressing Enter.
- Preserve scroll position while choosing an agent or typing a question.
- Copy repository-relative file paths from diff headers.
- Refine the Rex-style UI with a sliding sidebar, clearer empty states, improved spacing, and reduced-motion support.
- Refresh Rex Pierre Diffs branding, logo colors, and documentation.

### Notes

- The inline composer replaces the previous selection toolbar and modal. Local note creation and the source/message preview were removed from the composer.
- Agents running behind generic Node.js or Python wrappers may not be detected.
- RexWeb uses a separate window overlay; minimizing Rex may briefly leave the diff visible.

## 0.1.0

Initial release candidate: local Git diff viewer in a Rex terminal-browser split, Pierre Diffs rendering, line selection, review notes, and explicitly confirmed agent-pane text insertion.

The CLI and local server run on Node.js 20 or newer. End-to-end Rex verification remains pending.
