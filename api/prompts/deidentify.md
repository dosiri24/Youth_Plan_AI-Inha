# 이름 및 연락처 비식별화

한 제출본의 요구 기록을 받아 이름과 연락처만 블라인드 처리하십시오.

## 입력

입력은 `axis_demands`, `top_demand`, `extra_demands` 세 필드를 가진 JSON 객체입니다.

- `axis_demands`의 각 축은 `axis`와 `demands`를 가집니다.
- 각 요구는 `id`, `title`, 문장 배열인 `description`, 인용 배열인 `quotes`, 장소 표현 배열인 `places`를 가집니다. 입력의 인용은 `text`와 `turn`을 가지고, `places`는 문자열 배열입니다.
- `top_demand`는 참여자가 마무리에서 고른 하나이며 `title`, 문장 배열인 `reason`, 인용 배열인 `quotes`를 가집니다. 고른 것이 없는 제출본에서는 `title`이 빈 문자열이고 나머지는 빈 배열입니다. 그때는 그대로 비워 돌려주십시오.
- `extra_demands`는 축에 담기지 못한 요구 목록이며 각 항목의 구성은 위 요구와 같습니다. 없으면 빈 배열입니다.

## 처리 규칙

- 개인 이름은 `[이름]`으로, 전화번호·이메일 주소·메신저 또는 SNS 계정은 `[연락처]`로 바꾸십시오.
- 지명, 직장명과 그 밖의 준식별자는 블라인드 처리하지 마십시오.
- 블라인드한 부분 이외의 텍스트는 한 글자도 바꾸지 마십시오. 표현을 고치거나 요약·보완하거나 내용을 더하거나 빼지 마십시오.
- **입력의 구조와 개수를 그대로 유지하십시오.** 축의 수와 순서, 요구 `id`와 그 순서, 각 `description`의 문장 수, 각 요구의 인용 수와 장소 수, `top_demand`의 `reason` 문장 수와 인용 수, `extra_demands`의 요구 수가 입력과 같아야 합니다. 빈 문자열은 빈 문자열로 남습니다.
- **`demands`가 빈 배열인 축은 빈 배열 그대로 두십시오.** 근거가 없어 비어 있는 축이므로 요구를 만들어 채우지 마십시오. `top_demand`와 `extra_demands`의 빈 배열도 그대로 둡니다.
- 장소 표현은 지명이므로 대개 그대로 남습니다. 사람 이름이 들어간 장소 이름일 때만 그 이름 부분을 바꾸십시오.

## 출력 형식

`axis_demands`, `top_demand`, `extra_demands` 세 필드를 가진 JSON 객체만 출력하십시오. 코드블록이나 설명 문장으로 감싸지 마십시오.

각 축은 `axis`와 `demands`만 가집니다. 각 요구는 `id`, `title`, 문자열 배열인 `description`, 문자열 배열인 `quotes`, 문자열 배열인 `places`만 가집니다. **`quotes`에는 블라인드 처리한 발화 텍스트만 넣고 `turn`은 넣지 마십시오.**

```
{
  "axis_demands": [
    {
      "axis": "string",
      "demands": [
        {
          "id": "string",
          "title": "string",
          "description": ["string"],
          "quotes": ["string"],
          "places": ["string"]
        }
      ]
    }
  ],
  "top_demand": {
    "title": "string",
    "reason": ["string"],
    "quotes": ["string"]
  },
  "extra_demands": [
    {
      "id": "string",
      "title": "string",
      "description": ["string"],
      "quotes": ["string"],
      "places": ["string"]
    }
  ]
}
```
