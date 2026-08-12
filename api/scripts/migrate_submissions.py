"""Migrate stored submissions to the 2026-08-12 document shapes."""

import argparse
import copy
import json
import sys
from pathlib import Path
from typing import Any

API_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(API_ROOT))

from app import regions, store  # noqa: E402

Change = dict[str, Any]


def _set_field(
    target: dict[str, Any],
    key: str,
    value: Any,
    path: str,
    changes: list[Change],
) -> None:
    """Set one contracted field and record only an actual add or rewrite."""
    if key not in target:
        target[key] = value
        changes.append({"action": "add", "field": path, "value": value})
    elif target[key] != value:
        old_value = target[key]
        target[key] = value
        changes.append(
            {
                "action": "rewrite",
                "field": path,
                "old_value": old_value,
                "value": value,
            }
        )


def _migrate_self_info(
    info: dict[str, Any],
    path: str,
    changes: list[Change],
) -> None:
    """Add the raw and versioned normalized region fields beside the legacy one."""
    raw_region = info["region"] if "region" in info else info["raw_region"]
    _set_field(info, "raw_region", raw_region, f"{path}.raw_region", changes)
    _set_field(
        info,
        "normalized_region",
        regions.normalize(raw_region),
        f"{path}.normalized_region",
        changes,
    )
    _set_field(
        info,
        "region_table_version",
        regions.ALIAS_TABLE_VERSION,
        f"{path}.region_table_version",
        changes,
    )
    # The deployed reader still projects self_info.region, so removing it here takes the
    # admin list down until the new reader ships. It goes away in a later contract step.
    _set_field(info, "region", raw_region, f"{path}.region", changes)


def migrate(document: store.Document) -> tuple[store.Document, list[Change]]:
    """Return one independently copied submission and its ordered field changes."""
    migrated = copy.deepcopy(document)
    changes: list[Change] = []
    if "self_info" in migrated:
        _migrate_self_info(migrated["self_info"], "self_info", changes)

    report = migrated["report"]
    _migrate_self_info(report["self_info"], "report.self_info", changes)
    if "participation_notes" not in report:
        _set_field(
            report,
            "participation_notes",
            [],
            "report.participation_notes",
            changes,
        )
    elif not isinstance(report["participation_notes"], list):
        raise TypeError("report.participation_notes must be a list")

    for index, axis in enumerate(migrated["type_result"]["axes"]):
        evidence = axis["evidence"]
        if not isinstance(evidence, list):
            raise TypeError(f"type_result.axes[{index}].evidence must be a list")
        axis_path = f"type_result.axes[{index}]"
        _set_field(
            axis,
            "evidence_count",
            len(evidence),
            f"{axis_path}.evidence_count",
            changes,
        )
        _set_field(
            axis,
            "empty_axis",
            not evidence,
            f"{axis_path}.empty_axis",
            changes,
        )
    return migrated, changes


def run(apply: bool) -> None:
    """Inspect every submission and persist only changed documents when authorized."""
    active_store = store.get_store()
    documents = active_store.list()
    needing_migration = 0
    current = 0

    for document in documents:
        submission_id = document["submission_id"]
        try:
            migrated, changes = migrate(document)
            nickname = migrated["report"]["self_info"]["nickname"]
        except Exception as error:
            raise RuntimeError(f"failed to migrate submission {submission_id}") from error

        if changes:
            needing_migration += 1
            if apply:
                body = {key: value for key, value in migrated.items() if key != "submission_id"}
                active_store.save(submission_id, body)
                status = "wrote"
            else:
                status = "would_write"
        else:
            current += 1
            status = "current"
        sys.stdout.write(
            json.dumps(
                {
                    "submission_id": submission_id,
                    "nickname": nickname,
                    "status": status,
                    "changes": changes,
                },
                ensure_ascii=False,
                default=str,
            )
            + "\n"
        )

    sys.stdout.write(
        json.dumps(
            {
                "mode": "apply" if apply else "dry-run",
                "needing_migration": needing_migration,
                "current": current,
                "total": len(documents),
            },
            ensure_ascii=False,
        )
        + "\n"
    )


def main(argv: list[str] | None = None) -> int:
    """Parse the explicit write flag and run the migration once."""
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--apply",
        action="store_true",
        help="write migrated submissions; omitted means read-only dry run",
    )
    args = parser.parse_args(argv)
    run(args.apply)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
