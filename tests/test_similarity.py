import json
import math
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from wikigraph.api import create_app
from wikigraph.graph_builder import build_dataset
from wikigraph.models import WikipediaPage
from wikigraph.similarity import SimilarityIndex


def index(ids, pairs):
    return SimilarityIndex(
        {id: {"id": id, "label": id} for id in ids},
        [
            {"id": str(i), "subject": a, "object": b, "predicate": predicate}
            for i, (a, b, predicate) in enumerate(pairs)
        ],
    )


def test_symmetry_self_isolated_and_hub_weighting():
    s = index(
        list("abcdefghi"),
        [
            (a, b, "linksTo")
            for a, b in [
                ("a", "h"),
                ("b", "h"),
                ("c", "h"),
                ("d", "h"),
                ("e", "h"),
                ("a", "f"),
                ("b", "f"),
            ]
        ],
    )
    assert s.score("a", "b") == s.score("b", "a")
    assert s.score("i", "i") == 1
    assert s.score("a", "i") == 0
    assert s.weights["h"] < s.weights["f"]
    assert s.explain("a", "b")["shared"][0]["id"] == "f"
    assert s.map(["i"])["nodes"][0]["id"] == "i"
    assert len(s.map(["i"])["nodes"]) == 1


def test_multi_origin_geometric_mean_and_deterministic_clusters():
    s = index(
        list("abcdef"),
        [
            (a, b, "linksTo")
            for a, b in [("a", "d"), ("b", "d"), ("c", "d"), ("c", "e"), ("b", "e")]
        ],
    )
    result = s.map(["a", "b"], 5)
    assert result == s.map(["a", "b"], 5)
    c = next(n for n in result["nodes"] if n["id"] == "c")
    assert c["similarity"] == pytest.approx(math.sqrt(s.score("c", "a") * s.score("c", "b")))
    assert c["similarity"] > s.score("a", "e")
    assert s.clusters(list("abcde")) == s.clusters(list("edcba"))
    assert all(link["weight"] >= 0.15 for link in result["layout_links"])


def test_limits_and_side_lists_exclude_hubs():
    ids = [str(i) for i in range(100)]
    s = index(
        ids,
        [(str(i), "99", "linksTo") for i in range(90)]
        + [(str(i), "98", "linksTo") for i in range(5)],
    )
    result = s.map(["0"], 5)
    assert len(result["nodes"]) == 6  # limit counts non-origins
    assert "99" not in [n["id"] for n in result["lists"]["foundations"]]
    assert len(s.map(["0"], 999)["nodes"]) == 81


def test_api_contract_and_assertion_resolution(tmp_path):
    pages = json.loads((Path(__file__).resolve().parents[1] / "data/demo/pages.json").read_text())
    path = tmp_path / "graph.ttl"
    build_dataset([WikipediaPage(**p) for p in pages]).serialize(path, format="turtle")
    with TestClient(create_app(path, rate_limit=1000)) as client:
        top = client.get("/entities/top").json()["items"]
        origins = [n["id"] for n in top[:3]]
        for selected in [origins[:1], origins]:
            result = client.get("/graph/map", params={"origins": ",".join(selected), "limit": 5})
            assert result.status_code == 200
            body = result.json()
            assert len(body["nodes"]) <= 5 + len(selected)
            assert all(n["type"] == "Other" and n["year"] is None for n in body["nodes"])
            for edge in body["edges"]:
                assert client.get("/assertions/" + edge["assertion_id"]).status_code == 200
        assert (
            client.get("/similarity/explain", params={"a": origins[0], "b": origins[1]}).status_code
            == 200
        )
        for origins_param, status in [
            ("", 422),
            ("missing", 404),
            (",".join(origins * 2), 422),
            (origins[0] + "," + origins[0], 422),
        ]:
            assert client.get("/graph/map", params={"origins": origins_param}).status_code == status
