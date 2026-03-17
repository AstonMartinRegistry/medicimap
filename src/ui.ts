import type { GraphState } from "./graph";
import { setHighlight, clearHighlight, flyToNode } from "./graph";
import { fetchDocuments } from "./data";
import type { NodeData, EdgeData, DocumentData } from "./types";

function esc(s: string): string {
  return s.replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function formatName(name: string): string {
  const comma = name.indexOf(",");
  if (comma === -1) return name;
  const last = name.slice(0, comma).trim();
  const first = name.slice(comma + 1).trim();
  return `${first} ${last}`;
}

function formatNameTooltipHTML(name: string): string {
  const comma = name.indexOf(",");
  if (comma === -1) return `<span class="tooltip-last">${esc(name)}</span>`;
  const last = esc(name.slice(0, comma).trim());
  const first = esc(name.slice(comma + 1).trim());
  if (!first) return `<span class="tooltip-last">${last}</span>`;
  return `${first} <span class="tooltip-last">${last}</span>`;
}

function formatNameDetailHTML(name: string, isMedici: boolean): string {
  const full = esc(formatName(name));
  return isMedici ? `<span class="medici-dot"></span> ${full}` : full;
}

// ─── Stats ───

export function initStats(stats: {
  nodeCount: number;
  mediciPeopleCount: number;
  documentCount: number;
  mediciDocumentCount: number;
  edgeCount: number;
  mediciEdgeCount: number;
}) {
  const el = document.getElementById("stats-content")!;
  el.innerHTML = `
    <div>${stats.nodeCount.toLocaleString()} people <span class="stat-sub">(${stats.mediciPeopleCount.toLocaleString()} Medici)</span></div>
    <div>${stats.documentCount.toLocaleString()} documents <span class="stat-sub">(${stats.mediciDocumentCount.toLocaleString()} with Medici)</span></div>
    <div>${stats.edgeCount.toLocaleString()} connections <span class="stat-sub">(${stats.mediciEdgeCount.toLocaleString()} Medici)</span></div>
  `;

  const sidebar = document.getElementById("sidebar")!;
  const closeBtn = document.getElementById("stats-close")!;
  const searchBar = document.getElementById("search-bar")!;
  const footer = document.getElementById("footer-credit")!;

  closeBtn.addEventListener("click", () => {
    const isCollapsed = sidebar.classList.toggle("collapsed");
    searchBar.classList.toggle("hidden", isCollapsed);
    footer.classList.toggle("hidden", isCollapsed);
    closeBtn.classList.add("no-hover");
    const remove = () => {
      closeBtn.classList.remove("no-hover");
      closeBtn.removeEventListener("mouseleave", remove);
    };
    closeBtn.addEventListener("mouseleave", remove);
  });
}

// ─── Tooltip ───

export function initTooltip(state: GraphState) {
  const tooltip = document.getElementById("tooltip")!;
  const isMobile = () => window.matchMedia("(max-width: 768px)").matches;

  state.renderer.on("enterNode", ({ node }) => {
    if (isMobile()) return;
    const attrs = state.graph.getNodeAttributes(node);
    const nodeData = state.nodeById.get(Number(node));
    const isMedici = nodeData?.isMedici ?? false;
    const label = attrs.label || `Node ${node}`;
    tooltip.innerHTML = formatNameTooltipHTML(label);
    tooltip.classList.toggle("medici", isMedici);
    tooltip.classList.toggle("last-only", !label.includes(",") || !label.slice(label.indexOf(",") + 1).trim());
    tooltip.style.display = "block";
  });

  state.renderer.on("leaveNode", () => {
    tooltip.style.display = "none";
  });

  state.renderer.getMouseCaptor().on("mousemovebody", (e: any) => {
    if (isMobile() || tooltip.style.display === "none") return;
    tooltip.style.left = e.original.clientX + 14 + "px";
    tooltip.style.top = e.original.clientY + 14 + "px";
  });
}

// ─── Search ───

export function initSearch(state: GraphState, onSelect: (nodeId: number) => void) {
  const input = document.getElementById("search-input") as HTMLInputElement;
  const dropdown = document.getElementById("search-dropdown")!;
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  const allNodes = Array.from(state.nodeById.values());

  function render(query: string) {
    const q = query.toLowerCase().trim();
    if (q.length < 1) {
      dropdown.style.display = "none";
      return;
    }

    const matches = allNodes
      .filter((n) => n.name.toLowerCase().includes(q) || formatName(n.name).toLowerCase().includes(q))
      .slice(0, 60);

    if (matches.length === 0) {
      dropdown.innerHTML = '<div class="search-empty">No results</div>';
    } else {
      dropdown.innerHTML = matches
        .map(
          (n) =>
            `<div class="search-item" data-id="${n.id}">${esc(formatName(n.name))}</div>`
        )
        .join("");
    }
    dropdown.style.display = "block";
  }

  const tooltip = document.getElementById("tooltip")!;
  const isMobile = () => window.matchMedia("(max-width: 768px)").matches;

  input.addEventListener("focus", () => {
    tooltip.style.display = "none";
    render(input.value);
  });
  input.addEventListener("input", () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => render(input.value), 80);
  });
  input.addEventListener("blur", () => {
    dropdown.style.display = "none";
    input.value = "";
  });
  input.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      input.blur();
      dropdown.style.display = "none";
    }
  });

  dropdown.addEventListener("mousedown", (e) => {
    const item = (e.target as HTMLElement).closest(".search-item") as HTMLElement;
    if (!item) return;
    e.preventDefault();
    const id = Number(item.dataset.id);
    const node = state.nodeById.get(id);
    if (node) {
      input.value = "";
      dropdown.style.display = "none";
      input.blur();
      flyToNode(state, String(id));
      onSelect(id);
    }
  });

  if (isMobile()) {
    let lastVpH = (window.visualViewport?.height ?? window.innerHeight);
    window.visualViewport?.addEventListener("resize", () => {
      const vpH = window.visualViewport?.height ?? window.innerHeight;
      if (vpH > lastVpH && document.activeElement === input) {
        input.blur();
      }
      lastVpH = vpH;
    });
  }
}

