"""Resolve spoken Incheon place names to 2026 districts through one versioned table."""

# Administrative names change, so the table carries the reorganization it was written against.
ALIAS_TABLE_VERSION = "2026-07"

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

# Districts the 2026-07 reorganization replaced; participants still use them.
LEGACY_DISTRICTS = {
    "중구": "제물포구",
    "동구": "제물포구",
    "서구": "서해구",
}

# Neighbourhood and island names participants use instead of a district.
LOCAL_NAMES = {
    "송도": "연수구",
    "동춘": "연수구",
    "청학": "연수구",
    "옥련": "연수구",
    "청라": "서해구",
    "가정": "서해구",
    "가좌": "서해구",
    "석남": "서해구",
    "영종": "영종구",
    "운서": "영종구",
    "용유": "영종구",
    "무의": "영종구",
    "동인천": "제물포구",
    "신포": "제물포구",
    "송림": "제물포구",
    "만석": "제물포구",
    "주안": "미추홀구",
    "용현": "미추홀구",
    "학익": "미추홀구",
    "도화": "미추홀구",
    "숭의": "미추홀구",
    "구월": "남동구",
    "논현": "남동구",
    "만수": "남동구",
    "간석": "남동구",
    "소래": "남동구",
    "부평": "부평구",
    "삼산": "부평구",
    "산곡": "부평구",
    "십정": "부평구",
    "계산": "계양구",
    "작전": "계양구",
    "귤현": "계양구",
    "검단": "검단구",
    "마전": "검단구",
    "당하": "검단구",
    "강화": "강화군",
    "교동": "강화군",
    "백령": "옹진군",
    "대청": "옹진군",
    "연평": "옹진군",
    "덕적": "옹진군",
    "자월": "옹진군",
}


def normalize(raw_region: str) -> str:
    """Return the 2026 district behind one spoken name, or an empty string when unresolvable."""
    text = raw_region.strip()
    if not text:
        return ""
    # Current names win outright because "남동구" also contains the legacy name "동구".
    for district in DISTRICTS:
        if district in text:
            return district
    for legacy, district in LEGACY_DISTRICTS.items():
        if legacy in text:
            return district
    # Longest first so "동인천" is not resolved by the shorter "인천" style fragments.
    for name in sorted(LOCAL_NAMES, key=len, reverse=True):
        if name in text:
            return LOCAL_NAMES[name]
    return ""
