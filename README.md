# rex-pierre-diffs

A graphical Git diff viewer and code-review interface that runs inside Rex Terminal, powered by [Pierre Diffs](https://diffs.com/docs).

> [!NOTE]
> This is an independent, community-maintained project and is not an official part of Rex.

Run `rex-pierre-diffs` (or its short alias, `rpd`) from a Git repository in a Rex pane to open the review interface in a terminal-browser split. The app reads local changes, watches for file updates, and keeps review notes on your machine.

## Features

- Review staged changes, working-tree changes, or all changes relative to `HEAD`.
- Include untracked text files and navigate changed files from the file list.
- View syntax-highlighted unified diffs with selectable added and removed lines.
- Add local review notes and copy selected source lines.
- Prepare selected code and a question for a coding agent in another Rex pane. Choose the destination and confirm before insertion; the app does not submit the message.
- Switch between Comfortable and Compact density, collapse the file sidebar, and use a narrow split layout.
- Refresh the diff view as repository files change.

## Installation

### Requirements

- Node.js 20 or newer for the CLI and local server.
- Git.
- Rex Terminal and [`terminal-browser`](https://github.com/zenbu-labs/terminal-browser) for the integrated interface.
- npm or pnpm to install dependencies and build from source.

After the package is published, install it globally with npm or pnpm:

```sh
npm install --global rex-pierre-diffs
# or
pnpm add --global rex-pierre-diffs
```

To build and install from source, clone the repository and choose npm or pnpm:

```sh
git clone https://github.com/akadotsh/rex-pierre-diffs.git
cd rex-pierre-diffs
npm ci
npm run build
npm install --global .
```

```sh
git clone https://github.com/akadotsh/rex-pierre-diffs.git
cd rex-pierre-diffs
pnpm install
pnpm build
pnpm add --global .
```

Both `rex-pierre-diffs` and `rpd` are installed as commands.

## Usage and configuration

Open a Git repository in Rex Terminal, then run:

```sh
cd /path/to/your/repository
rex-pierre-diffs
```

The command detects the repository root (including when run from a subdirectory), starts a server bound to `127.0.0.1`, and opens the viewer in a right-side split. It checks ports 4179 through 4199 and reuses a responding viewer for the same repository.

Use `rex-pierre-diffs --help` to show CLI help. The optional `--cwd`, `--session`, and `--block` arguments are primarily for Rex action integrations. When launched from a Rex pane, the app lists panes in the current session as agent targets.

### Rex Command Palette and shortcut

To add **Open Pierre Diffs** to Rex's Command Palette, copy the optional integration file into your Rex configuration directory. It defines the `open_pierre_diffs` action and binds `Cmd`+`Shift`+`G`:

```sh
rex_config_dir="${XDG_CONFIG_HOME:-$HOME/.config}/rex"
mkdir -p "$rex_config_dir"
cp -n ./rex-pierre-diffs.lua "$rex_config_dir/"
```

If the file already exists, inspect and merge it manually; `cp -n` will not overwrite it. Then add this line to Rex's existing `init.lua` (usually `~/.config/rex/init.lua`, or `$XDG_CONFIG_HOME/rex/init.lua` when XDG is configured), without replacing existing settings:

```lua
require("rex-pierre-diffs")
```

The shortcut is configurable by editing `local shortcut = "shift+cmd+g"` in `rex-pierre-diffs.lua`. To avoid adding the default keybinding, remove the `rex.bind(...)` line; the action remains available in the Command Palette. Check and reload the configuration:

```sh
rex config check
rex config reload
```

Run the copy command from the cloned project directory. The action reads the active terminal pane's reported working directory, session, and block, then starts `rpd` for that repository. The Rex server must be able to find `rpd` on its `PATH`. It reports a clear error if the active block has not reported a directory, the directory is not a Git repository, or a required command is unavailable.

In the viewer, choose **All changes**, **Working tree**, or **Staged**. Select lines in a diff to see their source and use **Add Comment**, **Copy selected code**, or **Ask Agent**. Review notes are stored in the repository's Git metadata directory. Display density and the last successfully used agent pane are remembered in the browser's local storage.

## Development

```sh
npm ci
npm run check
npm run build
npm test
```

The app uses React and TypeScript, Vite for the frontend build, Node.js for the CLI and server, and `@pierre/diffs` for rendering patches. The local server reads Git changes and watches the repository for file updates. The same scripts can be run with pnpm, for example `pnpm run check`, `pnpm build`, and `pnpm test`.

## License

This project is licensed under the MIT License; see [LICENSE](LICENSE). Third-party license texts and notices are in [THIRD_PARTY_NOTICES](THIRD_PARTY_NOTICES/).
