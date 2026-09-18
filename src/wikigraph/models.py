from __future__ import annotations

from dataclasses import dataclass, field


@dataclass(slots=True)
class WikipediaPage:
    title: str
    url: str
    summary: str
    text: str
    links: list[str] = field(default_factory=list)
    page_id: int = 0
    revision_id: int = 0
    retrieved_at: str = ""
    aliases: list[str] = field(default_factory=list)
    disambiguation: bool = False
    source_kind: str = "wikipedia"


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
    evidence: str = ""
    start: int = -1
    end: int = -1
