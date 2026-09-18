"""Export or merge explicitly authored independent review CSVs."""

import argparse
import json
from pathlib import Path

from wikigraph.annotation_review import export_template, merge_reviews

parser = argparse.ArgumentParser()
sub = parser.add_subparsers(dest="command", required=True)
export = sub.add_parser("export")
export.add_argument("--source", type=Path, default=Path("data/evaluation/wikipedia-review.jsonl"))
export.add_argument("--split", choices=["dev", "test"], required=True)
export.add_argument("--output", type=Path, required=True)
merge = sub.add_parser("merge")
merge.add_argument("--source", type=Path, default=Path("data/evaluation/wikipedia-review.jsonl"))
merge.add_argument("--first", type=Path, required=True)
merge.add_argument("--second", type=Path, required=True)
merge.add_argument("--first-reviewer", required=True)
merge.add_argument("--second-reviewer", required=True)
merge.add_argument("--split", choices=["dev", "test"], required=True)
merge.add_argument("--output", type=Path, required=True)
args = parser.parse_args()
if args.command == "export":
    export_template(args.source, args.output, split=args.split)
else:
    print(
        json.dumps(
            merge_reviews(
                args.source,
                args.first,
                args.second,
                args.output,
                first_reviewer=args.first_reviewer,
                second_reviewer=args.second_reviewer,
                split=args.split,
            ),
            indent=2,
        )
    )
