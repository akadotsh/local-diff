#!/bin/sh
set -eu

main() {
fail() { printf 'local-diff: %s\n' "$*" >&2; exit 1; }

os=$(uname -s)
arch=$(uname -m)
case "$os/$arch" in
  Darwin/arm64|Darwin/aarch64) platform=darwin-arm64 ;;
  *) fail "Unsupported platform: $os/$arch. Standalone releases support Apple Silicon macOS only." ;;
esac
major=$(sw_vers -productVersion | cut -d . -f 1)
[ "$major" -ge 14 ] || fail 'macOS 14 or newer is required.'
for tool in curl tar shasum; do
  command -v "$tool" >/dev/null 2>&1 || fail "Required command is missing: $tool"
done

umask 022
bin="$HOME/.local/bin"
store="$HOME/.local/share/local-diff"
mkdir -p "$bin" "$store"
work=$(mktemp -d "$store/.install.XXXXXX")
trap 'rm -rf "$work"' 0
trap 'exit 1' HUP INT TERM
asset="local-diff-$platform.tar.gz"
url="https://github.com/akadotsh/local-diff/releases/latest/download/$asset"
download() {
  curl --fail --silent --show-error --location --proto '=https' --proto-redir '=https' --retry 3 --connect-timeout 15 --max-time 300 "$1" -o "$2" ||
    fail "Download failed: $1. Check your connection and that a stable release includes $asset."
}
download "$url" "$work/$asset"
download "$url.sha256" "$work/$asset.sha256"
expected=$(cut -d ' ' -f 1 "$work/$asset.sha256")
actual=$(shasum -a 256 "$work/$asset")
[ "${actual%% *}" = "$expected" ] || fail 'SHA-256 verification failed; installation unchanged.'
mkdir "$work/bundle"
tar -xzf "$work/$asset" -C "$work/bundle" local-diff dist local-diff.lua LICENSE THIRD_PARTY_NOTICES || fail 'Invalid release archive.'
[ -f "$work/bundle/local-diff" ] && [ ! -L "$work/bundle/local-diff" ] && [ -f "$work/bundle/dist/index.html" ] || fail 'Release files are missing.'
chmod 755 "$work/bundle/local-diff"
"$work/bundle/local-diff" --version || fail 'Downloaded executable cannot run on this system.'
[ ! -d "$bin/local-diff" ] || fail "$bin/local-diff is a directory."
# Keep previous bundles so running viewers survive upgrades; uninstall removes them.
bundle=$(mktemp -d "$store/release.XXXXXX")
mv "$work/bundle/"* "$bundle/"
ln -s "$bundle/local-diff" "$work/local-diff"
mv -f "$work/local-diff" "$bin/local-diff"
printf 'Installed %s\nRun local-diff inside a Git repository in Rex. Git, Rex and rexweb must be on PATH.\n' "$bin/local-diff"
case ":${PATH:-}:" in
  *:"$bin":*) ;;
  *) printf 'Add this to your shell profile, then open a new terminal:\n  export PATH="$HOME/.local/bin:$PATH"\n' ;;
esac
}

main "$@"
