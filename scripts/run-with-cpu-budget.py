#!/usr/bin/env python3
"""Run a verification command and its children within a shared 60% CPU budget."""

import json
import os
from pathlib import Path
import sys


def main():
    if len(sys.argv) < 2:
        raise SystemExit(
            "Usage: python3 scripts/run-with-cpu-budget.py COMMAND [ARG ...]"
        )
    if not hasattr(os, "sched_getaffinity"):
        raise SystemExit("This helper requires Linux process CPU affinity support.")

    available = sorted(os.sched_getaffinity(0))
    limit = len(available) * 60 // 100
    if limit < 1:
        raise SystemExit("A fractional CPU quota is required on a single-CPU system.")
    state = Path("local/staging/resource-budget/cpu-set.json")
    state.parent.mkdir(parents=True, exist_ok=True)
    try:
        with state.open("x") as file:
            json.dump(available[:limit], file)
    except FileExistsError:
        pass
    # All concurrently launched commands share the same CPU set. Separate
    # per-command sets could otherwise exceed the owner's aggregate budget.
    cpus = sorted(set(json.loads(state.read_text())) & set(available))[:limit]
    if not cpus:
        raise SystemExit(
            "The saved CPU set is unavailable; refresh it after all jobs stop."
        )
    os.sched_setaffinity(0, cpus)
    os.nice(10)
    environment = dict(os.environ)
    environment.setdefault("UV_THREADPOOL_SIZE", "2")
    environment.setdefault("OMP_NUM_THREADS", "2")
    print(
        f"CPU budget: {len(cpus)}/{len(available)} CPUs, inherited by children.",
        file=sys.stderr,
        flush=True,
    )
    os.execvpe(sys.argv[1], sys.argv[1:], environment)


if __name__ == "__main__":
    main()
