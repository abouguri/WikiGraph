from __future__ import annotations

from urllib.parse import quote

import requests

from .models import WikipediaPage

WIKIPEDIA_API = "https://en.wikipedia.org/w/api.php"


class WikipediaFetcher:
    def __init__(self, session: requests.Session | None = None) -> None:
        self.session = session or requests.Session()

    def fetch_page(self, title: str) -> WikipediaPage:
        response = self.session.get(
            WIKIPEDIA_API,
            params={
                "action": "query",
                "format": "json",
                "prop": "extracts|links",
                "explaintext": 1,
                "exintro": 1,
                "titles": title,
                "pllimit": 20,
            },
            timeout=20,
        )
        response.raise_for_status()
        payload = response.json()["query"]["pages"]
        page_data = next(iter(payload.values()))
        links = [item["title"] for item in page_data.get("links", [])]
        canonical_title = page_data.get("title", title)
        page_url = f"https://en.wikipedia.org/wiki/{quote(canonical_title.replace(' ', '_'))}"
        return WikipediaPage(
            title=canonical_title,
            url=page_url,
            summary=page_data.get("extract", ""),
            text=page_data.get("extract", ""),
            links=links,
        )
