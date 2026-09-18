"""Record exact installed versions for the runtime closure and development environment."""

from importlib import metadata
from pathlib import Path

from packaging.requirements import Requirement
from packaging.utils import canonicalize_name

root = Path(__file__).resolve().parents[1]
queue = [Requirement(r) for r in metadata.requires("wikigraph") or [] if not Requirement(r).marker]
seen = set()
versions = {}
while queue:
    requirement = queue.pop()
    name = canonicalize_name(requirement.name)
    key = (name, tuple(sorted(requirement.extras)))
    if key in seen:
        continue
    seen.add(key)
    versions[name] = metadata.version(name)
    for raw in metadata.requires(name) or []:
        dependency = Requirement(raw)
        if dependency.marker is None or any(
            dependency.marker.evaluate({"extra": extra}) for extra in ["", *requirement.extras]
        ):
            queue.append(dependency)
(root / "requirements.lock").write_text(
    "# Exact runtime versions verified with Python 3.13; regenerate after intentional upgrades.\n"
    + "".join(f"{name}=={version}\n" for name, version in sorted(versions.items()))
)
dev = {
    canonicalize_name(d.metadata["Name"]): d.version
    for d in metadata.distributions()
    if canonicalize_name(d.metadata["Name"]) not in {"wikigraph", "pip"}
}
(root / "requirements-dev.lock").write_text(
    "# Exact development environment.\n"
    + "".join(f"{name}=={version}\n" for name, version in sorted(dev.items()))
)
