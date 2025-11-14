from __future__ import annotations

import json
import textwrap

from tes import run_script


def test_run_script_captures_stdout() -> None:
    script = "print('hello world')"
    result = run_script(script)
    assert result["stdout"] == "hello world\n"
    assert result["stderr"] == ""
    assert result["resultJSON"] is None


def test_run_script_serialises_main_return() -> None:
    script = textwrap.dedent(
        """
        print('boot')

        def main():
            print('running main')
            return {'value': 42}
        """
    )
    result = run_script(script)
    assert "boot\nrunning main\n" == result["stdout"]
    assert result["stderr"] == ""
    assert result["resultJSON"] == '{"value": 42}'


def test_run_script_reports_exec_exception() -> None:
    script = "raise ValueError('boom')"
    result = run_script(script)
    assert result["stdout"] == ""
    assert "ValueError" in result["stderr"]
    assert "boom" in result["stderr"]
    assert result["resultJSON"] is None


def test_run_script_reports_main_exception() -> None:
    script = textwrap.dedent(
        """
        def main():
            raise RuntimeError('main failure')
        """
    )
    result = run_script(script)
    assert result["stdout"] == ""
    assert "RuntimeError" in result["stderr"]
    assert "main failure" in result["stderr"]
    assert result["resultJSON"] is None


def test_run_script_handles_unserialisable_result() -> None:
    script = textwrap.dedent(
        """
        def main():
            return {1, 2, 3}
        """
    )
    result = run_script(script)
    assert result["stdout"] == ""
    assert "not JSON serializable" in result["stderr"]
    assert result["resultJSON"] is None


def test_run_script_injects_global_values() -> None:
    script = textwrap.dedent(
        """
        def main():
            return {
                "cfg": RUNNER_CONFIG,
                "inputs": EXECUTION_INPUTS,
            }
        """
    )
    result = run_script(
        script,
        globals_update={
            "RUNNER_CONFIG": {"rig": "workforce"},
            "EXECUTION_INPUTS": {"seed": 99},
        },
    )
    assert result["stderr"] == ""
    payload = json.loads(result["resultJSON"])
    assert payload["cfg"]["rig"] == "workforce"
    assert payload["inputs"]["seed"] == 99