// ─── Detail Panel ───

function updateScrollFade(el: HTMLElement) {
  const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 2;
  el.classList.toggle("at-bottom", atBottom);
}

export function initDetailPanel(state: GraphState) {
  const panel = document.getElementById("detail-panel")!;
  const titleEl = document.getElementById("detail-title")!;
  const metaEl = document.getElementById("detail-meta")!;
  const connectionsEl = document.getElementById("detail-connections")!;
  const docsEl = document.getElementById("detail-docs")!;
  const backBtn = document.getElementById("detail-back")!;
  const closeBtn = document.getElementById("detail-close")!;

  const isMobile = () => window.matchMedia("(max-width: 768px)").matches;
  const searchBar = document.getElementById("search-bar")!;

  let touchStartY = 0;
  let touchStartInHeader = false;
  const headerEl = panel.querySelector(".detail-header")!;
  panel.addEventListener("touchstart", (e) => {
    touchStartY = e.touches[0].clientY;
    touchStartInHeader = headerEl.contains(e.target as Node);
  }, { passive: true });

  panel.addEventListener("touchend", (e) => {
    if (!isMobile() || !panel.classList.contains("open")) return;
    const dy = e.changedTouches[0].clientY - touchStartY;
    if (!panel.classList.contains("expanded")) {
      if (dy < -30) {
        panel.classList.add("expanded");
        searchBar.classList.add("mobile-hidden");
      } else if (dy > 60) {
        requestClose();
      }
    } else if (touchStartInHeader && dy > 60) {
      requestClose();
    }
  }, { passive: true });


  const history: number[] = [];
  let currentId: number | null = null;

  const footer = document.getElementById("footer-credit")!;

  let closeTransitionHandler: (() => void) | null = null;

  function cancelCloseTransition() {
    if (closeTransitionHandler) {
      panel.removeEventListener("transitionend", closeTransitionHandler);
      closeTransitionHandler = null;
    }
    panel.classList.remove("closing");
  }

  function requestClose() {
    if (isMobile()) {
      cancelCloseTransition();
      panel.classList.add("closing");
      closeTransitionHandler = () => {
        panel.removeEventListener("transitionend", closeTransitionHandler!);
        closeTransitionHandler = null;
        close();
      };
      panel.addEventListener("transitionend", closeTransitionHandler);
    } else {
      close();
    }
  }

  window.addEventListener("resize", () => {
    clearHighlight(state);
    if (currentId !== null) setHighlight(state, String(currentId));
  });

  function close() {
    cancelCloseTransition();
    panel.classList.remove("open", "expanded", "closing");
    searchBar.classList.remove("mobile-hidden");
    if (isMobile()) footer.classList.remove("mobile-hidden");
    clearHighlight(state);
    history.length = 0;
    currentId = null;
    backBtn.style.display = "none";
  }

  async function show(nodeId: number, fromBack = false) {
    const node = state.nodeById.get(nodeId);
    if (!node) return;

    if (!fromBack && currentId !== null && currentId !== nodeId) {
      history.push(currentId);
    }
    currentId = nodeId;
    backBtn.style.display = history.length > 0 ? "flex" : "none";

    setHighlight(state, String(nodeId));

    const isMedici = node.isMedici;
    panel.classList.toggle("medici", isMedici);
    titleEl.innerHTML = formatNameDetailHTML(node.name, isMedici);

    if (node.bornYear || node.deathYear) {
      const b = node.bornYear ?? "?";
      const d = node.deathYear ?? "?";
      metaEl.textContent = `${b} – ${d}`;
    } else {
      metaEl.textContent = "";
    }

    const connEdges = state.edgesByNode.get(nodeId) || [];
    const connMap = new Map<number, { name: string; weight: number; edges: EdgeData[] }>();
    for (const e of connEdges) {
      const otherId = e.source === nodeId ? e.target : e.source;
      if (!connMap.has(otherId)) {
        const other = state.nodeById.get(otherId);
        connMap.set(otherId, {
          name: other ? formatName(other.name) : `Person ${otherId}`,
          weight: 0,
          edges: [],
        });
      }
      const entry = connMap.get(otherId)!;
      entry.weight += e.weight;
      entry.edges.push(e);
    }

    const conns = Array.from(connMap.entries()).sort(
      (a, b) => b[1].weight - a[1].weight
    );

    connectionsEl.innerHTML = conns.length
      ? conns
          .map(
            ([id, c]) =>
              `<div class="conn-item" data-id="${id}">${esc(c.name)} <span class="conn-weight">(${c.weight})</span></div>`
          )
          .join("")
      : '<div class="detail-empty">None</div>';

    connectionsEl.querySelectorAll<HTMLElement>(".conn-item").forEach((el) => {
      el.addEventListener("click", () => {
        const id = Number(el.dataset.id);
        flyToNode(state, String(id));
        show(id);
      });
    });

    docsEl.innerHTML = '<div class="detail-empty">Loading documents…</div>';
    panel.style.overflowY = "hidden";
    panel.scrollTop = 0;
    cancelCloseTransition();
    panel.classList.add("open");
    if (isMobile()) footer.classList.add("mobile-hidden");
    requestAnimationFrame(() => { panel.style.overflowY = ""; });

    const allDocs = await fetchDocuments();
    const docMap = new Map<
      string,
      { title: string; date: string | null; withPeople: Set<number> }
    >();
    for (const e of connEdges) {
      const docs: DocumentData[] = allDocs[String(e.id)] || [];
      const otherId = e.source === nodeId ? e.target : e.source;
      for (const doc of docs) {
        const key =
          doc.documentId != null ? String(doc.documentId) : doc.title;
        if (!docMap.has(key)) {
          docMap.set(key, {
            title: doc.title || "(no title)",
            date: doc.date,
            withPeople: new Set(),
          });
        }
        docMap.get(key)!.withPeople.add(otherId);
      }
    }

    function isValidDate(d: string | null): boolean {
      return !!d && !d.startsWith("0-") && d !== "0-00-00";
    }

    const uniqueDocs = Array.from(docMap.values()).sort((a, b) => {
      const aValid = isValidDate(a.date);
      const bValid = isValidDate(b.date);
      if (!aValid && !bValid) return 0;
      if (!aValid) return 1;
      if (!bValid) return -1;
      return a.date!.localeCompare(b.date!);
    });

    if (uniqueDocs.length === 0) {
      docsEl.innerHTML = '<div class="detail-empty">None</div>';
    } else {
      docsEl.innerHTML = uniqueDocs
        .map((d) => {
          const withNames = [...d.withPeople]
            .map((id) => { const n = state.nodeById.get(id); return n ? formatName(n.name) : ""; })
            .filter(Boolean);
          const parts: string[] = [];
          if (isValidDate(d.date)) parts.push(esc(d.date!));
          if (withNames.length)
            parts.push(`with ${esc(withNames.join(", "))}`);
          return `<div class="doc-item"><div class="doc-title">${esc(d.title)}</div>${parts.length ? `<div class="doc-meta">${parts.join(" · ")}</div>` : ""}</div>`;
        })
        .join("");
    }
  }

  closeBtn.addEventListener("click", requestClose);
  backBtn.addEventListener("click", () => {
    if (history.length > 0) {
      const prev = history.pop()!;
      flyToNode(state, String(prev));
      show(prev, true);
    }
  });

  let justClickedNode = false;

  state.renderer.on("clickNode", ({ node }) => {
    justClickedNode = true;
    const id = Number(node);
    show(id);
    setTimeout(() => { justClickedNode = false; }, 50);
  });

  state.renderer.on("clickStage", () => {
    if (justClickedNode) return;
    if (panel.classList.contains("open")) {
      close();
    }
  });

  return { show, close };
}
