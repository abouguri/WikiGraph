import pytest
from fastapi.testclient import TestClient

from wikigraph.api import create_app
from wikigraph.graph_builder import build_dataset
from wikigraph.models import WikipediaPage
from wikigraph.pipeline import export_graph


@pytest.fixture()
def graph_path(tmp_path):
    pages = [
        WikipediaPage(
            "A",
            "https://example.org/A",
            "",
            "A was designed by B.",
            ["B"],
            page_id=1,
            revision_id=1,
            source_kind="synthetic",
        ),
        WikipediaPage(
            "B", "https://example.org/B", "", "", page_id=2, revision_id=2, source_kind="synthetic"
        ),
        WikipediaPage(
            "Isolated",
            "https://example.org/C",
            "",
            "",
            page_id=3,
            revision_id=3,
            source_kind="synthetic",
        ),
    ]
    path = tmp_path / "graph.ttl"
    export_graph(build_dataset(pages), path)
    return path


def test_search_neighbors_evidence_and_paths(graph_path):
    with TestClient(create_app(graph_path)) as client:
        response = client.get("/entities", params={"q": "A"})
        assert response.headers["X-Request-ID"]
        assert response.json()["total"] == 2
        edges = client.get(
            "/entities/fixture-1/neighbors", params={"predicate": "designedBy"}
        ).json()
        assert len(edges["edges"]) == 1
        evidence = client.get("/assertions/" + edges["edges"][0]["id"]).json()
        assert evidence["evidence"] == "A was designed by B."
        assert evidence["source_kind"] == "synthetic"
        assert client.get("/paths?source=fixture-1&target=fixture-2&direction=out").json()["found"]
        assert not client.get("/paths?source=fixture-2&target=fixture-1&direction=out").json()[
            "found"
        ]
        assert not client.get("/paths?source=fixture-1&target=fixture-3").json()["found"]
        assert client.get("/paths?source=fixture-1&target=fixture-2&max_visited=1").json()[
            "truncated"
        ]
        assert client.get("/health").json()["entities"] == 3
        assert client.get("/openapi.json").status_code == 200


@pytest.mark.parametrize(
    "url,status",
    [
        ("/entities?limit=101", 422),
        ("/entities?offset=-1", 422),
        ("/entities/missing/neighbors", 404),
        ("/assertions/missing", 404),
        ("/paths?source=fixture-1&target=fixture-2&max_depth=100", 422),
        ("/paths?source=missing&target=fixture-2", 404),
        ("/entities/fixture-1/neighbors?predicate=evil", 422),
    ],
)
def test_invalid_requests(graph_path, url, status):
    with TestClient(create_app(graph_path)) as client:
        response = client.get(url)
        assert response.status_code == status
        assert response.json()["error"]["code"] == status


def test_rate_limit(graph_path):
    with TestClient(create_app(graph_path, rate_limit=1)) as client:
        assert client.get("/entities").status_code == 200
        assert client.get("/entities").status_code == 429
        assert client.get("/health").status_code == 200
