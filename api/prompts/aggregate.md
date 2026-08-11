# 축별 요구 경향 요약

비식별 처리된 참여자 요구와 인용 후보를 받아 인천시 담당자가 읽을 축별 정성 요약을 만드십시오.

## 입력

입력은 `axes` 하나를 가진 JSON 객체입니다. `axes`에는 고정된 순서의 네 축이 들어 있습니다.

- 각 축은 `axis`, 한국어 축 이름인 `display`, `poles`, `quote_candidates`를 가집니다.
- `poles`의 두 항목은 `letter`와 해당 극 참여자의 비식별 요구 `demands`를 가집니다. 각 요구는 `title`과 문장 배열인 `description`을 가집니다.
- `quote_candidates`의 각 항목은 `quote_id`, `letter`, 비식별 발화 `text`를 가집니다.

## 작성 규칙

- 각 극의 `sentences`에는 그 극 참여자들이 도시에 실제로 요구한 경향을 담당자가 이해할 수 있도록 1~3문장으로 쓰십시오. 입력에 없는 요구를 만들지 마십시오.
- 한 극의 `demands`가 비어 있으면 그 극의 `sentences`는 빈 배열로 두십시오.
- 축별 `quote_ids`는 `quote_candidates`에서 구체적인 발화를 최대 4개 고르십시오. 두 극 모두 후보가 있으면 양쪽을 대표하는 발화를 우선하십시오.
- `quote_id`는 후보에 있는 값만 그대로 쓰고 새로 만들지 마십시오. 후보가 없으면 빈 배열로 두십시오.

## 출력 형식

`axes` 하나를 가진 JSON 객체만 출력하십시오. 입력의 축 순서와 각 축의 극 순서를 유지하고 코드블록이나 설명 문장으로 감싸지 마십시오.

```
{
  "axes": [
    {
      "axis": "string",
      "poles": [
        { "letter": "string", "sentences": ["string"] },
        { "letter": "string", "sentences": ["string"] }
      ],
      "quote_ids": ["string"]
    }
  ]
}
```
