"""Conservative sentence rules; unsupported or ambiguous syntax is left unclaimed."""

from __future__ import annotations

import re

from .models import Entity, Relationship, WikipediaPage

CAPITALIZED_PHRASE = re.compile(r"\b([A-Z][\w]+(?:\s+[A-Z][\w]+)+)\b")
PREDICATES = {"designed": "designedBy", "developed": "developedBy", "influenced": "influencedBy"}
SENTENCES = re.compile(r"[^.!?]+[.!?]?(?:\s|$)")


def extract_entities(page: WikipediaPage) -> list[Entity]:
    labels = {page.title, *page.links}
    labels.update(match.group(1) for match in CAPITALIZED_PHRASE.finditer(page.text))
    return [Entity(label=label) for label in sorted(labels)]


def extract_relationships(page: WikipediaPage) -> list[Relationship]:
    relationships = [
        Relationship(page.title, "linksTo", link, "revision-link", link)
        for link in sorted(set(page.links))
    ]
    names = {page.title, *page.aliases, re.sub(r" \(.*\)$", "", page.title)}
    subjects = "|".join(re.escape(name) for name in sorted(names, key=len, reverse=True))
    pattern = re.compile(
        rf"(?:{subjects}) (?:was|is) (?:originally )?(designed|developed|influenced) by (.+)$"
    )
    for match in SENTENCES.finditer(page.text):
        evidence = match.group().strip()
        found = pattern.fullmatch(evidence)
        if not found:
            continue
        verb, remainder = found.groups()
        targets = []
        for link in page.links:
            if not remainder.startswith(link):
                continue
            suffix = remainder[len(link) :].strip()
            # Only explicit direct objects, optionally followed by place/year context.
            if re.fullmatch(r"[.!]?", suffix) or re.fullmatch(
                r"(?:at [A-Z][^.!?]+|in [12][0-9]{3}(?: [^.!?]+)?)[.!]?", suffix
            ):
                targets.append(link)
        if len(targets) != 1 or targets[0] == page.title:
            continue
        target = targets[0]
        start = match.start() + len(match.group()) - len(match.group().lstrip())
        relationships.append(
            Relationship(
                page.title,
                PREDICATES[verb],
                target,
                "sentence-pattern",
                evidence,
                start,
                start + len(evidence),
            )
        )
    return relationships
