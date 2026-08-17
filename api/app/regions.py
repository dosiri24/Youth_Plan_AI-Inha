"""Validate structured Incheon districts against the 2026 district table."""

# Administrative names change, so stored reports retain the table version used to validate them.
DISTRICT_TABLE_VERSION = "2026-07"

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


def validate(name: str) -> str:
    """Return a current district name unchanged or an empty string when invalid."""
    return name if name in DISTRICTS else ""
