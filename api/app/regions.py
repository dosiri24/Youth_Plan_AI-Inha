"""Validate structured Incheon districts against the 2026 district table."""

import csv
import re
from functools import lru_cache
from pathlib import Path

# Reports stamp one version because district names and memberships share the July 2026 revision.
DISTRICT_TABLE_VERSION = "2026-07"

_DISTRICT_TABLE_PATH = Path(__file__).resolve().parent / "data" / "incheon_dong.csv"

DISTRICTS = (
    "제물포구",
    "영종구",
    "미추홀구",
    "연수구",
    "남동구",
    "부평구",
    "계양구",
    "서해구",
    "검단구",
    "강화군",
    "옹진군",
)


def normalize_dong(name: str) -> str:
    """Return the participant-spoken form of an administrative neighbourhood name."""
    return re.sub(r"[0-9·]+(?=동$)", "", name)


@lru_cache(maxsize=1)
def load_district_table() -> dict[str, list[str]]:
    """Return cached normalized neighbourhoods grouped by current district."""
    table = {district: [] for district in DISTRICTS}
    with _DISTRICT_TABLE_PATH.open(encoding="utf-8", newline="") as source:
        for row in csv.DictReader(source):
            dong = normalize_dong(row["dong"])
            if dong not in table[row["district"]]:
                table[row["district"]].append(dong)
    return table


def district_for_dong(name: str) -> str:
    """Return the table district for a normalized neighbourhood or an empty string."""
    normalized_name = normalize_dong(name)
    for district, dongs in load_district_table().items():
        if normalized_name in dongs:
            return district
    return ""


def validate(name: str) -> str:
    """Return a current district name unchanged or an empty string when invalid."""
    return name if name in DISTRICTS else ""
