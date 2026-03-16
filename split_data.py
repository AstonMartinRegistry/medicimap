#!/usr/bin/env python3
"""Split dream.json into separate static JSON files for the frontend."""

import json
import os

SRC = "dream.json"
OUT_DIR = "public/data"

def main():
    print(f"Reading {SRC}...")
    with open(SRC, "r") as f:
        data = json.load(f)

    nodes = data["nodes"]
    edges = data["edges"]
    print(f"  {len(nodes)} nodes, {len(edges)} edges")

    os.makedirs(OUT_DIR, exist_ok=True)

    # 1. nodes.json — full node data
    print("Writing nodes.json...")
    with open(os.path.join(OUT_DIR, "nodes.json"), "w") as f:
        json.dump(nodes, f, separators=(",", ":"))
    print(f"  {os.path.getsize(os.path.join(OUT_DIR, 'nodes.json')) / 1e6:.1f} MB")

    # 2. edges.json — edges WITHOUT the documents array (keeps it small)
    print("Writing edges.json...")
    edges_light = []
    for i, e in enumerate(edges):
        edges_light.append({
            "id": i,
            "source": e["source"],
            "target": e["target"],
            "weight": e.get("weight", 1),
            "correspondenceCount": e.get("correspondenceCount", 0),
            "mentionedCount": e.get("mentionedCount", 0),
            "title": e.get("title", ""),
            "date": e.get("date"),
            "place": e.get("place"),
        })
    with open(os.path.join(OUT_DIR, "edges.json"), "w") as f:
        json.dump(edges_light, f, separators=(",", ":"))
    print(f"  {os.path.getsize(os.path.join(OUT_DIR, 'edges.json')) / 1e6:.1f} MB")

    # 3. documents.json — mapping from edge id -> documents array
    #    Only include edges that actually have documents
    print("Writing documents.json...")
    docs_map = {}
    for i, e in enumerate(edges):
        docs = e.get("documents", [])
        if docs:
            docs_map[str(i)] = docs
    with open(os.path.join(OUT_DIR, "documents.json"), "w") as f:
        json.dump(docs_map, f, separators=(",", ":"))
    print(f"  {os.path.getsize(os.path.join(OUT_DIR, 'documents.json')) / 1e6:.1f} MB")

    print("Done!")

if __name__ == "__main__":
    main()
