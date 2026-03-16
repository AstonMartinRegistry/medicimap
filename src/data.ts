import type { NodeData, EdgeData, DocumentData } from "./types";

let nodesCache: NodeData[] | null = null;
let edgesCache: EdgeData[] | null = null;
let documentsCache: Record<string, DocumentData[]> | null = null;

export async function fetchNodes(): Promise<NodeData[]> {
  if (nodesCache) return nodesCache;
  const res = await fetch("/data/nodes.json");
  nodesCache = await res.json();
  return nodesCache!;
}

export async function fetchEdges(): Promise<EdgeData[]> {
  if (edgesCache) return edgesCache;
  const res = await fetch("/data/edges.json");
  edgesCache = await res.json();
  return edgesCache!;
}

export async function fetchDocuments(): Promise<Record<string, DocumentData[]>> {
  if (documentsCache) return documentsCache;
  const res = await fetch("/data/documents.json");
  documentsCache = await res.json();
  return documentsCache!;
}

export async function fetchGraphData(
  onProgress?: (stage: string, pct: number) => void
): Promise<{ nodes: NodeData[]; edges: EdgeData[] }> {
  onProgress?.("Loading nodes…", 10);
  const nodesPromise = fetchNodes();

  onProgress?.("Loading edges…", 30);
  const edgesPromise = fetchEdges();

  const [nodes, edges] = await Promise.all([nodesPromise, edgesPromise]);

  onProgress?.("Ready", 100);
  return { nodes, edges };
}
