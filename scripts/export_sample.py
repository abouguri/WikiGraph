"""Build the browser's offline sample using the same graph/query model as the API."""

import json
from pathlib import Path

from wikigraph.api import QueryStore
from wikigraph.graph_builder import build_dataset
from wikigraph.models import WikipediaPage

root = Path(__file__).resolve().parents[1]
pages = [WikipediaPage(**p) for p in json.loads((root / "data/demo/pages.json").read_text())]
store = QueryStore(build_dataset(pages))
(root / "src/wikigraph/static/sample.json").write_text(
    json.dumps(
        {
            "entities": [e.model_dump() for e in store.entities.values()],
            "assertions": [a.model_dump() for a in store.assertions.values()],
        },
        indent=2,
    )
    + "\n"
)
(root / "src/wikigraph/demo-pages.json").write_bytes((root / "data/demo/pages.json").read_bytes())
