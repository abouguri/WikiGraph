from __future__ import annotations

from dataclasses import dataclass, field


@dataclass(slots=True)
class WikipediaPage:
    title: str
    url: str
    summary: str
    text: str
    links: list[str] = field(default_factory=list)


@dataclass(slots=True, frozen=True)
class Entity:
    label: str
    source: str = "wikipedia"


@dataclass(slots=True, frozen=True)
class Relationship:
    subject: str
    predicate: str
    object: str
    source: str = "heuristic"
