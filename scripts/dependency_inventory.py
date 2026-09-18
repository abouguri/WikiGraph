"""Record declared licenses and versions; metadata is evidence, not legal advice."""

import json
from importlib import metadata
from pathlib import Path

root = Path(__file__).resolve().parents[1]
python_packages = []
for line in (root / "requirements.lock").read_text().splitlines():
    if not line or line.startswith("#"):
        continue
    name, version = line.split("==")
    distribution = metadata.distribution(name)
    meta = distribution.metadata
    license_value = meta.get("License-Expression") or meta.get("License")
    classifiers = [
        c.removeprefix("License :: ")
        for c in meta.get_all("Classifier", [])
        if c.startswith("License :: ")
    ]
    python_packages.append(
        {
            "name": name,
            "version": version,
            "declared_license": license_value,
            "license_classifiers": classifiers,
            "license_files": meta.get_all("License-File", []),
        }
    )
lock = json.loads((root / "frontend/package-lock.json").read_text())
frontend = [
    {
        "package_path": name,
        "version": details.get("version"),
        "declared_license": details.get("license"),
        "development_only": details.get("dev", False),
    }
    for name, details in lock["packages"].items()
    if name
]
report = {
    "python_runtime": python_packages,
    "frontend_build_and_test": frontend,
    "limitations": "License metadata inventory only. Dependencies retain their own notices; inspect included license files when distributing. Wikipedia data has separate CC BY-SA attribution.",
}
(root / "reports/dependency-inventory.json").write_text(json.dumps(report, indent=2) + "\n")
print(
    f"Inventoried {len(python_packages)} Python packages and {len(frontend)} frontend lock entries"
)
