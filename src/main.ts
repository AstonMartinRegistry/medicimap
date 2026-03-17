import "./style.css";
import { fetchGraphData, fetchDocuments } from "./data";
import { buildGraph } from "./graph";
import { initStats, initTooltip, initSearch, initDetailPanel } from "./ui";

async function main() {
  const loadingEl = document.getElementById("loading")!;
  const statusEl = loadingEl.querySelector(".loading-status")!;
  const barFill = loadingEl.querySelector(".loading-bar-fill") as HTMLElement;

  function setProgress(msg: string, pct: number) {
    statusEl.textContent = msg;
    barFill.style.width = pct + "%";
  }

  setProgress("Fetching graph data…", 15);

  const { nodes, edges } = await fetchGraphData((stage, pct) => {
    setProgress(stage, pct);
  });

  setProgress("Loading documents…", 50);
  const allDocs = await fetchDocuments();

  const mediciIds = new Set(nodes.filter((n) => n.isMedici).map((n) => n.id));
  const mediciPeopleCount = mediciIds.size;
  const mediciEdgeCount = edges.filter(
    (e) => mediciIds.has(e.source) || mediciIds.has(e.target)
  ).length;

  const allDocIds = new Set<number>();
  const mediciDocIds = new Set<number>();
  for (const e of edges) {
    const docs = allDocs[String(e.id)] || [];
    const edgeHasMedici = mediciIds.has(e.source) || mediciIds.has(e.target);
    for (const d of docs) {
      if (d.documentId != null) allDocIds.add(d.documentId);
      if (edgeHasMedici && d.documentId != null) mediciDocIds.add(d.documentId);
    }
  }

  setProgress("Building graph…", 60);
  await new Promise((r) => requestAnimationFrame(r));

  const container = document.getElementById("graph-container")!;
  const state = buildGraph(container, nodes, edges);

  setProgress("Initializing…", 90);
  await new Promise((r) => requestAnimationFrame(r));

  initStats({
    nodeCount: nodes.length,
    mediciPeopleCount,
    documentCount: allDocIds.size,
    mediciDocumentCount: mediciDocIds.size,
    edgeCount: edges.length,
    mediciEdgeCount,
  });
  initTooltip(state);
  const { show } = initDetailPanel(state);
  initSearch(state, (nodeId) => show(nodeId));

  setProgress("Ready", 100);

  await new Promise((r) => setTimeout(r, 300));
  loadingEl.classList.add("fade-out");
  setTimeout(() => loadingEl.remove(), 500);
}

main().catch((err) => {
  console.error("Failed to initialize:", err);
  const statusEl = document.querySelector(".loading-status");
  if (statusEl) {
    statusEl.textContent = "Failed to load. Check console for details.";
  }
});
