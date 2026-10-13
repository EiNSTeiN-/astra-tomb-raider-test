#!/usr/bin/env python3
"""Run a verification command and its children within a shared 5/16 CPU budget."""

import ctypes
import errno
import json
import os
from pathlib import Path
import platform
import sys


def lock_affinity():
    """Keep native libraries from expanding the inherited CPU set."""
    architectures = {
        "x86_64": (0xC000003E, 203),
        "aarch64": (0xC00000B7, 122),
    }
    try:
        architecture, syscall = architectures[platform.machine()]
    except KeyError:
        raise SystemExit("The affinity guard supports Linux x86_64 and aarch64.")

    class Instruction(ctypes.Structure):
        _fields_ = [
            ("code", ctypes.c_ushort),
            ("jt", ctypes.c_ubyte),
            ("jf", ctypes.c_ubyte),
            ("k", ctypes.c_uint),
        ]

    class Program(ctypes.Structure):
        _fields_ = [
            ("length", ctypes.c_ushort),
            ("instructions", ctypes.POINTER(Instruction)),
        ]

    denied = 0x00050000 | errno.EPERM
    # Check the syscall ABI before its number. Refuse an unsupported ABI;
    # ordinary calls in the supported ABI remain available. On x86, strip the
    # x32 flag so that calling convention cannot bypass the affinity lock.
    code = [
        (0x20, 0, 0, 4),  # seccomp_data.arch
        (0x15, 1, 0, architecture),
        (0x06, 0, 0, denied),
        (0x20, 0, 0, 0),  # seccomp_data.nr
    ]
    if platform.machine() == "x86_64":
        code.append((0x54, 0, 0, 0xBFFFFFFF))
    code.extend(
        [
            (0x15, 0, 1, syscall),
            (0x06, 0, 0, denied),
            (0x06, 0, 0, 0x7FFF0000),  # SECCOMP_RET_ALLOW
        ]
    )
    instructions = (Instruction * len(code))(*(Instruction(*i) for i in code))
    program = Program(len(code), instructions)
    libc = ctypes.CDLL(None, use_errno=True)
    libc.prctl.argtypes = [ctypes.c_int] + [ctypes.c_ulong] * 4
    libc.prctl.restype = ctypes.c_int
    for option, value, pointer in [
        (38, 1, 0),  # PR_SET_NO_NEW_PRIVS
        (22, 2, ctypes.addressof(program)),  # PR_SET_SECCOMP, FILTER
    ]:
        if libc.prctl(option, value, pointer, 0, 0) != 0:
            error = ctypes.get_errno()
            raise SystemExit(f"Cannot lock the CPU budget: {os.strerror(error)}")


def main():
    if len(sys.argv) < 2:
        raise SystemExit(
            "Usage: python3 scripts/run-with-cpu-budget.py COMMAND [ARG ...]"
        )
    if not hasattr(os, "sched_getaffinity"):
        raise SystemExit("This helper requires Linux process CPU affinity support.")

    available = sorted(os.sched_getaffinity(0))
    inherited = os.environ.get("VESPER_CPU_BUDGET")
    if inherited:
        budget = json.loads(inherited)
        cpus, total = budget["cpus"], budget["available"]
        if (
            cpus != available
            or not isinstance(total, int)
            or total > (os.cpu_count() or total)
            or len(cpus) > total * 5 // 16
        ):
            raise SystemExit("The inherited CPU budget does not match this process.")
        # A nested launcher already has the parent's locked set and priority.
        # Do not shrink its allowance again or try a blocked affinity syscall.
    else:
        total = len(available)
        limit = total * 5 // 16
        if limit < 1:
            raise SystemExit(
                "A fractional CPU quota is required below four available CPUs."
            )
        state = Path("local/staging/resource-budget/cpu-set.json")
        state.parent.mkdir(parents=True, exist_ok=True)
        try:
            with state.open("x") as file:
                json.dump(available[:limit], file)
        except FileExistsError:
            pass
        # Concurrent commands share a set; separate sets could exceed 5/16.
        cpus = sorted(set(json.loads(state.read_text())) & set(available))[:limit]
        if not cpus:
            raise SystemExit(
                "The saved CPU set is unavailable; refresh it after all jobs stop."
            )
        os.sched_setaffinity(0, cpus)
        os.nice(10)
    lock_affinity()
    environment = dict(os.environ)
    environment.setdefault("UV_THREADPOOL_SIZE", "2")
    environment.setdefault("OMP_NUM_THREADS", "2")
    environment["VESPER_CPU_BUDGET"] = json.dumps({"cpus": cpus, "available": total})
    print(
        f"CPU budget: {len(cpus)}/{total} CPUs, locked for children.",
        file=sys.stderr,
        flush=True,
    )
    os.execvpe(sys.argv[1], sys.argv[1:], environment)


if __name__ == "__main__":
    main()
