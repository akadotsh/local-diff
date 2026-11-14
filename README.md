# rex-pierre-diffs

A graphical Git diff viewer and code-review interface that runs inside Rex Terminal, powered by [Pierre Diffs](https://diffs.com/docs).

> [!NOTE]
> This is an independent, community-maintained project and is not an official part of Rex.

Run `rex-pierre-diffs` from a Git repository in a Rex pane to open the review interface in a terminal-browser split. The app reads local changes, watches for file updates, and keeps review notes on your machine.

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

Clone the repository, install dependencies, build the frontend and CLI, then install the command globally. Choose npm or pnpm:

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

## Usage and configuration

Open a Git repository in Rex Terminal, then run:

```sh
cd /path/to/your/repository
rex-pierre-diffs
```

The command detects the repository root (including when run from a subdirectory), starts a server bound to `127.0.0.1`, and opens the viewer in a right-side split. It checks ports 4179 through 4199 and reuses a responding viewer for the same repository.

Use `rex-pierre-diffs --help` to show CLI help. The CLI has no other flags or configuration file. When launched from a Rex pane, the app lists panes in the current session as agent targets.

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
