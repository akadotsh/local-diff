import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createRoot } from "react-dom/client";
import { PatchDiff } from "@pierre/diffs/react";
import { parsePatchFiles, type DiffLineAnnotation } from "@pierre/diffs";
import {
  reviewMessage,
  selectionContext,
  type DiffSelection,
} from "../shared/review";
import "./style.css";

const token =
  document.querySelector<HTMLMetaElement>('meta[name="review-token"]')
    ?.content || "";
const agentIcons: Record<string, string> = {
  Codex: new URL("./assets/codex.svg", import.meta.url).href,
  Claude: new URL("./assets/claude.svg", import.meta.url).href,
  OpenCode: new URL("./assets/opencode.svg", import.meta.url).href,
};
const NO_ANNOTATIONS: DiffLineAnnotation[] = [];
type Selection = {
  patch: string;
  range: DiffSelection;
  context: ReturnType<typeof selectionContext>;
};

function App() {
  const [data, setData] = useState<any>();
  const [mode, setMode] = useState("all");
  const [search, setSearch] = useState("");
  const [activeFile, setActiveFile] = useState<string>();
  const [viewed, setViewed] = useState<Set<string>>(() => new Set());
  const [comments, setComments] = useState<any[]>([]);
  const [selection, setSelection] = useState<Selection>();
  const [question, setQuestion] = useState("");
  const [targets, setTargets] = useState<{ id: string; label: string; agent: string }[]>([]);
  const [target, setTarget] = useState(
    localStorage.getItem("rex-review-agent") || "",
  );
  const [status, setStatus] = useState("");
  const [mobileView, setMobileView] = useState<"diff" | "files">("diff");
  const [density, setDensity] = useState<"comfortable" | "compact">(
    () =>
      (localStorage.getItem("rex-review-density") as
        "comfortable" | "compact") || "comfortable",
  );
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const layoutRef = useRef<HTMLElement>(null);
  const previousDiffX = useRef<number | null>(null);
  useLayoutEffect(() => {
    const content =
      layoutRef.current?.querySelector<HTMLElement>(".diff-content");
    const previousX = previousDiffX.current;
    previousDiffX.current = null;
    if (!content || previousX === null) return;
    const offset = previousX - content.getBoundingClientRect().left;
    const animation = content.animate(
      [
        { transform: `translateX(${offset}px)` },
        { transform: "translateX(0)" },
      ],
      {
        duration: 200,
        easing: getComputedStyle(content).getPropertyValue("--ease-out").trim(),
      },
    );
    return () => animation.cancel();
  }, [sidebarOpen]);
  useEffect(() => {
    document.body.dataset.density = density;
    localStorage.setItem("rex-review-density", density);
  }, [density]);
  const load = () =>
    fetch("/api/diff?mode=" + mode)
      .then((r) => r.json())
      .then(setData);
  useEffect(() => {
    load();
    fetch("/api/reviews")
      .then((r) => r.json())
      .then(setComments);
    const e = new EventSource("/events");
    e.onmessage = load;
    return () => e.close();
  }, [mode]);
  useEffect(() => {
    if (!selection) return;
    const controller = new AbortController();
    setTargets([]);
    fetch("/api/targets", { signal: controller.signal })
      .then(async r => { const data = await r.json(); if (!r.ok) throw new Error(data.error || "Could not find agent panes"); return data; })
      .then(d => {
        setTargets(d.blocks);
        setTarget(current => d.blocks.some((block: { id: string }) => block.id === current) ? current : "");
      })
      .catch(error => { if (!controller.signal.aborted) { setTarget(""); setStatus(String(error)); } });
    return () => controller.abort();
  }, [selection]);
  const files: string[] = useMemo(() => {
    const patch = data?.patch || "";
    return patch
      .split(/(?=^diff --git )/m)
      .filter((f: string) => f.startsWith("diff --git "));
  }, [data]);
  const totals = useMemo(() => {
    let added = 0,
      deleted = 0;
    for (const file of parsePatchFiles(data?.patch || "").flatMap(
      (p) => p.files,
    ))
      for (const hunk of file.hunks) {
        added += hunk.additionLines;
        deleted += hunk.deletionLines;
      }
    return { added, deleted };
  }, [data]);
  const fileNames = files.map(
    (patch) => patch.match(/^diff --git .* b\/(.*)$/m)?.[1] || "",
  );
  const visibleFiles = fileNames
    .map((name, index) => ({ index, name }))
    .filter((file) =>
      file.name.toLowerCase().includes(search.trim().toLowerCase()),
    );
  const selectedAgent = targets.find(t => t.id === target)?.agent;
  const agentName = selectedAgent === "Claude" ? "Claude Code" : selectedAgent;
  const agentIcon = selectedAgent ? agentIcons[selectedAgent] : undefined;
  const context = selection?.context;
  const message = () =>
    context && reviewMessage(data?.root || "", context, question);
  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setStatus("Copied to clipboard.");
    } catch {
      setStatus("Clipboard unavailable. Select and copy the message below.");
    }
  }
  const choose = useCallback((range: DiffSelection | null, patch: string) => {
    if (!range) {
      setSelection(undefined);
      return;
    }
    setSelection({ patch, range, context: selectionContext(patch, range) });
  }, []);
  const annotations = useMemo<DiffLineAnnotation[]>(() => selection ? [{
    side: selection.range.endSide ?? selection.range.side ?? "additions",
    lineNumber: selection.range.end,
  }] : NO_ANNOTATIONS, [selection]);
  const diffOptions = useMemo(() => files.map(patch => ({
    unsafeCSS: ":host { --diffs-bg: #19191b; }",
    theme: "pierre-dark",
    themeType: "dark" as const,
    diffStyle: "unified" as const,
    overflow: "wrap" as const,
    expandUnchanged: false,
    collapsedContextThreshold: 2,
    enableLineSelection: true,
    onLineSelectionEnd: (range: DiffSelection | null) => choose(range, patch),
  })), [files, choose]);
  async function send() {
    if (!selection || !targets.some(t => t.id === target)) return;
    setStatus("Sending…");
    try {
      const r = await fetch("/api/send", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-review-token": token,
        },
        body: JSON.stringify({ blockId: target, message: message() }),
      });
      const result = await r.json();
      if (!r.ok) throw new Error(result.error || "Delivery failed");
      localStorage.setItem("rex-review-agent", target);
      setStatus("Inserted into selected pane. It was not submitted.");
      setSelection(undefined);
    } catch (e) {
      setStatus(`Delivery failed: ${String(e)}`);
    }
  }
  return (
    <>
      <header className="app-header">
        <div className="app-identity">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <rect x="3" y="3" width="18" height="18" rx="5" />
            <path d="M8 8h5" stroke="#ff6b7a" />
            <path d="M8 12h8" />
            <path d="M11 16h5" stroke="#3dd68c" />
          </svg>
          <b>Rex Pierre Diffs</b>
        </div>
        <nav className="mobile-tabs">
          <button
            aria-pressed={mobileView === "diff"}
            onClick={() => setMobileView("diff")}
          >
            Diff
          </button>
          <button
            aria-pressed={mobileView === "files"}
            onClick={() => setMobileView("files")}
          >
            Files
          </button>
        </nav>
        <select
          aria-label="Change scope"
          value={mode}
          onChange={(e) => setMode(e.target.value)}
        >
          <option value="all">All changes</option>
          <option value="working">Working tree</option>
          <option value="staged">Staged</option>
        </select>
        <select
          aria-label="Display density"
          value={density}
          onChange={(e) =>
            setDensity(e.target.value as "comfortable" | "compact")
          }
        >
          <option value="comfortable">Comfortable</option>
          <option value="compact">Compact</option>
        </select>
      </header>
      <main
        ref={layoutRef}
        className={`mobile-${mobileView} ${sidebarOpen ? "" : "sidebar-collapsed"}`}
      >
        <aside>
          <div className="sidebar-heading">
            <button
              className="sidebar-toggle"
              aria-label={sidebarOpen ? "Hide files" : "Show files"}
              title={sidebarOpen ? "Hide files" : "Show files"}
              aria-expanded={sidebarOpen}
              onClick={(e) => {
                const animate =
                  e.detail > 0 &&
                  !matchMedia("(prefers-reduced-motion: reduce)").matches;
                const layout = layoutRef.current;
                if (layout) layout.dataset.sidebarMotion = String(animate);
                previousDiffX.current = animate
                  ? (layout
                      ?.querySelector(".diff-content")
                      ?.getBoundingClientRect().left ?? null)
                  : null;
                setSidebarOpen(!sidebarOpen);
              }}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <rect x="3" y="4" width="18" height="16" rx="2" />
                <path d="M9 4v16" />
              </svg>
            </button>
            <h3>
              Changes <span className="file-count">{files.length}</span>
            </h3>
            {(totals.added || totals.deleted) > 0 && (
              <small className="change-totals">
                <span>+{totals.added}</span> <span>−{totals.deleted}</span>
              </small>
            )}
          </div>
          <input
            type="search"
            aria-label="Search files"
            placeholder="Search files"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {visibleFiles.map(({ index, name }) => (
            <div className="file-item" key={index}>
              <a
                href={"#f" + index}
                onClick={() => {
                  setActiveFile(name);
                  setMobileView("diff");
                }}
                aria-current={
                  (activeFile || fileNames[0]) === name ? "location" : undefined
                }
              >
                {name}
              </a>
              <button
                className="viewed-toggle"
                aria-label={
                  viewed.has(name) ? "Mark as unviewed" : "Mark as viewed"
                }
                aria-pressed={viewed.has(name)}
                onClick={() =>
                  setViewed((current) => {
                    const next = new Set(current);
                    next.has(name) ? next.delete(name) : next.add(name);
                    return next;
                  })
                }
              >
                <svg viewBox="0 0 18 18" aria-hidden="true">
                  <rect x="1" y="1" width="16" height="16" rx="3" />
                  <path d="m4.5 9 3 3 6-6" />
                </svg>
              </button>
            </div>
          ))}
          {search && visibleFiles.length === 0 && <p>No matching files.</p>}
          <div className="sidebar-footer">
            <span className="connection-dot" aria-hidden="true" />
            <span>Local</span>
            <span className="footer-branch" title={data?.branch}>
              {data?.branch}
            </span>
          </div>
        </aside>
        <section
          className="diff-content"
          aria-label="Diff viewer"
          onScroll={(e) => {
            const articles = e.currentTarget.querySelectorAll("article");
            const top = e.currentTarget.getBoundingClientRect().top + 40;
            let current = articles[0];
            for (const article of articles) {
              if (article.getBoundingClientRect().top > top) break;
              current = article;
            }
            if (current) setActiveFile(current.dataset.file);
          }}
        >
          <details className="review-notes">
            <summary>Review notes ({comments.length})</summary>
            {comments.map((c) => (
              <p key={c.id}>
                {c.file} {c.range}: {c.body}
              </p>
            ))}
          </details>
          {files.length ? (
            files.map((f, i) => (
              <article id={"f" + i} data-file={fileNames[i]} key={i}>
                {viewed.has(fileNames[i]) ? (
                  <button
                    className="collapsed-diff"
                    onClick={() =>
                      setViewed((current) => {
                        const next = new Set(current);
                        next.delete(fileNames[i]);
                        return next;
                      })
                    }
                  >
                    ✓ Viewed · Show diff
                  </button>
                ) : (
                  <PatchDiff
                    patch={f}
                    selectedLines={
                      selection?.patch === f ? selection.range : null
                    }
                    lineAnnotations={selection?.patch === f ? annotations : NO_ANNOTATIONS}
                    renderAnnotation={() => (
                      <div
                        className="inline-composer"
                        role="region"
                        aria-label="Ask Agent about selected lines"
                        onKeyDown={(e) => {
                          if (e.key === "Escape") {
                            setSelection(undefined);
                          }
                        }}
                      >
                        <div className="composer-heading">
                          <div className="composer-title">
                            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 7 4 4-4 4m8 0h6" /></svg>
                            <strong>Ask Agent</strong>
                            <span className="composer-line-badge">
                              L{context?.start}
                              {context?.end !== context?.start
                                ? `–${context?.end}`
                                : ""}{" "}
                              · {context?.side}
                            </span>
                          </div>
                          <button
                            type="button"
                            className="composer-close"
                            aria-label="Close composer"
                            onClick={() => {
                              setSelection(undefined);
                            }}
                          >
                            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 7 10 10M17 7 7 17" /></svg>
                          </button>
                        </div>
                        <textarea
                          aria-label="Question for agent"
                          value={question}
                          onChange={(e) => setQuestion(e.target.value)}
                          placeholder="Ask about these lines…"
                          rows={3}
                        />
                        <div className="composer-actions">
                          <div className="composer-destination">
                          <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="3"/><path d="m7 9 3 3-3 3m6 0h4"/></svg>
                          <select
                            aria-label="Target Rex pane"
                            title={targets.find(t => t.id === target)?.label || "Choose an agent pane"}
                            value={target}
                            onChange={(e) => {
                              setTarget(e.target.value);
                            }}
                          >
                            <option value="">{targets.length ? "Choose agent pane…" : "No recognized agent panes"}</option>
                            {targets.map((t) => (
                              <option key={t.id} value={t.id}>
                                {t.label} · {t.id.slice(-6)}
                              </option>
                            ))}
                          </select>
                          </div>
                          <button
                            className="ask-agent-button"
                            disabled={!targets.some(t => t.id === target)}
                            onClick={send}
                          >
                            {agentIcon && <img className="agent-icon" src={agentIcon} alt="" width="16" height="16" />}
                            {agentName ? `Ask ${agentName}` : "Ask Agent"}
                            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 17 17 7M7 7h10v10"/></svg>
                          </button>
                        </div>


                      </div>
                    )}
                    renderHeaderFilenameSuffix={() => (
                      <button
                        type="button"
                        className="copy-filename"
                        aria-label={`Copy file path: ${fileNames[i]}`}
                        title="Copy file path"
                        onClick={(e) => {
                          e.stopPropagation();
                          void copy(fileNames[i]);
                        }}
                      >
                        <svg viewBox="0 0 24 24" aria-hidden="true">
                          <rect x="8" y="8" width="12" height="12" rx="2" />
                          <path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3" />
                        </svg>
                      </button>
                    )}
                    style={
                      {
                        "--diffs-font-size":
                          density === "comfortable" ? "14px" : "12px",
                        "--diffs-line-height":
                          density === "comfortable" ? "22px" : "19px",
                      } as React.CSSProperties
                    }
                    options={diffOptions[i]}
                  />
                )}
              </article>
            ))
          ) : (
            <div className="empty-state">
              <div className="empty-icon">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="m8 12 3 3 5-6" />
                  <rect x="3" y="3" width="18" height="18" rx="5" />
                </svg>
              </div>
              <h1>{data ? "All caught up" : "Loading changes…"}</h1>
              <p>
                {data
                  ? mode === "staged"
                    ? "No staged changes to review."
                    : mode === "working"
                      ? "No working tree changes to review."
                      : "Your working tree is clean."
                  : "Reading your local repository."}
              </p>
              {data && (
                <small>
                  Edit a file{mode === "staged" ? " and stage it" : ""} to see
                  changes here.
                </small>
              )}
            </div>
          )}
        </section>
      </main>
      {status && (
        <div className="status" role="status">
          {status}
        </div>
      )}
    </>
  );
}
class ErrorBoundary extends React.Component<
  React.PropsWithChildren,
  { error?: Error }
> {
  state: { error?: Error } = {};
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    return this.state.error ? (
      <pre className="app-error">
        rex-pierre-diffs could not render this diff: {this.state.error.message}
      </pre>
    ) : (
      this.props.children
    );
  }
}
createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
);
