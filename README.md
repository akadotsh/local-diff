# rex-pierre-diffs

A graphical Git diff viewer for [Rex Terminal](https://www.superlogical.com/rex), powered by [Pierre Diffs](https://diffs.com/docs). Review changes, leave notes on selected lines, and send code context to a coding agent without leaving your terminal.

> [!NOTE]
> This is an independent, community-maintained project and is not an official part of Rex.

![Rex Pierre Diffs showing a real Git diff beside a terminal](https://raw.githubusercontent.com/akadotsh/rex-pierre-diffs/main/docs/screenshot.png)

## Features

- Review staged, unstaged, and untracked changes with syntax-highlighted diffs.
- Navigate changed files and see updates as repository files change.
- Select added or removed lines, copy their source, and save local review notes.
- Ask an agent about selected code in a chosen Rex pane. You preview and confirm the text before insertion; the app does not press Enter for you.
- Use a right-side or top/bottom split, with comfortable and compact display density.

## Install

You need Node.js 20 or newer, Git, Rex Terminal, and [`terminal-browser`](https://github.com/zenbu-labs/terminal-browser). Install the package globally with npm or pnpm:

```sh
npm install --global rex-pierre-diffs
# or
pnpm add --global rex-pierre-diffs
```

This installs both `rex-pierre-diffs` and the shorter `rpd` command.

## Use

Open a Git repository in Rex and run:

```sh
rpd
```

The viewer opens beside your terminal and shows the repository's current changes. Use **All changes**, **Working tree**, or **Staged** to choose what to review. Click changed lines to add a note, copy code, or ask an agent a question. Review notes stay local to the repository.

For a top/bottom layout, run:

```sh
rpd --split below
```

The `--split` option also accepts `right` (the default), `left`, and `above`. Run `rpd --help` for all CLI options. From a coding agent's shell command input in Rex, `rpd` works the same way when shell commands are enabled.

### Optional Rex shortcut

The included `rex-pierre-diffs.lua` adds **Open Pierre Diffs** to Rex's Command Palette and binds `Cmd`+`Shift`+`G`. Copy it from the globally installed package into your Rex config directory:

```sh
rex_config_dir="${XDG_CONFIG_HOME:-$HOME/.config}/rex"
mkdir -p "$rex_config_dir"
cp -n "$(npm root -g)/rex-pierre-diffs/rex-pierre-diffs.lua" "$rex_config_dir/"
```

If you installed with pnpm, use `$(pnpm root -g)` in place of `$(npm root -g)`. Add this line to your existing `~/.config/rex/init.lua`:

```lua
require("rex-pierre-diffs")
```

Then run `rex config check` and `rex config reload`. The shortcut and split direction can be changed at the top of the copied Lua file. If Rex cannot find `rpd` from the action, set `rpd_command` there to the absolute path returned by `command -v rpd`.

## Development

To build from source or contribute, clone the repository and run:

```sh
git clone https://github.com/akadotsh/rex-pierre-diffs.git
cd rex-pierre-diffs
npm ci
npm run check
npm test
npm run build
```

The CLI and local server use Node.js; the interface uses React and Pierre Diffs. The server binds to `127.0.0.1` and reads the local Git repository.

## License

MIT. See [LICENSE](LICENSE) and [third-party notices](THIRD_PARTY_NOTICES/).
