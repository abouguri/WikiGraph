from __future__ import annotations

import re

from .models import Entity, Relationship, WikipediaPage

CAPITALIZED_PHRASE = re.compile(r"\b([A-Z][\w]+(?:\s+[A-Z][\w]+)+)\b")


def extract_entities(page: WikipediaPage) -> list[Entity]:
    labels = {page.title, *page.links}
    labels.update(match.group(1) for match in CAPITALIZED_PHRASE.finditer(page.text))
    return [Entity(label=label) for label in sorted(labels)]


def extract_relationships(page: WikipediaPage) -> list[Relationship]:
    relationships: list[Relationship] = []
    for link in page.links:
        relationships.append(Relationship(subject=page.title, predicate="mentions", object=link))
    return relationships
