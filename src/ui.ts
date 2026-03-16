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
  if (comma === -1) return esc(name);
  const last = esc(name.slice(0, comma).trim());
  const first = esc(name.slice(comma + 1).trim());
  return `${first} <span class="tooltip-last">${last}</span>`;
}

// ─── Stats ───

export function initStats(nodeCount: number, edgeCount: number) {
  const el = document.getElementById("stats-content")!;
  el.innerHTML = `
    <span class="stat-pill">${nodeCount.toLocaleString()} people</span>
    <span class="stat-pill">${(21394).toLocaleString()} documents</span>
    <span class="stat-pill">${edgeCount.toLocaleString()} connections</span>
  `;
}

// ─── Tooltip ───

export function initTooltip(state: GraphState) {
  const tooltip = document.getElementById("tooltip")!;

  state.renderer.on("enterNode", ({ node }) => {
    const attrs = state.graph.getNodeAttributes(node);
    const nodeData = state.nodeById.get(Number(node));
    const isMedici = nodeData?.isMedici ?? false;
    tooltip.innerHTML = formatNameTooltipHTML(attrs.label || `Node ${node}`);
    tooltip.classList.toggle("medici", isMedici);
    tooltip.style.display = "block";
  });

  state.renderer.on("leaveNode", () => {
    tooltip.style.display = "none";
  });

  state.renderer.getMouseCaptor().on("mousemovebody", (e: any) => {
    if (tooltip.style.display === "none") return;
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
      input.value = formatName(node.name);
      dropdown.style.display = "none";
      flyToNode(state, String(id));
      onSelect(id);
    }
  });
}

// ─── Detail Panel ───

export function initDetailPanel(state: GraphState) {
  const panel = document.getElementById("detail-panel")!;
  const titleEl = document.getElementById("detail-title")!;
  const metaEl = document.getElementById("detail-meta")!;
  const connectionsEl = document.getElementById("detail-connections")!;
  const docsEl = document.getElementById("detail-docs")!;
  const backBtn = document.getElementById("detail-back")!;
  const closeBtn = document.getElementById("detail-close")!;

  const history: number[] = [];
  let currentId: number | null = null;

  function close() {
    panel.classList.remove("open");
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
    backBtn.style.display = history.length > 0 ? "block" : "none";

    setHighlight(state, String(nodeId));

    titleEl.textContent = formatName(node.name);

    const metaParts: string[] = [];
    if (node.bornYear || node.deathYear) {
      const b = node.bornYear ?? "?";
      const d = node.deathYear ?? "?";
      metaParts.push(`${b} – ${d}`);
    }
    if (node.isMedici) metaParts.push("Medici family");
    metaEl.innerHTML = metaParts.join(" · ");

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
    panel.classList.add("open");
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

  closeBtn.addEventListener("click", close);
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
