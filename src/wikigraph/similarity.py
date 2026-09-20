"""Deterministic structural similarity; proximity is not a factual assertion."""

from __future__ import annotations

import math
from collections import Counter, defaultdict
from typing import Any

OUT_WEIGHT = 0.5
IN_WEIGHT = 0.5
PAGE_BONUS = 0.15
FACT_BONUS = 0.35
SCORE_FLOOR = 0.02
CANDIDATE_CAP = 3000
HUB_FRACTION = 0.25
PARTNERS = 3
LINK_THRESHOLD = 0.15
CLUSTER_PASSES = 20


class SimilarityIndex:
    def __init__(self, entities: dict[str, dict[str, Any]], edges: list[dict[str, Any]]) -> None:
        self.entities = entities
        self.edges = sorted(edges, key=lambda e: e["id"])
        self.out: dict[str, set[str]] = {id: set() for id in entities}
        self.inc: dict[str, set[str]] = {id: set() for id in entities}
        self.adj: dict[str, set[str]] = {id: set() for id in entities}
        self.facts: set[tuple[str, str]] = set()
        self.pairs: dict[tuple[str, str], list[dict[str, Any]]] = defaultdict(list)
        for e in self.edges:
            a, b = e["subject"], e["object"]
            if a not in entities or b not in entities:
                continue
            self.adj[a].add(b)
            self.adj[b].add(a)
            pair = (min(a, b), max(a, b))
            self.pairs[pair].append(e)
            if e["predicate"] == "linksTo":
                self.out[a].add(b)
                self.inc[b].add(a)
            else:
                self.facts.add(pair)
        self.weights = {
            id: 1 / math.log(2 + len(self.out[id]) + len(self.inc[id])) for id in entities
        }
        self.out_norm = {id: self.mass(ns) for id, ns in self.out.items()}
        self.in_norm = {id: self.mass(ns) for id, ns in self.inc.items()}
        self.cache: dict[tuple[str, str], float] = {}

    def mass(self, ids: set[str]) -> float:
        return math.fsum(self.weights[id] for id in sorted(ids))

    def score(self, a: str, b: str) -> float:
        if a == b:
            return 1.0
        pair = (min(a, b), max(a, b))
        if pair in self.cache:
            return self.cache[pair]
        out_den = math.sqrt(self.out_norm[a] * self.out_norm[b])
        in_den = math.sqrt(self.in_norm[a] * self.in_norm[b])
        out = self.mass(self.out[a] & self.out[b]) / out_den if out_den else 0.0
        inc = self.mass(self.inc[a] & self.inc[b]) / in_den if in_den else 0.0
        direct = b in self.out[a] or a in self.out[b]
        result = min(
            1.0,
            OUT_WEIGHT * out
            + IN_WEIGHT * inc
            + PAGE_BONUS * direct
            + FACT_BONUS * (pair in self.facts),
        )
        self.cache[pair] = result
        return result

    def node(self, id: str) -> dict[str, Any]:
        return {
            **self.entities[id],
            "type": self.entities[id].get("type", "Other"),
            "year": self.entities[id].get("year"),
            "in_links": len(self.inc[id]),
            "out_links": len(self.out[id]),
        }

    def top(self, limit: int = 6) -> list[dict[str, Any]]:
        return [
            self.node(id)
            for id in sorted(self.entities, key=lambda id: (-len(self.inc[id]), id))[:limit]
        ]

    def clusters(self, ids: list[str]) -> dict[str, int]:
        ordered = sorted(ids)
        labels = {id: id for id in ordered}
        neighbors = {
            a: [
                (b, self.score(a, b))
                for b in ordered
                if a != b and self.score(a, b) >= LINK_THRESHOLD
            ]
            for a in ordered
        }
        for _ in range(CLUSTER_PASSES):
            changed = False
            for a in ordered:
                totals: dict[str, float] = defaultdict(float)
                for b, weight in neighbors[a]:
                    totals[labels[b]] += weight
                if not totals:
                    continue
                # Keep the current label on a tie to avoid oscillation.
                best = min(totals, key=lambda label: (-totals[label], label != labels[a], label))
                if best != labels[a]:
                    labels[a] = best
                    changed = True
            if not changed:
                break
        sizes = Counter(labels.values())
        numbers = {label: i for i, label in enumerate(sorted(sizes, key=lambda x: (-sizes[x], x)))}
        return {id: numbers[labels[id]] for id in ordered}

    def map(self, origins: list[str], limit: int = 40) -> dict[str, Any]:
        origins = list(dict.fromkeys(origins))
        candidates = set(origins)
        for origin in origins:
            candidates.update(self.adj[origin])
            for neighbor in self.adj[origin]:
                candidates.update(self.adj[neighbor])
        candidates.difference_update(origins)
        candidates = set(
            sorted(
                candidates,
                key=lambda id: (-sum(len(self.adj[id] & self.adj[o]) for o in origins), id),
            )[:CANDIDATE_CAP]
        )

        def rank(id: str) -> float:
            values = [self.score(id, o) for o in origins]
            if not any(values):
                return 0.0
            return (
                values[0]
                if len(values) == 1
                else math.exp(
                    math.fsum(math.log(max(SCORE_FLOOR, v)) for v in values) / len(values)
                )
            )

        scores = {id: rank(id) for id in candidates | set(origins)}
        chosen = sorted(
            (id for id in candidates if scores[id] > 0), key=lambda id: (-scores[id], id)
        )[: max(5, min(80, limit))]
        ids = list(origins) + chosen
        present = set(ids)
        clusters = self.clusters(ids)
        nodes = [
            {
                **self.node(id),
                "similarity": scores[id],
                "similarity_by_origin": {o: self.score(id, o) for o in origins},
                "cluster": clusters[id],
                "is_origin": id in origins,
            }
            for id in ids
        ]
        edges = [
            {
                **e,
                "assertion_id": e["id"],
                "kind": "reference" if e["predicate"] == "linksTo" else "fact",
            }
            for e in self.edges
            if e["subject"] in present and e["object"] in present
        ]
        drawn = {tuple(sorted((e["subject"], e["object"]))) for e in edges}
        springs: dict[tuple[str, str], dict[str, Any]] = {}
        for a in ids:
            partners = sorted(
                (
                    b
                    for b in ids
                    if b != a
                    and (min(a, b), max(a, b)) not in drawn
                    and self.score(a, b) >= LINK_THRESHOLD
                ),
                key=lambda b: (-self.score(a, b), b),
            )[:PARTNERS]
            for b in partners:
                pair = (min(a, b), max(a, b))
                springs[pair] = {"source": pair[0], "target": pair[1], "weight": self.score(a, b)}
        lists: dict[str, list[dict[str, Any]]] = {}
        for name, neighbors, degree in [
            ("foundations", self.inc, self.inc),
            ("builds_on_this", self.out, self.out),
        ]:
            counts = {id: len(neighbors[id] & present) for id in self.entities}
            qualifying = [
                id
                for id in self.entities
                if counts[id] >= 3 and len(degree[id]) <= len(self.entities) * HUB_FRACTION
            ]
            qualifying.sort(key=lambda id: (-counts[id], -(self.entities[id].get("year") or 0), id))
            lists[name] = [
                {**self.node(id), "linked_by": counts[id], "in_map": id in present}
                for id in qualifying
            ]
        return {
            "origins": origins,
            "nodes": nodes,
            "edges": edges,
            "layout_links": [springs[p] for p in sorted(springs)],
            "lists": lists,
            "stats": {"candidates": len(candidates), "returned": len(nodes)},
        }

    def explain(self, a: str, b: str) -> dict[str, Any]:
        shared = (self.out[a] & self.out[b]) | (self.inc[a] & self.inc[b])
        direct = self.pairs.get((min(a, b), max(a, b)), [])
        return {
            "a": a,
            "b": b,
            "score": self.score(a, b),
            "shared": [
                {
                    "id": id,
                    "label": self.entities[id]["label"],
                    "weight": self.weights[id],
                    "directions": [
                        name
                        for name, index in [("out", self.out), ("in", self.inc)]
                        if id in index[a] & index[b]
                    ],
                }
                for id in sorted(shared, key=lambda id: (-self.weights[id], id))[:8]
            ],
            "direct": {
                "page_links": [e for e in direct if e["predicate"] == "linksTo"],
                "facts": [e for e in direct if e["predicate"] != "linksTo"],
            },
        }
