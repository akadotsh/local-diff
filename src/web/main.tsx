import * as stylex from "@stylexjs/stylex";
import { styles } from "./styles";
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
import { Explorer } from "./Explorer";
import { SidebarResize } from "./SidebarResize";

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
type ThemePreference = "system" | "light" | "dark";
type ThemeMode = Exclude<ThemePreference, "system">;

function App() {
  const [sidebarMode, setSidebarMode] = useState<"changes" | "explorer">("changes");
  const [explorerHost, setExplorerHost] = useState<HTMLDivElement | null>(null);
  const [explorerOpened, setExplorerOpened] = useState(false);
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
  const [sidebarSide, setSidebarSide] = useState<"left" | "right">(
    () => localStorage.getItem("rex-review-sidebar-side") === "right" ? "right" : "left",
  );
  const [sidebarSettingsOpen, setSidebarSettingsOpen] = useState(false);
  const [themePreference, setThemePreference] = useState<ThemePreference>(() => {
    const saved = localStorage.getItem("rex-review-theme");
    return saved === "system" || saved === "light" || saved === "dark" ? saved : "dark";
  });
  const [systemTheme, setSystemTheme] = useState<ThemeMode>(() =>
    matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark",
  );
  const effectiveTheme: ThemeMode = themePreference === "system" ? systemTheme : themePreference;
  const sidebarSettingsDialogRef = useRef<HTMLDialogElement>(null);
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
  useEffect(() => {
    localStorage.setItem("rex-review-sidebar-side", sidebarSide);
  }, [sidebarSide]);
  useEffect(() => {
    const preference = matchMedia("(prefers-color-scheme: light)");
    const update = () => setSystemTheme(preference.matches ? "light" : "dark");
    preference.addEventListener("change", update);
    return () => preference.removeEventListener("change", update);
  }, []);
  useLayoutEffect(() => {
    document.documentElement.dataset.theme = effectiveTheme;
    document.documentElement.style.colorScheme = effectiveTheme;
    localStorage.setItem("rex-review-theme", themePreference);
  }, [effectiveTheme, themePreference]);
  useEffect(() => {
    const dialog = sidebarSettingsDialogRef.current;
    if (sidebarSettingsOpen && dialog && !dialog.open) dialog.showModal();
    else if (!sidebarSettingsOpen && dialog?.open) dialog.close();
  }, [sidebarSettingsOpen]);
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
    unsafeCSS: `:host { --diffs-bg: ${effectiveTheme === "light" ? "#ffffff" : "#19191b"}; }`,
    theme: effectiveTheme === "light" ? "pierre-light" : "pierre-dark",
    themeType: effectiveTheme,
    diffStyle: "unified" as const,
    overflow: "wrap" as const,
    expandUnchanged: false,
    collapsedContextThreshold: 2,
    enableLineSelection: true,
    onLineSelectionEnd: (range: DiffSelection | null) => choose(range, patch),
  })), [files, choose, effectiveTheme]);
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
      <header className={`app-header ${stylex.props(styles.appHeader).className} ${sidebarMode === "explorer" ? "explorer-mode" : ""}`}>
        <div className={`app-identity ${stylex.props(styles.appIdentity).className}`}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <rect x="3" y="3" width="18" height="18" rx="5" />
            <path d="M8 8h5" stroke="#ff6b7a" />
            <path d="M8 12h8" />
            <path d="M11 16h5" stroke="#3dd68c" />
          </svg>
          <b>Local Diff</b>
        </div>
        <nav className={`mobile-tabs ${stylex.props(styles.mobileTabs).className}`}>
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
        <button
          className={`popout-button ${stylex.props(styles.popoutButton).className}`}
          title="Open review in a separate window"
          aria-label="Open review in a separate window"
          onClick={() => window.open(window.location.href, "_blank", "popup,width=1440,height=900,noopener,noreferrer")}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M14 3h7v7" />
            <path d="M10 14 21 3" />
            <path d="M19 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h6" />
          </svg>
        </button>
      </header>
      <main
        ref={layoutRef}
        className={`mobile-${mobileView} sidebar-${sidebarSide} ${sidebarOpen ? "" : "sidebar-collapsed"}`}
      >
        <aside>
          <div className={`sidebar-heading ${stylex.props(styles.sidebarHeading).className}`}>
            <button
              className={`sidebar-toggle ${stylex.props(styles.sidebarToggle).className}`}
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
            <nav className={`sidebar-modes ${stylex.props(styles.sidebarModes).className}`} aria-label="Sidebar view">
              <button className={`sidebar-mode-button ${stylex.props(styles.sidebarModeButton).className}`} title="Changes" aria-label="Changes" aria-pressed={sidebarMode === "changes"} onClick={() => setSidebarMode("changes")}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 3 4 7l4 4M4 7h12M16 21l4-4-4-4m4 4H8" /></svg></button>
              <button className={`sidebar-mode-button ${stylex.props(styles.sidebarModeButton).className}`} title="Explorer" aria-label="Explorer" aria-pressed={sidebarMode === "explorer"} onClick={() => { setExplorerOpened(true); setSidebarMode("explorer"); }}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 3h10a2 2 0 0 1 2 2v12M4 7h8l4 4v10H4zM12 7v4h4" /></svg></button>
            </nav>
            <h3 hidden={sidebarMode !== "changes"}>
              <span className={`sr-only ${stylex.props(styles.srOnly).className}`}>Changes</span> <span className={`file-count ${stylex.props(styles.fileCount).className}`}>{files.length}</span>
            </h3>
            {sidebarMode === "changes" && (totals.added || totals.deleted) > 0 && (
              <small className={`change-totals ${stylex.props(styles.changeTotals).className}`}>
                <span>+{totals.added}</span> <span>−{totals.deleted}</span>
              </small>
            )}
          </div>
          <div className={`changes-sidebar ${stylex.props(styles.changesSidebar).className}`} hidden={sidebarMode !== "changes"}>
          <input
            type="search"
            aria-label="Search files"
            placeholder="Search files"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {visibleFiles.map(({ index, name }) => (
            <div className={`file-item ${stylex.props(styles.fileItem).className}`} key={index}>
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
                className={`viewed-toggle ${stylex.props(styles.viewedToggle).className}`}
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
          </div>
          <div className={`explorer-host ${stylex.props(styles.explorerHost).className}`} ref={setExplorerHost} hidden={sidebarMode !== "explorer"} />
          <div className={`sidebar-footer ${stylex.props(styles.sidebarFooter).className}`}>
            <span className={`connection-dot ${stylex.props(styles.connectionDot).className}`} aria-hidden="true" />
            <span>Local</span>
            <span className={`footer-branch ${stylex.props(styles.footerBranch).className}`} title={data?.branch}>
              {data?.branch}
            </span>
            <div className={`sidebar-settings ${stylex.props(styles.sidebarSettings).className}`}>
              <button
                className={`sidebar-settings-trigger ${stylex.props(styles.sidebarSettingsTrigger).className}`}
                aria-label="Sidebar settings"
                title="Sidebar settings"
                aria-expanded={sidebarSettingsOpen}
                onClick={() => setSidebarSettingsOpen(open => !open)}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2 2-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-2.8v-.2a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1-2-2 .1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.6-1H5.5v-2.8h.2a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1 2-2 .1.1a1.7 1.7 0 0 0 1.9.3 1.7 1.7 0 0 0 1-1.6v-.2h2.8v.2a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1 2 2-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2V14h-.2a1.7 1.7 0 0 0-1.6 1z" />
                </svg>
              </button>
            </div>
          </div>
        </aside>
        <SidebarResize />
        <section
          hidden={sidebarMode !== "changes"}
          className={`diff-content ${stylex.props(styles.diffContent).className}`}
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
          <details className={`review-notes ${stylex.props(styles.reviewNotes).className}`}>
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
                    className={`collapsed-diff ${stylex.props(styles.collapsedDiff).className}`}
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
                        className={`inline-composer ${stylex.props(styles.inlineComposer).className}`}
                        role="region"
                        aria-label="Ask Agent about selected lines"
                        onKeyDown={(e) => {
                          if (e.key === "Escape") {
                            setSelection(undefined);
                          }
                        }}
                      >
                        <div className={`composer-heading ${stylex.props(styles.composerHeading).className}`}>
                          <div className={`composer-title ${stylex.props(styles.composerTitle).className}`}>
                            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 7 4 4-4 4m8 0h6" /></svg>
                            <strong>Ask Agent</strong>
                            <span className={`composer-line-badge ${stylex.props(styles.composerLineBadge).className}`}>
                              L{context?.start}
                              {context?.end !== context?.start
                                ? `–${context?.end}`
                                : ""}{" "}
                              · {context?.side}
                            </span>
                          </div>
                          <button
                            type="button"
                            className={`composer-close ${stylex.props(styles.composerClose).className}`}
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
                        <div className={`composer-actions ${stylex.props(styles.composerActions).className}`}>
                          <div className={`composer-destination ${stylex.props(styles.composerDestination).className}`}>
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
                                {t.agent} · {t.id.slice(-6)}
                              </option>
                            ))}
                          </select>
                          </div>
                          <button
                            className={`ask-agent-button ${stylex.props(styles.askAgentButton).className}`}
                            disabled={!targets.some(t => t.id === target)}
                            onClick={send}
                          >
                            {agentIcon && <img className={`agent-icon ${stylex.props(styles.agentIcon).className}`} src={agentIcon} alt="" width="16" height="16" />}
                            {agentName ? `Ask ${agentName}` : "Ask Agent"}
                            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 17 17 7M7 7h10v10"/></svg>
                          </button>
                        </div>


                      </div>
                    )}
                    renderHeaderFilenameSuffix={() => (
                      <button
                        type="button"
                        className={`copy-filename ${stylex.props(styles.copyFilename).className}`}
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
            <div className={`empty-state ${stylex.props(styles.emptyState).className}`}>
              <div className={`empty-icon ${stylex.props(styles.emptyIcon).className}`}>
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
        {explorerOpened && explorerHost && <Explorer sidebar={explorerHost} token={token} active={sidebarMode === "explorer"} theme={effectiveTheme} onSelect={() => setMobileView("diff")} />}
      </main>
      <dialog
        ref={sidebarSettingsDialogRef}
        className={`settings-dialog ${stylex.props(styles.settingsDialog).className}`}
        aria-labelledby="settings-title"
        onClose={() => setSidebarSettingsOpen(false)}
        onClick={event => {
          if (event.target === event.currentTarget) setSidebarSettingsOpen(false);
        }}
      >
        <header className={`settings-dialog-header ${stylex.props(styles.settingsDialogHeader).className}`}>
          <div>
            <h2 id="settings-title">Settings</h2>
            <p>Review workspace preferences</p>
          </div>
          <button className={`settings-close ${stylex.props(styles.settingsClose).className}`} aria-label="Close settings" onClick={() => setSidebarSettingsOpen(false)}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg>
          </button>
        </header>
        <div className={`settings-dialog-body ${stylex.props(styles.settingsDialogBody).className}`}>
          <nav className={`settings-nav ${stylex.props(styles.settingsNav).className}`} aria-label="Settings sections">
            <button className={`settings-nav-item selected ${stylex.props(styles.settingsNavItem).className}`} aria-current="page">
              <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42" /></svg>
              Appearance
            </button>
          </nav>
          <section className={`settings-content ${stylex.props(styles.settingsContent).className}`} aria-label="Appearance settings">
            <section className="appearance-setting" aria-labelledby="settings-sidebar-title">
              <h4 id="settings-sidebar-title">Sidebar</h4>
              <p>Choose where the review sidebar appears.</p>
              <div className={`layout-choices ${stylex.props(styles.layoutChoices).className}`} role="radiogroup" aria-label="Sidebar position">
                {(["left", "right"] as const).map(side => (
                  <label className={`layout-choice ${stylex.props(styles.layoutChoice).className}${sidebarSide === side ? " selected" : ""}`} key={side}>
                    <input
                      type="radio"
                      name="sidebar-position"
                      value={side}
                      checked={sidebarSide === side}
                      onChange={() => setSidebarSide(side)}
                    />
                    <span className={`layout-choice-heading ${stylex.props(styles.layoutChoiceHeading).className}`}>
                      <span className={`layout-choice-label ${stylex.props(styles.layoutChoiceLabel).className}`}>Sidebar on the {side}</span>
                      <span className={`layout-choice-radio ${stylex.props(styles.layoutChoiceRadio).className}`} aria-hidden="true">
                        {sidebarSide === side && <svg viewBox="0 0 20 20"><path d="m4 10 4 4 8-8" /></svg>}
                      </span>
                    </span>
                    <span className={`layout-preview layout-preview-${side} ${stylex.props(styles.layoutPreview, side === "right" && styles.layoutPreviewRight).className}`} aria-hidden="true">
                      <span className={`layout-preview-chrome ${stylex.props(styles.layoutPreviewChrome).className}`}><i /><i /><i /></span>
                      <span className={`layout-preview-sidebar ${stylex.props(styles.layoutPreviewSidebar).className}`}><i /><i /><i /><i /></span>
                      <span className={`layout-preview-main ${stylex.props(styles.layoutPreviewMain).className}`}>
                        <i /><i /><i /><i /><i /><i />
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            </section>
            <section className="appearance-setting" aria-labelledby="settings-theme-title">
              <h4 id="settings-theme-title">Theme</h4>
              <p>Choose the color theme for the review workspace.</p>
              <div className={`theme-choices ${stylex.props(styles.themeChoices).className}`} role="radiogroup" aria-label="Color theme">
                {(["system", "light", "dark"] as const).map(theme => (
                  <label className={`theme-choice ${stylex.props(styles.themeChoice).className}${themePreference === theme ? " selected" : ""}`} key={theme}>
                    <input type="radio" name="color-theme" value={theme} checked={themePreference === theme} onChange={() => setThemePreference(theme)} />
                    <span className={`theme-swatch theme-swatch-${theme} ${stylex.props(styles.themeSwatch, theme === "dark" && styles.themeSwatchDark, theme === "light" && styles.themeSwatchLight, theme === "system" && styles.themeSwatchSystem).className}`} aria-hidden="true"><i /><i /></span>
                    <span className={`layout-choice-heading ${stylex.props(styles.layoutChoiceHeading).className}`}>
                      <span className={`theme-choice-label ${stylex.props(styles.themeChoiceLabel).className}`}>{theme[0].toUpperCase() + theme.slice(1)}</span>
                      <span className={`layout-choice-radio ${stylex.props(styles.layoutChoiceRadio).className}`} aria-hidden="true">
                        {themePreference === theme && <svg viewBox="0 0 20 20"><path d="m4 10 4 4 8-8" /></svg>}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            </section>
          </section>
        </div>
      </dialog>
      {status && (
        <div className={`status ${stylex.props(styles.status).className}`} role="status">
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
      <pre className={`app-error ${stylex.props(styles.appError).className}`}>
        local-diff could not render this diff: {this.state.error.message}
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
