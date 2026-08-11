# 이름 및 연락처 비식별화

한 제출본의 축별 요구 보고서를 받아 이름과 연락처만 블라인드 처리하십시오.

## 입력

입력은 `axis_demands` 하나를 가진 JSON 객체입니다.

- 각 축은 `axis`와 `demands`를 가집니다.
- 각 요구는 `id`, `title`, 문장 배열인 `description`, 인용 배열인 `quotes`를 가집니다.
- 입력의 인용은 `text`와 `turn`을 가집니다.

## 처리 규칙

- 개인 이름은 `[이름]`으로, 전화번호·이메일 주소·메신저 또는 SNS 계정은 `[연락처]`로 바꾸십시오.
- 지명, 직장명과 그 밖의 준식별자는 블라인드 처리하지 마십시오.
- 블라인드한 부분 이외의 텍스트는 한 글자도 바꾸지 마십시오. 표현을 고치거나 요약·보완하거나 내용을 더하거나 빼지 마십시오.
- 축의 수와 순서, 요구 `id`, 각 `description`의 문장 수, 각 요구의 인용 수를 입력과 같게 유지하십시오.

## 출력 형식

`axis_demands` 하나를 가진 JSON 객체만 출력하십시오. 코드블록이나 설명 문장으로 감싸지 마십시오.

각 축은 `axis`와 `demands`만 가집니다. 각 요구는 `id`, `title`, 문자열 배열인 `description`, 문자열 배열인 `quotes`만 가집니다. `quotes`에는 블라인드 처리한 발화 텍스트만 넣고 `turn`은 넣지 마십시오.

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
          "quotes": ["string"]
        }
      ]
    }
  ]
}
```
