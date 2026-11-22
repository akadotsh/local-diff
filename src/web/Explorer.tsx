import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { File } from "@pierre/diffs/react";
import { prepareFileTreeInput, type GitStatusEntry } from "@pierre/trees";
import { FileTree, useFileTree } from "@pierre/trees/react";

type Listing = { paths: string[]; statuses: Record<string, string> };
const options = { theme: "pierre-dark", themeType: "dark" as const, overflow: "scroll" as const, unsafeCSS: ":host { --diffs-bg: #19191b; }" };
export function Explorer({ sidebar, token, active, onSelect }: { sidebar: HTMLElement; token: string; active: boolean; onSelect: () => void }) {
  const [listing, setListing] = useState<Listing>();
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<string>();
  const [file, setFile] = useState<{ name: string; contents: string }>();
  const [previewError, setPreviewError] = useState("");
  const [revision, setRevision] = useState(0);
  const request = (url: string, signal: AbortSignal) => fetch(url, { signal, headers: { "x-review-token": token } }).then(async response => {
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Could not load repository");
    return data;
  });
  const { model } = useFileTree({ paths: [], icons: { set: "standard", colored: false }, initialExpansion: "closed", renaming: false, dragAndDrop: false,
    onSelectionChange: paths => { const path = paths[paths.length - 1]; if (path && model.getItem(path)?.isDirectory() === false) { setSelected(path); onSelect(); } },
    unsafeCSS: ":host { color-scheme: dark; --trees-theme-sidebar-bg: #202022; --trees-theme-sidebar-fg: #bdbdc6; --trees-theme-list-active-selection-bg: #ffffff0b; --trees-theme-list-active-selection-fg: #f0f0f3; --trees-theme-list-hover-bg: #ffffff08; font-family: -apple-system, BlinkMacSystemFont, sans-serif; }",
  });
  const previousPaths = useRef("");
  useEffect(() => {
    const controller = new AbortController();
    let sequence = 0;
    const load = () => {
      const current = ++sequence;
      void request("/api/files", controller.signal).then(data => {
        if (current !== sequence) return;
        setListing(data); setError(""); setRevision(value => value + 1);
      }).catch(error => { if (!controller.signal.aborted) setError(String(error.message)); });
    };
    load();
    const events = new EventSource("/events");
    events.onmessage = load;
    return () => { controller.abort(); events.close(); };
  }, []);
  useEffect(() => {
    if (!listing) return;
    const key = JSON.stringify(listing.paths);
    if (key !== previousPaths.current) {
      const expanded = model.getVisibleRows(0, model.getVisibleCount()).filter(row => row.kind === "directory" && row.isExpanded).map(row => row.path);
      model.resetPaths({ preparedInput: prepareFileTreeInput(listing.paths), initialExpandedPaths: expanded });
      previousPaths.current = key;
    }
    const statuses: GitStatusEntry[] = Object.entries(listing.statuses).map(([path, code]) => ({ path, status: code === "??" ? "untracked" : code.includes("D") ? "deleted" : code.includes("R") ? "renamed" : code.includes("A") ? "added" : "modified" }));
    model.setGitStatus(statuses);
  }, [listing, model]);
  const pathsKey = JSON.stringify(listing?.paths);
  useEffect(() => {
    if (!listing) return;
    let cancelled = false;
    void import("./materialIcons").then(({ materialIcons }) => materialIcons(listing.paths))
      .then(icons => { if (!cancelled) model.setIcons(icons); })
      .catch(() => { if (!cancelled) setError("Could not load Material file icons."); });
    return () => { cancelled = true; };
  }, [pathsKey, model]);
  useEffect(() => {
    if (!selected) return;
    const controller = new AbortController();
    setPreviewError("");
    void request("/api/file?path=" + encodeURIComponent(selected), controller.signal)
      .then(next => { if (!controller.signal.aborted) setFile(current => current?.name === next.name && current?.contents === next.contents ? current : next); })
      .catch(error => { if (!controller.signal.aborted) { setFile(undefined); setPreviewError(error.message); } });
    return () => controller.abort();
  }, [selected, revision]);
  const displayed = file?.name === selected ? file : undefined;
  return <>
    {createPortal(<div className="explorer-sidebar" hidden={!active}>
      {error && <p role="alert">{error}</p>}
      {!listing && !error && <p role="status">Loading repository…</p>}
      {listing?.paths.length === 0 && <p>No repository files.</p>}
      <FileTree model={model} className="repository-tree" aria-label="Repository files" />
    </div>, sidebar)}
    <section className="source-content" aria-label="File preview" hidden={!active}>
      {!selected ? <div className="empty-state"><h1>Explore your repository</h1><p>Select a file to read its source.</p></div>
        : previewError ? <div className="empty-state" role="alert"><h1>Could not preview file</h1><p>{previewError}</p></div>
        : !displayed ? <div className="empty-state" role="status">Loading {selected}…</div>
        : <><File file={displayed} options={options} />{!displayed.contents && <p className="source-empty">This file is empty.</p>}</>}
    </section>
  </>;
}
