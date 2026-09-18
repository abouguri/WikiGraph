"""Revision-pinned fetching with bounded requests and durable offline snapshots."""

from __future__ import annotations

import hashlib
import json
import time
from collections.abc import Callable
from dataclasses import asdict
from datetime import UTC, datetime
from pathlib import Path
from typing import Any
from urllib.parse import quote

import requests
from bs4 import BeautifulSoup

from .models import WikipediaPage

WIKIPEDIA_API = "https://en.wikipedia.org/w/api.php"
USER_AGENT = "WikiGraph/0.2 (https://github.com/abouguri/WikiGraph)"


class FetchError(RuntimeError):
    """A page could not be fetched or validated."""


def atomic_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n")
    temporary.replace(path)


class WikipediaFetcher:
    def __init__(
        self,
        session: requests.Session | None = None,
        *,
        cache_dir: Path | None = None,
        offline: bool = False,
        intro_only: bool = True,
        max_requests: int = 1000,
        retries: int = 3,
        sleep: Callable[[float], None] = time.sleep,
    ) -> None:
        if max_requests < 1 or not 0 <= retries <= 10:
            raise ValueError("Positive request budget and 0–10 retries required")
        self.session = session or requests.Session()
        self.session.headers.update({"User-Agent": USER_AGENT})
        self.cache_dir = cache_dir
        self.offline = offline
        self.intro_only = intro_only
        self.max_requests = max_requests
        self.retries = retries
        self.sleep = sleep
        self.requests_used = 0

    def _request(self, params: dict[str, Any]) -> dict[str, Any]:
        for attempt in range(self.retries + 1):
            if self.requests_used >= self.max_requests:
                raise FetchError("Request budget exhausted")
            self.requests_used += 1
            delay = min(2**attempt, 30)
            try:
                response = self.session.get(
                    WIKIPEDIA_API,
                    params={"format": "json", "formatversion": 2, "maxlag": 5, **params},
                    timeout=(5, 30),
                )
                if response.status_code == 429 or response.status_code >= 500:
                    try:
                        delay = min(max(float(response.headers.get("Retry-After", delay)), 0), 60)
                    except ValueError:
                        pass
                    raise requests.ConnectionError(f"HTTP {response.status_code}")
                response.raise_for_status()
                data = response.json()
                if not isinstance(data, dict):
                    raise FetchError("API response must be an object")
                if "error" in data:
                    error = data["error"]
                    if not isinstance(error, dict):
                        raise FetchError("Malformed API error payload")
                    if error.get("code") in {"maxlag", "ratelimited", "readonly"}:
                        raise requests.ConnectionError(str(error))
                    raise FetchError(f"API error: {error}")
                return data
            except (requests.Timeout, requests.ConnectionError) as exc:
                if attempt == self.retries:
                    raise FetchError(f"Retries exhausted: {exc}") from exc
                self.sleep(delay)
            except (requests.RequestException, ValueError) as exc:
                raise FetchError(f"Invalid API response: {exc}") from exc
        raise FetchError("Request failed")

    def cache_path(self, title: str) -> Path | None:
        key = hashlib.sha256(f"{title.strip()}|{self.intro_only}".encode()).hexdigest()
        return self.cache_dir / f"{key}.json" if self.cache_dir else None

    def fetch_page(self, title: str) -> WikipediaPage:
        title = title.strip()
        if not title:
            raise FetchError("Page title is empty")
        cached = self.cache_path(title)
        if cached and cached.exists():
            try:
                record = json.loads(cached.read_text())
                if record["schema_version"] != 1:
                    raise ValueError("unsupported snapshot version")
                page = WikipediaPage(**record["page"])
                self._validate(page)
                return page
            except (KeyError, TypeError, ValueError) as exc:
                raise FetchError(f"Invalid snapshot {cached}: {exc}") from exc
        if self.offline:
            raise FetchError(f"No offline snapshot for {title}")
        metadata = self._request(
            {
                "action": "query",
                "titles": title,
                "redirects": 1,
                "prop": "revisions|pageprops",
                "rvprop": "ids",
                "rvlimit": 1,
            }
        )
        try:
            info = metadata["query"]["pages"][0]
            if "missing" in info or "invalid" in info:
                raise FetchError(f"Page does not exist: {title}")
            revision = info["revisions"][0]["revid"]
            params: dict[str, Any] = {
                "action": "parse",
                "oldid": revision,
                "prop": "text|links|revid|properties",
                "disableeditsection": 1,
            }
            if self.intro_only:
                params["section"] = "0"
            parsed = self._request(params)
            content = parsed["parse"]
            if content["revid"] != revision or content["pageid"] != info["pageid"]:
                raise FetchError("Revision identity changed during fetch")
            soup = BeautifulSoup(content["text"], "html.parser")
            for node in soup.select("script, style, sup.reference, .mw-editsection"):
                node.decompose()
            text = " ".join(soup.get_text(" ", strip=True).split())
            canonical = info["title"]
            page = WikipediaPage(
                title=canonical,
                url=f"https://en.wikipedia.org/wiki/{quote(canonical.replace(' ', '_'), safe='')}",
                summary=text if self.intro_only else text[:500],
                text=text,
                links=sorted(
                    {link["title"] for link in content.get("links", []) if link.get("ns") == 0}
                ),
                page_id=info["pageid"],
                revision_id=revision,
                retrieved_at=datetime.now(UTC).isoformat(),
                aliases=[title] if title != canonical else [],
                disambiguation="disambiguation" in info.get("pageprops", {}),
            )
            self._validate(page)
        except (KeyError, IndexError, TypeError, ValueError) as exc:
            raise FetchError(f"Malformed page response for {title}: {exc}") from exc
        if cached:
            atomic_json(
                cached, {"schema_version": 1, "page": asdict(page), "raw": [metadata, parsed]}
            )
        return page

    @staticmethod
    def _validate(page: WikipediaPage) -> None:
        if not isinstance(page.page_id, int) or page.page_id <= 0:
            raise ValueError("Missing canonical page ID")
        if not isinstance(page.revision_id, int) or page.revision_id <= 0:
            raise ValueError("Missing revision ID")
        if not isinstance(page.text, str) or not isinstance(page.title, str) or not page.title:
            raise ValueError("Invalid page text or title")
        if not isinstance(page.links, list) or any(
            not isinstance(link, str) for link in page.links
        ):
            raise ValueError("Invalid links")
