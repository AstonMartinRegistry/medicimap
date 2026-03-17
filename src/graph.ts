import Graph from "graphology";
import Sigma from "sigma";
import type { NodeData, EdgeData } from "./types";

const COLOR_MEDICI =
  getComputedStyle(document.documentElement).getPropertyValue("--medici-red").trim() || "#6b1818";
const COLOR_DEFAULT = "#5a5f6a";

/** Hover: circle only, no label (we use our own tooltip) */
function drawNodeHoverNoLabel(
  context: CanvasRenderingContext2D,
  data: { x: number; y: number; size: number },
  _settings: unknown
) {
  const PADDING = 2;
  context.fillStyle = "rgba(255, 255, 255, 0.15)";
  context.shadowOffsetX = 0;
  context.shadowOffsetY = 0;
  context.shadowBlur = 12;
  context.shadowColor = "rgba(150, 180, 255, 0.4)";
  context.beginPath();
  context.arc(data.x, data.y, data.size + PADDING, 0, Math.PI * 2);
  context.closePath();
  context.fill();
  context.shadowBlur = 0;
}

export interface GraphState {
  graph: Graph;
  renderer: Sigma;
  nodeById: Map<number, NodeData>;
  edgesByNode: Map<number, EdgeData[]>;
}

export function buildGraph(
  container: HTMLElement,
  nodes: NodeData[],
  edges: EdgeData[]
): GraphState {
  const graph = new Graph();
  const nodeById = new Map<number, NodeData>();
  const edgesByNode = new Map<number, EdgeData[]>();

  for (const n of nodes) {
    nodeById.set(n.id, n);

    graph.addNode(String(n.id), {
      x: n.x,
      y: n.y,
      size: 50,
      label: n.name,
      color: n.isMedici ? COLOR_MEDICI : COLOR_DEFAULT,
    });
  }

  const maxWeight = Math.max(...edges.map((e) => e.weight), 1);
  const logMaxW = Math.log(1 + maxWeight);
  const BG = 25;

  for (const e of edges) {
    const sKey = String(e.source);
    const tKey = String(e.target);
    if (!graph.hasNode(sKey) || !graph.hasNode(tKey)) continue;

    const srcMedici = nodeById.get(e.source)?.isMedici ?? false;
    const tgtMedici = nodeById.get(e.target)?.isMedici ?? false;
    const isMediciEdge = srcMedici || tgtMedici;

    const lw = Math.log(1 + e.weight) / logMaxW;
    const t = 0.25 + 0.55 * lw;

    let r: number, g: number, b: number;
    if (isMediciEdge) {
      r = Math.round(BG + (240 - BG) * t);
      g = Math.round(BG + (60 - BG) * t);
      b = Math.round(BG + (60 - BG) * t);
    } else {
      r = Math.round(BG + (255 - BG) * t);
      g = Math.round(BG + (255 - BG) * t);
      b = Math.round(BG + (255 - BG) * t);
    }

    const color = `rgb(${r}, ${g}, ${b})`;

    const edgeSize = 1 + lw * 74;

    graph.addEdge(sKey, tKey, {
      size: edgeSize,
      color,
      weight: e.weight,
      edgeId: e.id,
    });

    if (!edgesByNode.has(e.source)) edgesByNode.set(e.source, []);
    edgesByNode.get(e.source)!.push(e);
    if (!edgesByNode.has(e.target)) edgesByNode.set(e.target, []);
    edgesByNode.get(e.target)!.push(e);
  }

  const renderer = new Sigma(graph, container, {
    renderLabels: false,
    labelFont: "system-ui, -apple-system, sans-serif",
    labelWeight: "400",
    labelColor: { color: "#e0e0e0" },
    labelSize: 12,
    defaultEdgeType: "line",
    allowInvalidContainer: true,
    enableEdgeEvents: false,
    zIndex: true,
    defaultDrawNodeHover: drawNodeHoverNoLabel,
    itemSizesReference: "positions",
    minEdgeThickness: 0.55,
    maxCameraRatio: 0.5,
  });

  const camera = renderer.getCamera();
  camera.setState({ ratio: 0.18 });

  return { graph, renderer, nodeById, edgesByNode };
}

let highlightedNode: string | null = null;
let highlightedNeighbors: Set<string> | null = null;

const DIM_NODE_COLOR = "#383838";
const DIM_EDGE_COLOR = "rgb(40, 40, 40)";

const isMobile = () => window.matchMedia("(max-width: 768px)").matches;
const MOBILE_EDGE_SCALE = 0.3;

function getEdgeReducer(state: GraphState) {
  return (edge: string, data: Record<string, unknown>) => {
    let size = (data.size as number) ?? 0;
    if (isMobile()) size *= MOBILE_EDGE_SCALE;

    if (!highlightedNode) return { ...data, size };

    const src = state.graph.source(edge);
    const tgt = state.graph.target(edge);
    if (src === highlightedNode || tgt === highlightedNode) {
      return { ...data, size: Math.max(size, isMobile() ? 10 : 30), zIndex: 1 };
    }
    return { ...data, size, color: DIM_EDGE_COLOR, zIndex: 0 };
  };
}

export function setHighlight(state: GraphState, nodeKey: string | null) {
  highlightedNode = nodeKey;

  if (nodeKey && state.graph.hasNode(nodeKey)) {
    highlightedNeighbors = new Set(state.graph.neighbors(nodeKey));
    highlightedNeighbors.add(nodeKey);
  } else {
    highlightedNeighbors = null;
  }

  state.renderer.setSetting("nodeReducer", (node, data) => {
    if (!highlightedNeighbors) return data;
    if (highlightedNeighbors.has(node)) {
      return { ...data, zIndex: 1 };
    }
    return { ...data, color: DIM_NODE_COLOR, zIndex: 0 };
  });

  state.renderer.setSetting("edgeReducer", getEdgeReducer(state));

  state.renderer.refresh();
}

export function clearHighlight(state: GraphState) {
  highlightedNode = null;
  highlightedNeighbors = null;
  state.renderer.setSetting("nodeReducer", null);
  state.renderer.setSetting(
    "edgeReducer",
    isMobile()
      ? (edge: string, data: Record<string, unknown>) => ({
          ...data,
          size: ((data.size as number) ?? 0) * MOBILE_EDGE_SCALE,
        })
      : null
  );
  state.renderer.refresh();
}

export function flyToNode(state: GraphState, nodeKey: string) {
  const nodeDisplayData = state.renderer.getNodeDisplayData(nodeKey);
  if (!nodeDisplayData) return;
  const camera = state.renderer.getCamera();
  camera.animate(
    { x: nodeDisplayData.x, y: nodeDisplayData.y, ratio: 0.08 },
    { duration: 1000, easing: "cubicInOut" }
  );
}
