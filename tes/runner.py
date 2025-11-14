"""Utility helpers for executing ad-hoc TES scripts in isolation."""

from __future__ import annotations

import io
import json
import sys
import traceback
from contextlib import redirect_stderr, redirect_stdout
from typing import Any, Dict, Optional


ResultDict = Dict[str, str | None]


def run_script(source: str, *, globals_update: Optional[Dict[str, Any]] = None) -> ResultDict:
    """Execute a user provided script and capture its side effects.

    The execution environment mirrors running the script as ``__main__`` while
    capturing ``stdout`` and ``stderr`` so that callers can surface the output in
    a UI.  If the script defines a callable ``main`` function its return value is
    JSON serialised and stored under ``resultJSON``.  Any exceptions are caught
    and their traceback is written to ``stderr``.

    Parameters
    ----------
    source:
        Python source code to execute.
    globals_update:
        Optional mapping merged into the script globals before execution.  This
        allows hosts to pre-populate values such as configuration objects that a
        console script can read.
    """

    stdout_buffer = io.StringIO()
    stderr_buffer = io.StringIO()
    globals_dict: Dict[str, Any] = {"__name__": "__main__"}
    if globals_update:
        globals_dict.update(globals_update)
    result_json: str | None = None

    with redirect_stdout(stdout_buffer), redirect_stderr(stderr_buffer):
        try:
            exec(source, globals_dict)
        except Exception:  # noqa: BLE001 - propagate details to stderr only
            traceback.print_exc()
        else:
            maybe_main = globals_dict.get("main")
            if callable(maybe_main):
                try:
                    result = maybe_main()
                except Exception:  # noqa: BLE001 - capture traceback in stderr
                    traceback.print_exc()
                else:
                    try:
                        result_json = json.dumps(result)
                    except TypeError:
                        print(
                            "main() return value is not JSON serializable", file=sys.stderr
                        )

    return {
        "stdout": stdout_buffer.getvalue(),
        "stderr": stderr_buffer.getvalue(),
        "resultJSON": result_json,
    }

