# rex-pierre-diffs

A graphical Git diff viewer and code-review interface for Rex Terminal, powered by [Pierre Diffs](https://diffs.com/docs). This is an independent community project and is not affiliated with or endorsed by Rex/Superlogical or Pierre.

## Features

- Review staged, unstaged, combined, and untracked Git changes.
- Render patches with Pierre Diffs, syntax highlighting, line selection, and live file watching.
- Add local review notes, copy selected source, and prepare context for an agent.
- Select a pane in the current Rex session and explicitly confirm inserting feedback. Text is sent with `rex send`; it is not submitted automatically.
- Comfortable and Compact density settings; file sidebar can be collapsed.

## Requirements

- Bun 1.0 or newer (the CLI and backend use Bun APIs).
- Git.
- Rex Terminal and [`terminal-browser`](https://github.com/zenbu-labs/terminal-browser) for the integrated workflow.

The frontend build uses Node.js/npm commands. Runtime execution requires Bun; Node.js alone is not supported.

## Install and use

After publication, install the package globally:

```sh
npm install --global rex-pierre-diffs
cd /path/to/your/git/repository
rex-pierre-diffs
```

Run the command from a Git repository in a Rex terminal. It starts a loopback-only server and opens terminal-browser in a right-side split while preserving focus. It tries ports 4179–4199 and reuses a responding rex-pierre-diffs server for the same repository.

```sh
rex-pierre-diffs --help
```

## Review and agent feedback

Choose All changes, Working tree, or Staged. Select changed lines in the diff to show the source preview and actions. Add Comment saves a note in the repository's Git metadata directory. Ask Agent opens a message preview; choose a pane and confirm insertion. The message is placed in the selected pane without an Enter key. Use Copy to Clipboard when pane delivery is unavailable.

## Troubleshooting

- **Not a Git repository:** run the command inside a repository (a subdirectory is fine).
- **Rex pane cannot open:** check that the `rex` command is available in the Rex shell.
- **Browser does not open:** install and check `terminal-browser`.
- **Port unavailable:** the CLI tries the next port through 4199; startup logs are written under `/tmp`.
- **Agent targets unavailable:** the CLI must inherit `REX_SESSION`; verify the pane is in that session.
- **Viewer appears blank:** rebuild the frontend for a source checkout with `npm run build`, then rerun the CLI.

## Known limitations

- Review comments are local notes, not inline line annotations, and do not yet support editing or deleting.
- Agent-pane delivery and multiline insertion require confirmation in your installed Rex version; this project does not press Enter.
- Agent integrations have not been verified against Claude Code, Codex, or OpenCode in this release preparation environment.
- Large-diff performance and responsive appearance inside actual terminal-browser panes still need manual verification.
- There is no standalone non-Rex browser launch command.

## Development

```sh
npm ci
npm run check
npm test
npm run build
```

To run the frontend during development, start the API separately with `bun src/server.ts` and Vite with `npm run dev`. The server binds only to `127.0.0.1`.

## License

This project is MIT licensed. Third-party components retain their own licenses; see [THIRD_PARTY_NOTICES](THIRD_PARTY_NOTICES/).
