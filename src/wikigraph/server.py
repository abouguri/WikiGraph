"""Container entry point supporting the port assigned by a managed host."""

from __future__ import annotations

import logging
import os

import uvicorn


def configured_port() -> int:
    try:
        port = int(os.environ.get("PORT", "8000"))
    except ValueError as exc:
        raise ValueError("PORT must be an integer between 1 and 65535") from exc
    if not 1 <= port <= 65535:
        raise ValueError("PORT must be an integer between 1 and 65535")
    return port


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    uvicorn.run("wikigraph.api:create_app", factory=True, host="0.0.0.0", port=configured_port())


if __name__ == "__main__":
    main()
