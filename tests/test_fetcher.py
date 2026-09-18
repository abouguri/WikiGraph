import json
from pathlib import Path
from unittest.mock import Mock

import pytest
import requests

from wikigraph.fetcher import FetchError, WikipediaFetcher

FIXTURES = json.loads((Path(__file__).parent / "fixtures/api.json").read_text())


def session_for(*items):
    session = Mock()
    responses = []
    for item in items:
        if isinstance(item, Exception):
            responses.append(item)
        else:
            response = Mock(status_code=200, headers={})
            response.json.return_value = item
            responses.append(response)
    session.get.side_effect = responses
    return session


def test_redirect_revision_and_offline(tmp_path):
    session = session_for(FIXTURES["redirect"], FIXTURES["parsed"])
    fetcher = WikipediaFetcher(session, cache_dir=tmp_path)
    page = fetcher.fetch_page("Python language")
    assert page.aliases == ["Python language"]
    assert page.page_id == 23862 and page.revision_id == 123
    assert session.get.call_args_list[1].kwargs["params"]["oldid"] == 123
    assert page.links == ["Guido van Rossum", "Programming language"]
    offline = WikipediaFetcher(session_for(), cache_dir=tmp_path, offline=True)
    assert offline.fetch_page("Python language") == page
    assert offline.requests_used == 0


@pytest.mark.parametrize("fixture", ["missing", "error", "malformed"])
def test_explicit_errors(fixture):
    with pytest.raises(FetchError):
        WikipediaFetcher(session_for(FIXTURES[fixture])).fetch_page("Absent")


def test_retries_and_budget():
    sleep = Mock()
    fetcher = WikipediaFetcher(
        session_for(
            requests.Timeout(), FIXTURES["rate_limit"], FIXTURES["normal"], FIXTURES["parsed"]
        ),
        sleep=sleep,
    )
    assert fetcher.fetch_page("Python").revision_id == 123
    assert sleep.call_count == 2
    with pytest.raises(FetchError, match="budget"):
        WikipediaFetcher(session_for(requests.Timeout()), max_requests=1, sleep=Mock()).fetch_page(
            "X"
        )
    with pytest.raises(FetchError, match="exhausted"):
        WikipediaFetcher(
            session_for(requests.Timeout(), requests.Timeout()), retries=1, sleep=Mock()
        ).fetch_page("X")


def test_revision_mismatch_and_offline_miss(tmp_path):
    parsed = {"parse": {**FIXTURES["parsed"]["parse"], "revid": 124}}
    with pytest.raises(FetchError, match="identity"):
        WikipediaFetcher(session_for(FIXTURES["normal"], parsed)).fetch_page("Python")
    with pytest.raises(FetchError, match="offline"):
        WikipediaFetcher(cache_dir=tmp_path, offline=True).fetch_page("Missing")


def test_full_text_and_complete_parse_links():
    # Parse returns revision-specific links in one response, avoiding query.links pagination.
    parsed = {
        "parse": {
            **FIXTURES["parsed"]["parse"],
            "links": [{"ns": 0, "title": f"Link {i}"} for i in range(100)],
        }
    }
    session = session_for(FIXTURES["normal"], parsed)
    page = WikipediaFetcher(session, intro_only=False).fetch_page("Python")
    assert len(page.links) == 100
    assert "section" not in session.get.call_args.kwargs["params"]


def test_http_rate_limit_and_invalid_json():
    session = session_for(FIXTURES["normal"], FIXTURES["parsed"])
    limited = Mock(status_code=429, headers={"Retry-After": "2"})
    session.get.side_effect = [limited, *session.get.side_effect]
    sleep = Mock()
    WikipediaFetcher(session, sleep=sleep).fetch_page("Python")
    sleep.assert_called_once_with(2)
    invalid = Mock(status_code=200)
    invalid.json.side_effect = ValueError("Invalid JSON")
    session = Mock()
    session.get.return_value = invalid
    with pytest.raises(FetchError, match="Invalid API"):
        WikipediaFetcher(session).fetch_page("Python")
