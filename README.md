# ![Logo](docs/logo-small.png) Local Diff

A graphical Git diff viewer for [Rex Terminal](https://www.superlogical.com/rex), powered by [Pierre Diffs](https://diffs.com/docs). Review changes, select lines, and send code context to a coding agent without leaving your terminal.

> [!NOTE]
> This is an independent, community-maintained project and is not an official part of Rex.

![Local Diff showing a real Git diff beside a terminal](https://raw.githubusercontent.com/akadotsh/local-diff/main/docs/screenshot.png)

## Features

- Review staged, unstaged, and untracked changes with syntax-highlighted diffs.
- Navigate changed files and see updates as repository files change.
- Select added or removed lines as context for your agent.
- Ask an agent about selected code in a chosen Rex pane. Choose an agent pane and click **Ask Agent** to insert the selected code and your question; the app does not press Enter for you.
- Use a right-side or top/bottom split, with comfortable and compact display density.

## Install from npm or pnpm

You need macOS 14 or newer, Node.js 20 or newer, Git, Rex Terminal, and [`rexweb`](https://github.com/acoyfellow/rexweb). Follow rexweb's installation instructions first, ensure `rexweb` is on your PATH, and run `rexweb doctor` to check the setup. Then install this package globally with npm or pnpm:

```sh
# Install
npm install -g local-diff
# or
pnpm add -g local-diff

# Upgrade
local-diff upgrade

# Check for updates
local-diff upgrade --check

# Show installed version
local-diff --version
```

`local-diff upgrade` supports global npm and pnpm installations. To upgrade manually, run `npm install -g local-diff@latest` or `pnpm add -g local-diff@latest`, using the same package manager you installed with.

## Use

Open a Git repository in Rex and run:

```sh
local-diff
```

The viewer opens beside your terminal and shows the repository's current changes. Use **All changes**, **Working tree**, or **Staged** to choose what to review. Select changed lines to ask an agent a question. The agent picker lists recognized foreground coding-agent processes, excluding ordinary shells and browser panes. Agents hidden behind generic Node.js or Python wrapper processes may not be detected.

Use the sidebar’s **Changes** and **Explorer** icon buttons to switch between Git review and the full repository tree. Explorer includes tracked files and non-ignored untracked files, with Git status badges. Select a file to read its current source; switching back restores your review context. Drag the sidebar’s right edge to resize it on desktop; its width is remembered. You can also focus the edge and use the arrow keys, or double-click to reset it. Browsing is read-only. Binary files, non-UTF-8 text, and files over 1 MB show a preview message. Git does not track empty directories.

For the native RexWeb integration checks (including a 3,000-file fixture), run `npm run test:explorer` inside Rex. This opens and closes a temporary validation pane.

For a top/bottom layout, run:

```sh
local-diff --split below
```

The `--split` option also accepts `right` (the default), `left`, and `above`. `local-diff` is the command name. Run `local-diff --help` for all CLI options. From a coding agent's shell command input in Rex, `local-diff` works the same way when shell commands are enabled.

## Test this checkout locally

From this repository inside Rex, run:

```sh
npm run dev
```

This starts this checkout’s backend and Vite, opens native RexWeb, and hot reloads frontend changes. Restart the command after backend changes. Press `Ctrl+C` to stop both servers and close the preview.

To test a production build instead:

```sh
npm run local
```

This builds the current source, starts a fresh server on an available port, and opens it in native RexWeb. It never reuses your globally installed `local-diff` server. Keep the command running while testing; press `Ctrl+C` to stop it and close its preview. After changing source, stop it and run the same command again to rebuild.

For all automated checks, including the native RexWeb integration tests:

```sh
npm run test:local
```

### Optional Rex shortcut

The included `local-diff.lua` adds **Open Local Diff** to Rex's Command Palette and binds `Cmd`+`Shift`+`G`. Copy it from the globally installed package into your Rex config directory:

```sh
rex_config_dir="${XDG_CONFIG_HOME:-$HOME/.config}/rex"
mkdir -p "$rex_config_dir"
cp -n "$(npm root -g)/local-diff/local-diff.lua" "$rex_config_dir/"
```

If you installed with pnpm, use `$(pnpm root -g)` in place of `$(npm root -g)`. Add this line to your existing `~/.config/rex/init.lua`:

```lua
require("local-diff")
```

Then run `rex config check` and `rex config reload`. The shortcut and split direction can be changed at the top of the copied Lua file. If Rex cannot find `local-diff` from the action, set `local-diff_command` there to the absolute path returned by `command -v local-diff`.

## Development

To build from source or contribute, clone the repository and run:

```sh
git clone https://github.com/akadotsh/local-diff.git
cd local-diff
npm ci
npm run check
npm test
npm run build
```

The CLI and local server use Node.js; the interface uses React and Pierre Diffs. The server binds to `127.0.0.1` and reads the local Git repository.

To build and test the macOS ARM64 standalone executable, see the [standalone build guide](docs/standalone.md).

## License

MIT. See [LICENSE](LICENSE) and [third-party notices](THIRD_PARTY_NOTICES/).
