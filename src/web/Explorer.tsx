import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { File } from "@pierre/diffs/react";
import type { LineAnnotation, SelectedLineRange } from "@pierre/diffs";
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
  const [selectedLines, setSelectedLines] = useState<SelectedLineRange | null>(null);
  const [question, setQuestion] = useState("");
  const [targets, setTargets] = useState<{id:string;label:string;agent:string}[]>([]);
  const [target, setTarget] = useState("");
  const [messageStatus, setMessageStatus] = useState("");
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
  useEffect(() => {
    if (!selectedLines) return;
    const controller = new AbortController();
    void fetch("/api/targets", {signal:controller.signal}).then(async response => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not find agent panes");
      return data.blocks as typeof targets;
    }).then(blocks => { setTargets(blocks); setTarget(current => blocks.some(block => block.id === current) ? current : ""); })
      .catch(error => { if (!controller.signal.aborted) setMessageStatus(String(error.message)); });
    return () => controller.abort();
  }, [selectedLines]);
  const annotations: LineAnnotation[] = selectedLines ? [{lineNumber:selectedLines.end}] : [];
  async function sendToAgent() {
    if (!selected || !displayed || !selectedLines || !target) return;
    const code = displayed.contents.split("\n").slice(selectedLines.start - 1, selectedLines.end).join("\n");
    const body = `Please review this selected code context.\nFile: ${selected}\nLines: ${selectedLines.start}${selectedLines.end === selectedLines.start ? "" : `–${selectedLines.end}`}\n\n\`\`\`\n${code}\n\`\`\`${question.trim() ? `\n\nQuestion: ${question.trim()}` : ""}`;
    setMessageStatus("Sending…");
    try {
      const response = await fetch("/api/send", {method:"POST", headers:{"content-type":"application/json","x-review-token":token}, body:JSON.stringify({blockId:target,message:body})});
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Delivery failed");
      setQuestion(""); setSelectedLines(null); setMessageStatus("Inserted into selected pane. It was not submitted.");
    } catch(error) { setMessageStatus(String(error)); }
  }
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
        : <><File file={displayed} options={{...options, enableLineSelection:true, onLineSelectionEnd:setSelectedLines}} selectedLines={selectedLines} lineAnnotations={annotations} renderAnnotation={(annotation: LineAnnotation) => annotation.lineNumber === selectedLines?.end ? <div className="inline-composer" role="region" aria-label="Ask Agent about selected lines">
          <div className="composer-heading"><strong>Ask Agent · {selectedLines.start}{selectedLines.end !== selectedLines.start ? `–${selectedLines.end}` : ""}</strong><button className="composer-close" aria-label="Close composer" onClick={() => setSelectedLines(null)}>×</button></div>
          <textarea aria-label="Question for agent" value={question} onChange={event => setQuestion(event.target.value)} placeholder="Ask about these lines…" rows={3}/>
          <div className="composer-actions"><select aria-label="Target Rex pane" value={target} onChange={event => setTarget(event.target.value)}><option value="">{targets.length ? "Choose agent pane…" : "No recognized agent panes"}</option>{targets.map(agent => <option key={agent.id} value={agent.id}>{agent.agent} · {agent.id.slice(-6)}</option>)}</select><button className="ask-agent-button" disabled={!targets.some(agent => agent.id === target)} onClick={() => void sendToAgent()}>Ask Agent</button></div>
          {messageStatus && <small>{messageStatus}</small>}
        </div> : null} />{!displayed.contents && <p className="source-empty">This file is empty.</p>}</>}
    </section>
  </>;
}
