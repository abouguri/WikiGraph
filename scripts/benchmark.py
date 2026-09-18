"""Measure a real local HTTP server; record scope instead of extrapolating results."""

import argparse
import concurrent.futures
import hashlib
import json
import os
import platform
import resource
import socket
import subprocess
import sys
import tempfile
import time
from pathlib import Path

import requests


def percentile(values, fraction):
    values = sorted(values)
    return values[min(len(values) - 1, int((len(values) - 1) * fraction))]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--graph", type=Path, default=Path("data/wikipedia/graph.ttl"))
    parser.add_argument("--output", type=Path, default=Path("reports/benchmark.json"))
    parser.add_argument("--requests", type=int, default=100)
    parser.add_argument("--concurrency", type=int, default=5)
    args = parser.parse_args()
    if args.requests < 1 or args.concurrency < 1:
        parser.error("Positive request count and concurrency required")
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        port = sock.getsockname()[1]
    env = {
        **os.environ,
        "WIKIGRAPH_GRAPH": str(args.graph.resolve()),
        "WIKIGRAPH_RATE_LIMIT": "100000",
    }
    started = time.perf_counter()
    with tempfile.TemporaryFile() as logs:
        server = subprocess.Popen(
            [
                sys.executable,
                "-m",
                "uvicorn",
                "wikigraph.api:create_app",
                "--factory",
                "--port",
                str(port),
                "--log-level",
                "warning",
            ],
            env=env,
            stdout=logs,
            stderr=logs,
        )
        base = f"http://127.0.0.1:{port}"
        try:
            while True:
                if server.poll() is not None or time.perf_counter() - started > 60:
                    logs.seek(0)
                    raise RuntimeError(logs.read().decode())
                try:
                    health = requests.get(base + "/health", timeout=1).json()
                    break
                except requests.ConnectionError:
                    time.sleep(0.1)
            startup = time.perf_counter() - started
            endpoints = {
                "search": "/entities?q=Python",
                "neighbors": "/entities/enwiki-23862/neighbors?limit=30",
                "path": "/paths?source=enwiki-23862&target=enwiki-226402&direction=both",
            }
            report = {
                "dataset": str(args.graph),
                "sha256": hashlib.sha256(args.graph.read_bytes()).hexdigest(),
                "dataset_counts": health,
                "platform": platform.platform(),
                "python": platform.python_version(),
                "cpu": platform.processor(),
                "logical_cpus": os.cpu_count(),
                "concurrency": args.concurrency,
                "requests_per_workload": args.requests,
                "startup_seconds": startup,
                "transport": "HTTP over loopback; fresh connection per request",
                "cache_note": "Application-cold first query; OS disk cache not cleared",
                "rate_limit": "Raised to 100000/minute only for benchmark",
                "workloads": {},
            }
            for name, endpoint in endpoints.items():

                def once(_, endpoint=endpoint):
                    begin = time.perf_counter()
                    response = requests.get(base + endpoint, timeout=10)
                    response.raise_for_status()
                    return (time.perf_counter() - begin) * 1000

                cold = once(0)
                for i in range(5):
                    once(i)
                begin = time.perf_counter()
                with concurrent.futures.ThreadPoolExecutor(max_workers=args.concurrency) as pool:
                    timings = list(pool.map(once, range(args.requests)))
                report["workloads"][name] = {
                    "first_query_ms": cold,
                    "p50_ms": percentile(timings, 0.5),
                    "p95_ms": percentile(timings, 0.95),
                    "p99_ms": percentile(timings, 0.99),
                    "max_ms": max(timings),
                    "throughput_requests_per_second": args.requests / (time.perf_counter() - begin),
                }
        finally:
            server.terminate()
            try:
                server.wait(timeout=10)
            except subprocess.TimeoutExpired:
                server.kill()
                server.wait()
    report["server_peak_rss_kib"] = resource.getrusage(resource.RUSAGE_CHILDREN).ru_maxrss
    report["limitations"] = (
        "One local run on a 100-page graph, not the planned 300-page release gate; no WAN or sustained-load claim."
    )
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
