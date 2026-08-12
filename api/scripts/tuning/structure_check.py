"""Run the revised structuring prompt over the frozen transcripts and check its contract.

Every check here is mechanical: a quote either appears verbatim in a participant utterance or
it does not. Whether a quote actually implies its demand still needs a human, and this script
deliberately does not pretend otherwise.

  python3 api/scripts/tuning/structure_check.py
"""

import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from app import axes, prompts, regions  # noqa: E402
from app.report import StructuredReport  # noqa: E402

sys.path.insert(0, str(Path(__file__).resolve().parent))

from rehearse import ask  # noqa: E402

LAB_DIR = Path(__file__).resolve().parents[3] / "docs" / "interview-lab"
CORPUS_PATH = LAB_DIR / "corpus.json"
OUTPUT_PATH = LAB_DIR / "structure-check.json"
_JSON_OBJECT = re.compile(r"\{.*\}", re.DOTALL)


def _type_result() -> dict[str, object]:
    """Build one judgement whose axes are evidenced, so reasons are expected on all four."""
    return {
        "code": "".join(poles[0] for _axis, poles, _default in axes.SCORING_AXES),
        "axes": [
            {
                "axis": axis,
                "letter": poles[0],
                "strength": 67,
                "scores": {poles[0]: 4, poles[1]: 2},
                "evidence_count": 3,
                "empty_axis": False,
                "evidence": [],
            }
            for axis, poles, _default in axes.SCORING_AXES
        ],
    }


def structure(record: dict) -> dict | None:
    """Generate one report for a frozen transcript through the production prompt."""
    payload = json.dumps(
        {
            "transcript": record["messages"],
            "type_result": _type_result(),
            "axis_definitions": axes.load_definitions(),
        },
        ensure_ascii=False,
    )
    raw = ask(
        prompts.load_report_prompt("structuring.md"),
        f"{payload}\n\n스키마에 맞는 JSON 객체 하나만 출력하십시오. 다른 말은 쓰지 마십시오.",
    )
    match = _JSON_OBJECT.search(raw)
    if match is None:
        return None
    try:
        return json.loads(match.group())
    except json.JSONDecodeError:
        return None


def check(record: dict, report: dict | None) -> dict[str, object]:
    """Report every contract violation a machine can settle on its own."""
    if report is None:
        return {"name": record["name"], "schema_valid": False, "reason": "unparseable"}

    try:
        StructuredReport.model_validate(report)
        schema_valid = True
    except Exception as error:
        return {
            "name": record["name"],
            "schema_valid": False,
            "reason": type(error).__name__,
        }

    spoken = [item["text"] for item in record["messages"] if item["role"] == "user"]
    quotes = [
        quote
        for axis in report["axis_demands"]
        for demand in axis["demands"]
        for quote in demand["quotes"]
    ]
    unquoted = [
        demand["id"]
        for axis in report["axis_demands"]
        for demand in axis["demands"]
        if not demand["quotes"]
    ]
    inexact = [quote["text"] for quote in quotes if not any(quote["text"] in s for s in spoken)]
    raw_region = report["self_info"]["raw_region"]
    return {
        "name": record["name"],
        "schema_valid": schema_valid,
        "demands": sum(len(axis["demands"]) for axis in report["axis_demands"]),
        "empty_axes": [axis["axis"] for axis in report["axis_demands"] if not axis["demands"]],
        "quotes": len(quotes),
        "demands_without_quote": unquoted,
        "quotes_not_verbatim": inexact,
        "raw_region": raw_region,
        # The model must hand back what was said; the district is the backend's job.
        "region_left_unnormalized": raw_region not in regions.DISTRICTS or not raw_region,
        "participation_notes": len(report["participation_notes"]),
    }


def _write_results(results: list[dict[str, object]]) -> None:
    """Persist every completed structure check for interruption-safe resumption."""
    OUTPUT_PATH.write_text(
        json.dumps(results, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def main() -> None:
    """Structure every frozen transcript once and print the aggregate contract result."""
    records = json.loads(CORPUS_PATH.read_text(encoding="utf-8"))
    results = json.loads(OUTPUT_PATH.read_text(encoding="utf-8")) if OUTPUT_PATH.is_file() else []
    successful = {item["name"] for item in results if item.get("schema_valid") is True}
    for record in records:
        if record["name"] in successful:
            continue
        try:
            report = structure(record)
        except Exception as error:
            result = {
                "name": record["name"],
                "schema_valid": False,
                "failed": True,
                "reason": type(error).__name__,
            }
        else:
            result = check(record, report)
        results = [item for item in results if item["name"] != record["name"]]
        results.append(result)
        _write_results(results)
        print(json.dumps(result, ensure_ascii=False))

    valid = [item for item in results if item["schema_valid"]]
    print(f"\n스키마 통과 {len(valid)}/{len(results)}")
    print(f"인용 없는 요구 {sum(len(item['demands_without_quote']) for item in valid)}건")
    print(f"원문과 다른 인용 {sum(len(item['quotes_not_verbatim']) for item in valid)}건")
    print(f"빈 축 {sum(len(item['empty_axes']) for item in valid)}개")
    print(f"조사 신뢰 발화 {sum(item['participation_notes'] for item in valid)}건")
    print(f"-> {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
