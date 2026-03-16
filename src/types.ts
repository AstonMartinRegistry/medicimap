export interface NodeData {
  id: number;
  x: number;
  y: number;
  name: string;
  firstName: string;
  lastName: string;
  gender: string;
  bornYear: number | null;
  deathYear: number | null;
  pagerank: number;
  importance: number;
  isMedici: boolean;
}

export interface EdgeData {
  id: number;
  source: number;
  target: number;
  weight: number;
  correspondenceCount: number;
  mentionedCount: number;
  title: string;
  date: string | null;
  place: string | null;
}

export interface DocumentData {
  documentId: number;
  title: string;
  date: string | null;
}
