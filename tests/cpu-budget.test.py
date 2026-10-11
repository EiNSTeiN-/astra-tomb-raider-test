"""Exercise the inherited kernel affinity lock, without a busy CPU workload."""

import errno
import json
import os
from pathlib import Path
import platform
import subprocess
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]
LAUNCHER = ROOT / "scripts/run-with-cpu-budget.py"
THREAD_PROBE = """
import errno,json,os,subprocess,sys,threading
wider=set(range(os.cpu_count()))
def probe():
 before=sorted(os.sched_getaffinity(0))
 try:
  os.sched_setaffinity(0,wider)
  blocked=0
 except OSError as error:
  blocked=error.errno
 return {'before':before,'after':sorted(os.sched_getaffinity(0)),'blocked':blocked}
r=probe()
thread=threading.Thread(target=lambda:r.update(thread=probe()))
thread.start();thread.join()
"""
CHILD_PROBE = THREAD_PROBE + "\nprint(json.dumps(r))"
PROBE = THREAD_PROBE + f"\nr['child']=json.loads(subprocess.check_output([sys.executable,'-c',{CHILD_PROBE!r}],text=True))\nprint(json.dumps(r))"

@unittest.skipUnless(
    platform.machine() in ["x86_64", "aarch64"]
    and hasattr(os, "sched_getaffinity")
    and (os.cpu_count() or 0) >= 2,
    "requires a supported Linux CPU-affinity platform",
)
class CpuBudgetTests(unittest.TestCase):
    def launch(self, *command):
        return subprocess.run(
            [sys.executable, str(LAUNCHER), *command],
            cwd=ROOT,
            capture_output=True,
            text=True,
            timeout=15,
        )

    def test_threads_and_descendants_cannot_expand_the_set(self):
        result = self.launch(sys.executable, "-c", PROBE)
        self.assertEqual(result.returncode, 0, result.stderr)
        observed = json.loads(result.stdout)
        for probe in [
            observed,
            observed["thread"],
            observed["child"],
            observed["child"]["thread"],
        ]:
            self.assertEqual(probe["blocked"], errno.EPERM)
            self.assertEqual(probe["before"], probe["after"])
            self.assertEqual(probe["after"], observed["after"])
            self.assertLessEqual(
                len(probe["after"]), (os.cpu_count() or 0) * 60 // 100
            )

    def test_nested_launcher_preserves_the_shared_set(self):
        code = "import json,os;print(json.dumps(sorted(os.sched_getaffinity(0))))"
        direct = self.launch(sys.executable, "-c", code)
        self.assertEqual(direct.returncode, 0, direct.stderr)
        nested = self.launch(
            sys.executable, str(LAUNCHER), sys.executable, "-c", code
        )
        self.assertEqual(nested.returncode, 0, nested.stderr)
        self.assertEqual(json.loads(nested.stdout), json.loads(direct.stdout))

    def test_command_exit_status_is_preserved(self):
        result = self.launch(sys.executable, "-c", "raise SystemExit(17)")
        self.assertEqual(result.returncode, 17, result.stderr)


if __name__ == "__main__":
    unittest.main()
