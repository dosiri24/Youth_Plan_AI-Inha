# Anthropic 「81,000명 AI 인터뷰」 웹사이트 디자인·구현 분석 보고서

> 분석 대상: [`html.txt`](/Users/taesooa/Desktop/temp/html.txt:1)  
> 원본 페이지: [Anthropic, *What 81,000 people want from AI*](https://www.anthropic.com/features/81k-interviews)  
> 분석 목적: 같은 정보 밀도와 사용자 경험을 가진 데이터 저널리즘형 웹사이트를 새로 설계·구현하기 위한 참조 문서  
> 분석일: 2026-08-17

## 목차

- [0. 분석 범위와 한계](#0-먼저-알아야-할-분석-범위와-한계)
- [1. 디자인 정체성](#1-한눈에-보는-디자인-정체성)
- [2. 전체 정보 구조](#2-전체-정보-구조)
- [3. 페이지별 상세 분석](#3-페이지별-상세-분석)
- [4. 시각 디자인 시스템](#4-시각-디자인-시스템)
- [5. 반응형 설계](#5-반응형-설계-매트릭스)
- [6. 인터랙션과 모션](#6-인터랙션모션-명세)
- [7. 기술 구조](#7-기술-구조-분석)
- [8. 접근성](#8-접근성-평가와-필수-개선)
- [9. SEO와 분석](#9-seo메타데이터분석)
- [10. 콘텐츠와 현지화](#10-콘텐츠현지화-품질-분석)
- [11. 그대로 복사하면 안 되는 부분](#11-원본에서-그대로-복사하면-안-되는-부분)
- [12. 구현 청사진](#12-유사-사이트-구현-청사진)
- [13. QA 체크리스트](#13-디자인-qa-체크리스트)
- [14. 핵심 사양 요약](#14-핵심-구현-사양-요약)
- [15. 근거와 자산](#15-근거-위치와-관련-자산)

---

## 0. 먼저 알아야 할 분석 범위와 한계

### 0.1 `html.txt`의 성격

- 파일 크기는 약 **2.35MB**이며 단어 수는 약 **13.8만 개**다.
- 물리적으로는 18줄뿐이고, 대부분의 DOM은 1행, React Server Components(이하 RSC) 데이터는 7행에 압축되어 있다. 따라서 일반적인 행 번호보다 `data-type`, 컴포넌트명, 클래스명, 데이터 키를 함께 검색하는 편이 정확하다.
- 이는 깨끗한 원본 HTML이나 저장소 소스가 아니라 **실행 중인 Next.js 페이지를 저장한 DOM 스냅샷**에 가깝다.
- 캡처 당시의 런타임 상태도 섞여 있다. 예를 들어 헤더 실측 폭·높이 CSS 변수, 완성된 Lottie SVG, D3가 주입한 SVG 노드, 중간 스크롤 위치에 해당하는 transform 값이 남아 있다.
- 그러므로 컴포넌트 구조, 시각 토큰, 데이터 스키마, 반응형 분기, 인터랙션 알고리즘은 상당히 구체적으로 복원할 수 있지만 다음 항목은 단정할 수 없다.
  - 정확한 Next.js 버전
  - 원본 SCSS 파일의 변수명과 믹스인 구조
  - 서버 fetch/cache 정책
  - 빌드 전 컴포넌트 파일 경계
  - 번역이 CMS 단계인지 런타임 자동 번역인지 여부

### 0.2 검증 방식

- 저장된 DOM과 RSC payload를 분리해 확인했다.
- 연결된 CSS 6개, JavaScript 청크 25개, 주요 JSON 5개, OG 이미지, 부록 PDF의 역할을 확인했다.
- 원본 공개 페이지의 텍스트와 구조를 교차 확인했다.
- 저장된 스냅샷은 데스크톱 중간 스크롤 상태다. 모바일 화면은 CSS 미디어 쿼리와 클라이언트 코드 분기를 근거로 복원했다.
- 로컬 인앱 브라우저가 제공되지 않아 전 뷰포트의 실제 렌더링 스크린샷 비교는 수행하지 못했다. 이 보고서의 픽셀 값은 연결된 CSS와 실행 코드 기준이다.

---

## 1. 한눈에 보는 디자인 정체성

이 페이지는 일반적인 기업 랜딩 페이지가 아니라 **연구 결과를 이야기처럼 읽게 만드는 장문형 데이터 저널리즘(data story)**이다. 사용자가 81,000명 규모의 정성 조사라는 사실을 먼저 감각적으로 체험하고, 이후 범주별 정량 차트와 개인 인용문을 번갈아 읽도록 설계되어 있다.

핵심 디자인 원리는 다음과 같다.

1. **사람의 목소리를 먼저 제시한다.** 첫 화면은 통계 표가 아니라 지구본과 실제 응답자의 문장을 보여준다.
2. **좁은 글과 넓은 데이터 시각화를 교차한다.** 본문은 약 640px, 차트는 900~1,500px까지 확장한다.
3. **기대와 우려를 색으로 이원화한다.** 기대·효용은 녹색, 우려·위험은 파란색이다. 빨간색을 위험 색으로 쓰지 않아 차분하고 연구 보고서다운 인상을 유지한다.
4. **세리프와 산세리프의 역할을 분리한다.** 서사·인용문은 세리프, 제목·수치·레이블·컨트롤은 산세리프다.
5. **장식을 줄이고 데이터가 시각 자산 역할을 하게 한다.** 본문에 사진·영상·캔버스가 없으며, SVG 지구본·지도·차트가 화면의 주 시각 요소다.
6. **한 섹션에서 한 가지 질문만 답한다.** 카드 묶음보다 넓은 여백과 섹션 전환으로 리듬을 만든다.
7. **데스크톱에서는 비교와 탐색, 모바일에서는 순차 읽기**에 최적화한다. 같은 데이터를 단순 축소하지 않고 아코디언·카드·덤벨 차트로 재구성한다.

### 1.1 예상 독자와 사용 맥락

- AI 정책·연구·제품 관계자
- AI가 사회와 노동에 미치는 영향을 궁금해하는 일반 독자
- 긴 연구 논문을 직접 읽기 전 핵심 결과를 탐색하려는 독자
- 국가·지역·주제별 실제 인용문을 찾아보려는 언론·연구자

### 1.2 페이지가 유도하는 핵심 사용자 여정

`규모 체감 → 개별 목소리에 공감 → 연구 방법 이해 → 기대 범주 파악 → 실제 효용 확인 → 우려 파악 → 기대/우려의 공존 이해 → 지역 차이 탐색 → 인용문 원문 탐색 → 논문·부록 확인`

---

## 2. 전체 정보 구조

페이지는 아래 순서로 이어진다. 이 순서는 유사 사이트를 만들 때 그대로 재사용할 수 있는 강한 스토리텔링 골격이다.

| 순서 | 화면/섹션 | 전달하는 질문 | 주요 UI |
|---:|---|---|---|
| 1 | 글로벌 헤더 | 어디에 있고 다른 자료로 어떻게 이동하는가? | 고정 헤더, 드롭다운, 모바일 메뉴, Claude CTA |
| 2 | 스크롤 지구본 인트로 | 81,000명의 목소리는 얼마나 넓고 다양한가? | 대형 SVG 지구본, 타이핑 인용문, 스크롤 서사, 진행점 |
| 3 | 문제 제기와 연구 개요 | 이 조사는 무엇을 묻고 어떻게 진행했는가? | 좁은 본문, 큰 제목, 통계 설명 |
| 4 | 첫 Quote Wall 진입 | 실제 응답을 바로 탐색할 수 있는가? | CTA 카드, 모달 딥링크 |
| 5 | 방법론: 숲과 나무 | 정성 자료를 어떻게 정량화했는가? | 본문, 방법 설명, 부록 연결 |
| 6 | 사람들이 AI에 원하는 것 | 가장 큰 기대는 무엇인가? | 9행 가로 막대 차트 + 인용문 |
| 7 | 실제로 얻고 있는 것 | 현재 경험한 효용은 무엇인가? | 7행 가로 막대 차트 + 인용문 |
| 8 | 사람들이 우려하는 것 | 가장 큰 위험은 무엇인가? | 13행 가로 막대 차트 + 인용문 |
| 9 | 빛과 그늘 | 같은 사용자가 효용과 위험을 동시에 말하는가? | 5개 양면 누적 막대 비교 |
| 10 | 세계의 관점 차이 | 국가·지역별 태도는 어떻게 다른가? | 버블 지도, 국가 목록, 산점도 |
| 11 | 비전의 지역 차이 | 어떤 지역이 특정 기대에 더 공감하는가? | 양 지역 선택, 글로브 2개, slope/dumbbell 차트 |
| 12 | 우려의 지역 차이 | 어떤 지역이 특정 우려를 더 강하게 느끼는가? | 동일 비교 컴포넌트의 concern 모드 |
| 13 | 앞으로의 계획 | Anthropic은 연구 결과를 어떤 후속 행동에 반영하는가? | 서사 본문, 후속 연구·프로그램 링크 |
| 14 | 결론 | 연구가 제품·정책에 주는 함의는 무엇인가? | 요약 본문 |
| 15 | 자료와 인용 | 원문·저자·인용 형식·부록은 어디에 있는가? | Quote Wall CTA, 저자, BibTeX, PDF, 각주, 정정 |
| 16 | 글로벌 푸터 | 제품·연구·정책·약관으로 어떻게 이동하는가? | 다열 사이트맵, 소셜, 개인정보 설정 |

### 2.1 콘텐츠 블록 수와 구성

- 저장된 콘텐츠 모델에는 약 **132개 블록**이 있다.
- 시각화는 큰 범주로 다음과 같이 구성된다.
  - 가로 막대 차트 3개
  - 기대/우려 pairing 차트 5개
  - 인터랙티브 세계 지도 1개
  - 지역 산점도 1개
  - 지역 비교 차트 2개
  - Quote Wall 진입 카드 2개와 전역 모달 1개
- 본문에 `transcript` 블록 타입이 있지만 현재 렌더 함수는 빈 컨테이너만 반환한다. 구현 예정이거나 제거되지 않은 플레이스홀더로 보인다.

저장 DOM의 주요 요소 수는 다음과 같다. 이는 콘텐츠 모델의 개수가 아니라 캡처 시점에 실제 펼쳐진 DOM 기준이며, 반응형 중복 마크업과 D3/Lottie가 생성한 요소를 포함한다.

| 요소 | 수 | 해석 |
|---|---:|---|
| `h1` | 1 | 지구본 Hero 제목 |
| `h2` | 20 | 본문·차트 제목과 desktop/mobile 중복 일부 |
| `h3` | 14 | 비교 차트와 푸터 그룹 제목 |
| `blockquote` | 31 | 본문 대표 인용문 |
| `button` | 34 | 헤더, 지도, 차트, 복사 등 |
| `a` | 166 | 내비게이션, 딥링크, 푸터 |
| inline `svg` | 약 126 | 로고, 지도, 차트, 아이콘 |
| `input` | 0 | Quote Wall 모달이 닫힌 상태라 검색창 미렌더 |
| `img`, `video`, `canvas` | 0 | 본문 시각화는 SVG 기반 |
| `table` | 0 | 접근 가능한 표 대체가 없는 상태 |

### 2.2 화면 텍스트 인벤토리

저장된 한국어 DOM에는 번역 품질이 고르지 않다. 아래 표의 ‘화면 표시’는 분석 대상에 실제로 남아 있는 문구이며, 마지막 열은 같은 사이트를 다시 만들 때 쓸 수 있는 자연스러운 한국어 방향이다.

| 위치 | 화면 표시 | 구현용 권장 문구 |
|---|---|---|
| 문서 `<title>` | `81,000명이 AI \ Anthropic에서 원하는 것` | `81,000명이 AI에 바라는 것 - Anthropic` |
| Hero H1 | `81,000명` + 줄바꿈 + `AI에서 원합니다` | `81,000명이` + 줄바꿈 + `AI에 바라는 것` |
| 방법론 | `숲과 나무를 보는 것` | 그대로 사용 가능 |
| 비전 본문 | `사람들이 AI에 원하는 것` | `사람들이 AI에 바라는 것` |
| 비전 차트 | `사람들이 바라는 것` | 그대로 사용 가능 |
| 경험 본문 | `사람들이 원하는 것을 얻고 있습니까?` | `사람들은 원하는 것을 얻고 있을까?` |
| 경험 차트 | `AI가 그들의 비전을 실현한 곳` | `AI가 이미 도움을 주고 있는 영역` |
| 우려 본문 | `사람들이 우려하는 것` | 그대로 사용 가능 |
| 우려 차트 | `사람들이 걱정하는 것` | 그대로 사용 가능 |
| pairing | `빛과 그늘` | 그대로 사용 가능 |
| 지리 도입 | `전 세계에서 관점이 어떻게 달라지는가` | 그대로 사용 가능 |
| 산점도 모바일 | `AI SENTIMENT BY REGION` | `지역별 AI 부정 정서` |
| 비전 비교 질문 | `AI에 대한 특정 비전이 가장 공감되는 곳은 어디입니까?` | `각 AI 비전에 가장 공감하는 지역은 어디일까?` |
| 비전 비교 차트 | `최고의 비전` / `TOP VISIONS IN` | `주요 비전` / `지역별 주요 비전` |
| 우려 비교 질문 | `AI에 대한 특정 우려가 가장 공감되는 곳은 어디입니까?` | `각 AI 우려가 가장 크게 나타나는 지역은 어디일까?` |
| 우려 비교 차트 | `주요 관심사` / `TOP CONCERNS IN` | `주요 우려` / `지역별 주요 우려` |
| 전망 | `기대하고 있습니다` | `앞으로의 계획` 또는 `다음 단계` |
| 마무리 | `결론` | 그대로 사용 가능 |
| 인용 탐색 | `인용 벽` | `Quote Wall` 또는 `응답자 인용문 탐색` |
| 크레디트 | `저작자 및 감사의 글` | `저자 및 감사의 글` |
| 자료 | `부록`, `각주` | 그대로 사용 가능 |

- meta description, Open Graph, Twitter title과 description은 영어로 남아 있어 한국어 본문과 불일치한다.
- 본문과 차트가 비슷한 제목을 연속해서 쓰는 것은 의도적인 2단 구조다. 본문 H2는 연구 질문을 설명하고, 차트 H2는 시각화의 짧은 이름으로 기능한다.
- 새 사이트에서는 CMS에 `eyebrow`, `sectionHeading`, `chartTitle`, `summary`, `caption`, `accessibilitySummary`를 별도 필드로 두면 같은 뜻의 문구가 서로 어긋나는 일을 줄일 수 있다.

---

## 3. 페이지별 상세 분석

## 3.1 글로벌 헤더

### 구성

- 좌측: Anthropic 로고
  - 넓은 화면에서는 가로 워드마크 약 `143 × 16px`
  - 1,250px 미만에서는 약 `32px` 심볼 마크
- 중앙/우측 데스크톱 내비게이션:
  - `Research`
  - `Policy`
  - `Commitments`
  - `Learn`
  - `News`
  - `Try Claude`
- 저장된 한국어 화면에서는 각각 `연구`, `정책`, `약속`, `배우다`, `뉴스`, `Claude를 시도해 보세요`로 표시된다. `배우다`와 긴 CTA처럼 기계 번역 티가 나는 항목은 `학습`, `Claude 사용해 보기`처럼 메뉴 길이에 맞게 편집하는 편이 낫다.
- 우측 CTA는 `Try Claude`와 하위 메뉴 트리거가 결합된 split button 형태다.
- 950px 미만에서는 햄버거 메뉴와 전체 화면에 가까운 모바일 내비게이션 다이얼로그로 대체된다.

### 드롭다운 정보 구조

- Commitments: Constitution, Claude Corps, AI Exponential, Transparency, Responsible Scaling, Trust Center
- Learn: Academy, Tutorials, Use Cases, Engineering, Developer docs, About, Careers, Events
- Try Claude: Overview, Pricing, Contact Sales, 모델 목록, Claude.ai, Console
- 모바일 메뉴에는 Login과 앱 다운로드 진입도 노출된다.

### 시각 사양

- `position: sticky; top: 0; z-index: 9999`
- 높이:
  - 950px 미만: 약 `64px`
  - 950px 이상: 약 `68px`
- 세로 패딩: `16px`
- 이 페이지에서는 `body:has([data-page="clint"])` 선택자로 배경을 인트로와 같은 `#E8E6DC`로 강제해 지구본 화면과 하나의 평면처럼 보이게 한다.
- 메뉴 글자는 약 `15px` 산세리프, 메뉴 간격은 약 `24px`이다.
- CTA 높이는 `36px`이며, 검정 바탕/밝은 글자로 헤더의 가장 강한 액션을 만든다.

### 동작

- 데스크톱 드롭다운은 hover와 click을 모두 처리한다.
- 포인터가 벗어난 뒤 약 `200ms` 지연 후 닫혀 메뉴 항목으로 이동할 시간을 준다.
- `Escape`로 닫고 트리거로 포커스를 복원한다.
- 로고 애니메이션 라이브러리는 첫 스크롤 또는 `requestIdleCallback`의 최대 2초 timeout 뒤 GSAP, ScrollTrigger, Lottie를 동적 import한다. 화면 폭 870px 이하는 로드 조건이 아니라 애니메이션 방향·상태를 정하는 분기다.
- 모바일 메뉴는 `role="dialog"`, `aria-modal="true"`, body scroll lock을 사용한다. 다만 확인한 코드에서는 Escape 처리와 완전한 focus trap이 부족하다.

### 재구현 포인트

- 페이지별 헤더 배경은 `:has()`에만 의존하지 말고 라우트 레이아웃에서 theme prop 또는 CSS data attribute로 명시하는 편이 안정적이다.
- split button의 본 액션과 메뉴 열기 버튼을 실제로 두 개의 `<button>` 또는 `<a> + <button>`로 분리한다.
- 헤더 높이를 CSS 변수 `--header-height`로 제공해 모든 sticky 섹션이 같은 기준을 쓰게 한다.

---

## 3.2 스크롤 지구본 인트로

이 페이지의 정체성을 결정하는 핵심 구간이다. 단순 hero가 아니라 **자동 진행과 스크롤 진행을 결합한 2단계 scrollytelling 컴포넌트**다.

### 레이아웃

- 전체 스크롤 컨테이너 높이: `calc(200px + 10 * 100vh)`
- 내부 무대: 헤더 바로 아래에서 viewport에 고정되는 sticky 영역
- 지구본 SVG 기준 좌표계: `viewBox="0 0 1400 1000"`
- 지구 반지름: 약 `560`
- 배경: 따뜻한 회색 `#E8E6DC`
- 중앙에 거대한 옅은 구체와 위경도 그리드, 국가 윤곽, 녹색·파란색 응답자 점이 나타난다.
- 점 하나는 약 **응답자 4명**을 나타낸다.
- 텍스트는 지구본 위에 떠 있지만 카드나 불투명 패널로 감싸지 않는다.

### 1단계: 자동 인용문 시퀀스

- 11개의 국가 위치와 인용문을 순서대로 보여준다.
- 각 장면은 대략 7초 단위로 진행된다.
- 새 인용문은 약 `1,800ms` 기다린 뒤 초당 약 `65자` 속도로 타이핑된다.
- 현재 인용문에 해당하는 지도 점이 강조되고, 페이지 하단의 진행점도 함께 이동한다.
- 진행점 클릭 또는 `40px` 이상의 좌우 swipe로 앞뒤 인용문을 탐색할 수 있다.
- 기대 성격의 문장·강조는 녹색, 불안·우려 성격은 파란색이다.

### 2단계: 스크롤 서사

사용자가 아래로 스크롤하면 9개의 narrative slide가 나타나고 지구본의 회전과 강조점이 스크롤 진척도에 맞춰 보간된다. 각 슬라이드의 유효 길이는 약 `70vh`다.

서사의 순서는 다음과 같다.

1. 대규모 공개 인터뷰를 진행했다는 소개
2. 응답자들이 말한 희망
3. 미국 프리랜서가 9년 만에 문제 진단을 받은 사례
4. 나이지리아 창업자가 생계 악순환을 끊고 싶다는 사례
5. 희망과 함께 나타난 경고
6. AI 때문에 해고되었다는 미국 기술 지원 노동자의 사례
7. 초지능의 결과를 우려하는 한국 소프트웨어 엔지니어 사례
8. 희망과 경고가 동일한 개인 안에서도 공존한다는 전환
9. 계약 검토 시간을 줄이면서도 읽는 능력의 퇴화를 걱정하는 이스라엘 변호사 사례

### 인터랙션

- 데스크톱 2단계에서는 pointer drag로 지구본을 회전시킬 수 있다.
- 손을 놓으면 관성이 적용된다.
- 국가 hover 시 tooltip이 나타난다.
- coarse pointer 환경에서는 정밀한 드래그를 비활성화해 스크롤 충돌을 줄인다.
- `Jump to story` 버튼은 인트로 블록 끝으로 smooth scroll한다.
- `IntersectionObserver` 임계값 약 1%를 사용해 화면 밖에서는 requestAnimationFrame 루프를 정지한다.

### 타이포그래피

- 대형 제목: Anthropic Serif, `61px / 1.2`, weight 400
- 모바일 대형 제목: `32px`
- 인트로 보조문: Anthropic Sans, `13px / 1.5`, 최대 폭 약 `412px`
- 자동 인용문: Serif `26px / 1.4`; 모바일에서도 행간은 `1.4`, 크기는 `18px`
- 스크롤 서사: Serif `26px / 1.25`; 모바일에서도 행간은 `1.25`, 크기는 `18px`

### 구현 권장 구조

```tsx
<ScrollGlobeIntro
  quotes={introQuotes}
  narrativeSteps={steps}
  respondentPoints={points}
  pointUnit={4}
>
  <StickyStage>
    <GlobeScene />
    <TypewriterQuote />
    <NarrativeOverlay />
    <StepNavigation />
    <SkipToStoryButton />
  </StickyStage>
</ScrollGlobeIntro>
```

### 구현상 주의

- 애니메이션 시간의 기준을 각각의 DOM 이벤트에 흩뿌리지 말고 `phase`, `activeQuote`, `scrollProgress` 상태로 모델링한다.
- globe projection 계산, DOM 표시 상태, 콘텐츠 데이터를 분리한다.
- `prefers-reduced-motion: reduce`에서는 자동 진행·타이핑·관성을 끄고 첫 인용문과 정적 지도 또는 이전/다음 버튼만 제공해야 한다. 원본은 이 대응이 충분하지 않다.
- 탭이나 앱이 background 상태일 때 `visibilitychange`로 애니메이션을 정지한다.
- 진행점은 클릭 가능한 `<div>`가 아니라 `aria-label`이 있는 `<button>`이어야 한다.

---

## 3.3 연구 소개와 방법론 본문

### 내용

- 헤드라인은 마케팅 문구보다 연구 질문 자체를 내세운다.
- 조사 규모는 독자가 기억하기 쉬운 **81,000명**으로 반올림해 표현한다.
- 실제 참여자는 **80,508명**이며 각 사용자가 한 차례 인터뷰했다.
- **79,734**는 지역 비교 컴포넌트에서 `Global Average`의 응답자 수 `n`으로 표시된다. 전체 페이지의 단일 ‘핵심 분석 표본’이라고 단정할 근거는 저장 HTML에 없다.
- 조사 범위는 **159개국, 70개 언어**다.
- 원 데이터의 `byCountry`에는 **125개국 레코드**가 있고 캡처 UI에는 **`123 countries in view`**가 표시된다. 후자는 pan/zoom, geometry, 최소 n 필터 상태에 따른 동적 현재 화면 수이므로 고정 국가 범위로 해석하면 안 된다.
- 인터뷰어는 공통 질문을 제시한 뒤 각 응답을 바탕으로 맞춤형 후속 질문을 이어 갔다.
- Claude 기반 분류기는 대화를 비전, 비전 달성 여부, 우려, 언급된 직업, AI에 대한 전반적 정서 차원으로 분류했다.
- ‘AI에 원하는 것’은 응답자마다 하나의 주된 비전 범주를 부여했다. 우려는 한 사람이 여러 우려를 말할 수 있어 다중 라벨로 분류했다.
- 참여 전 연구 이용과 비식별 인용문 공개 가능성을 안내하고 동의를 받았다.
- 분석 전 모든 응답을 비식별화했으며, 게시 인용문은 식별 가능한 세부 정보를 제거하는 수동 검토를 한 번 더 거쳤다.
- 응답은 Claude만이 아니라 AI 사용 전반을 다루며, 다른 AI 제품명은 삭제·가림 처리했다.
- 방법론 섹션은 대규모 정성 응답을 범주화하면서도 개별 응답자의 맥락을 잃지 않으려는 접근을 설명한다. 이 때문에 섹션 제목이 ‘숲과 나무를 보는 것’이라는 비유를 사용한다.

### 문서형 레이아웃

- 기본 본문 폭: 최대 `640px`
- 본문 서체: Serif `17px / 30px`
- H2: Sans `28px / 44px`, weight 600
- H3: Sans `22px / 36px`
- H4: Sans `19px / 30px`
- 본문 문단 사이에는 충분한 세로 간격을 두되 별도 카드나 배경 박스를 사용하지 않는다.
- 큰 연구 질문과 데이터 시각화 앞에는 더 넓은 섹션 여백을 두어 장면 전환처럼 느껴지게 한다.

### 방법론의 편향과 한계

- 참여자는 임의의 일반 인구 표본이 아니라 **활발한 Claude 사용자**다. AI 친숙도와 태도가 일반 인구보다 긍정적으로 치우칠 수 있다.
- 인터뷰가 긍정적 비전 질문을 먼저 제시했기 때문에 뒤에 측정한 우려와 전반적 감정에 순서 효과가 생겼을 가능성이 있다.
- Claude가 분류와 대표 인용 추출에 사용되었으므로 사람의 코딩과 동일하다고 가정할 수 없다. 분류 검증 방법, 일치도, 오류 분석은 부록과 함께 확인해야 한다.
- 국가·지역별 표본 수 차이가 매우 크다. 비율만 비교하지 말고 `n`, 불확실성, 최소 표시 기준을 함께 제공해야 한다.

### 수치 표기 규칙

- 마케팅용 반올림 수치와 분석용 정확한 수치를 같은 문맥에서 구분해야 한다.
- 다음 관계를 각주나 방법론에 명시해야 혼란이 없다.
  - `81,000`: 대외 헤드라인용 반올림
  - `80,508`: 참여자 수이자 인터뷰 수; 각 사용자 1회 인터뷰
  - `79,734`: 지역 비교기의 전 세계 기준 `n`; 전체 분석 표본이라고 일반화하지 않음
  - `159`: 전체 조사 국가
  - `125`: `clintData.byCountry`의 국가 레코드 수
  - `123`: 캡처 시 `countries in view`; pan/zoom·geometry·filter에 따라 달라지는 동적 값

---

## 3.4 Quote Wall CTA 카드

본문 초반과 결론 이후에 같은 기능을 다른 CTA 문구로 두 번 제공한다. 첫 번째는 데이터 해석 전에 실제 목소리를 탐색하고 싶은 사용자를 위한 우회로이고, 두 번째는 글을 다 읽은 뒤 세부 자료로 들어가는 다음 단계다.

### 내용

- 제목: `Quote Wall`
- 설명 요지: 지역, 우려, 비전 등으로 전 세계 응답자의 목소리를 찾아볼 수 있음
- 첫 버튼: `See quotes`
- 두 번째 버튼: `Browse quotes`
- 한국어 스냅샷의 실제 카드 문구는 `인용 벽`, 첫 버튼 `인용문 보기`, 두 번째 버튼 `인용구 찾아보기`다. 다른 위치에서는 quote가 ‘견적’ 계열로도 오역된다. 재구현에서는 제품명처럼 `Quote Wall`을 유지하거나 `응답자 인용문 탐색`으로 통일하는 편이 낫다.

### 시각 사양

- 최대 폭: `640px`
- 배경: `#F5F4ED`
- 테두리: `1px solid #DEDCD1`
- 모서리: `16px`
- 모바일: 패딩 `24px`, 세로 배치, 간격 `24px`
- 데스크톱: 패딩 `40px`, 텍스트와 버튼 가로 배치
- 제목: `18px`에서 데스크톱 `22px`
- 설명: Serif `16px`에서 데스크톱 `18px`
- 버튼: 높이 `40px`, 좌우 패딩 `24px`, 검정 배경, 반경 `10px`

### 동작

- CTA를 누르면 `window.location.hash = "quotes"`가 설정된다.
- 별도 라우트 이동 없이 portal 기반 전역 모달이 열린다.
- URL hash에 필터를 포함해 특정 인용문 묶음으로 직접 연결할 수 있다.

```text
#quotes?region=<region>
#quotes?vision=vision_<slug>
#quotes?concern=<slug>
#quotes?tag=experience_<slug>
```

---

## 3.5 가로 막대 차트 1: 사람들이 AI에 원하는 것

### 데이터

| 순위 | 범주 | 비율 | 의미 요약 |
|---:|---|---:|---|
| 1 | 전문성 우수성 | 18.8% | 반복 업무를 줄이고 더 의미 있고 수준 높은 일을 수행 |
| 2 | 개인 변신 | 13.7% | 성장, 웰빙, 코칭, 자기 변화 |
| 3 | 생활 관리 | 13.5% | 정리, 계획, 인지적 보조, 일상 관리 |
| 4 | 시간의 자유 | 11.1% | 시간을 되찾고 원하는 활동에 집중 |
| 5 | 재정적 독립 | 9.7% | 경제적 안정과 선택권 확보 |
| 6 | 사회 변혁 | 9.4% | 사회 문제 해결과 제도 개선 |
| 7 | 기업가 정신 | 8.7% | 사업 시작, 운영, 확장 |
| 8 | 학습 및 성장 | 8.4% | 개인화 학습과 역량 개발 |
| 9 | 창의적 표현 | 5.6% | 아이디어를 실제 창작물로 구현 |

- 약 1%는 뚜렷한 AI 비전을 말하지 않았다.
- 범주 이름만 보여주지 않고 각 행을 활성화하면 정의와 대표 인용문을 함께 제공한다.

### 색과 막대

- 1위 강조: `#81B806`
- 나머지: `#BFDE8D`
- 폭은 절대 백분율이 아니라 **현재 차트의 최댓값에 대한 상대 폭**이다.
  - 18.8%인 첫 행이 100% 폭
  - 다른 행은 `value / 18.8 * 100%`
- 실제 백분율은 막대 밖 또는 오른쪽의 고정 폭 숫자 열에 별도로 표시한다.
- 막대 모서리 `8px`, 내부 패딩 약 `8px 16px`
- 백분율 열 폭 약 `51px`

---

## 3.6 가로 막대 차트 2: 사람들이 실제로 얻고 있는 것

| 순위 | 범주 | 비율 | 의미 요약 |
|---:|---|---:|---|
| 1 | 생산성 | 32.0% | 일을 더 빠르고 효율적으로 수행 |
| 2 | 아직 효용을 얻지 못함 | 18.9% | 기대한 성과를 경험하지 못함 |
| 3 | 인지적 파트너십 | 17.2% | 사고 확장, 아이디어 검토, 문제 해결 동반자 |
| 4 | 학습 | 9.9% | 설명, 튜터링, 기술 습득 |
| 5 | 기술적 접근성 | 8.7% | 전문 기술 없이도 복잡한 작업 수행 |
| 6 | 연구 종합 | 7.2% | 정보 수집, 비교, 요약 |
| 7 | 정서적 지원 | 6.1% | 대화, 위로, 자기 성찰 지원 |

- 본문이 ‘여섯 영역’을 언급하는 것은 효용을 얻은 6개 범주를 뜻하며, 시각화에는 ‘아직 효용을 얻지 못함’ 행을 포함해 7행이 나타난다.
- 원본 한국어의 `AI가 전달하지 않았습니다`는 영어 `hasn't delivered`의 직역 오류다. `아직 기대한 효용을 얻지 못함`처럼 의미 중심으로 번역해야 한다.
- 색상:
  - 생산성 1위: `#81B806`
  - 미달성 행: 중립 회색 `#CFCEC8`
  - 나머지 효용: `#BFDE8D`

---

## 3.7 가로 막대 차트 3: 사람들이 우려하는 것

| 순위 | 범주 | 비율 | 의미 요약 |
|---:|---|---:|---|
| 1 | 신뢰성 부족 | 26.7% | 오답, 환각, 일관성 부족 |
| 2 | 일자리와 경제 | 22.3% | 실직, 임금, 경제적 불평등 |
| 3 | 자율성과 주체성 | 21.9% | 인간의 판단·통제·선택권 약화 |
| 4 | 인지 위축 | 16.3% | 사고, 기억, 읽기, 문제 해결 능력의 퇴화 |
| 5 | 거버넌스 | 14.7% | 규칙, 책임, 권력 집중, 감독 부족 |
| 6 | 잘못된 정보 | 13.6% | 허위 정보 생성과 확산 |
| 7 | 감시 및 개인정보 보호 | 13.1% | 데이터 수집, 추적, 프라이버시 침해 |
| 8 | 악의적 사용 | 13.0% | 사기, 공격, 범죄 목적 사용 |
| 9 | 의미와 창의성 | 11.7% | 인간 창작과 일의 의미 약화 |
| 10 | 과도한 제한 | 11.7% | 지나친 안전 제한, 접근·표현 제약 |
| 11 | 웰빙 및 의존성 | 11.2% | 정서적 의존과 건강 영향 |
| 12 | 아첨·영합 | 10.8% | 사용자가 듣고 싶은 말만 강화하는 경향 |
| 13 | 존재적 위험 | 6.7% | 인류 수준의 통제 상실과 파국적 위험 |

- 응답자는 평균 **2.3개의 우려**를 말했다.
- 약 **11%**는 별도 우려를 표현하지 않았다.
- 긴 꼬리 범주도 본문에서 보완한다.
  - 편향·차별 약 5%
  - 지식재산·데이터 약 4%
  - 환경 영향 약 4%
  - 아동·취약 계층 약 3%
  - 민주주의 약 3%
  - 지정학 약 2%
- 첫 행은 `#86B6EF`, 나머지는 `#CDE2FB`를 사용한다.
- 원본 한국어의 `아시`는 `sycophancy` 번역 오류로 보인다. `아첨·영합`이 적절하다.

### 세 가로 막대 차트의 공통 인터랙션

#### 데스크톱: 1,091px 이상

- 처음에는 1위 행이 활성 상태다.
- 막대에 mouseenter하거나 행을 click하면 해당 행 설명이 나타나고 우측 대표 인용문이 교체된다. 원본 행에는 `tabindex`나 `onFocus`가 없어 keyboard focus만으로는 활성화되지 않는다.
- 1,291px 이상:
  - 전체 폭 최대 `920px`
  - 좌우 `1fr / 1fr`
  - gap `48px`
- 1,091~1,290px:
  - 전체 폭 최대 `740px`
  - 좌우 `3fr / 2fr`
  - gap `32px`

#### 모바일·태블릿: 1,090px 이하

- 단일 열로 전환한다.
- 행을 누르면 정의와 인용문이 해당 행 바로 아래에서 accordion으로 열린다.
- 높이는 `grid-template-rows: 0fr → 1fr` 방식으로 전환해 내용 길이에 대응한다.
- 데스크톱의 hover 정보가 모바일에서 사라지지 않게 콘텐츠 위치 자체를 바꾼 좋은 사례다.

### 재구현 시 개선

- 행 전체를 클릭 가능한 `<div>`로 만들지 말고 실제 `<button aria-expanded aria-controls>`을 사용한다.
- 데스크톱에서도 hover뿐 아니라 keyboard focus와 click으로 활성화되어야 한다.
- 막대 폭이 상대 스케일임을 caption 또는 접근 가능한 설명으로 명시한다. 그렇지 않으면 18.8%가 화면 폭 100%인 것을 100% 응답으로 오인할 수 있다.
- 대표 인용문 fallback을 client effect에서 무작위로 선택하므로 hydration 불일치는 아니지만 재마운트할 때 문장이 달라지는 비결정성이 생긴다. 데이터에 고정 대표 ID를 저장하는 편이 재현성과 테스트에 유리하다.

---

## 3.8 ‘빛과 그늘’ pairing 차트

같은 응답에서 나타난 이점과 위험을 좌우로 짝지어 보여준다. 단순히 긍정/부정 집단을 나누는 대신 **한 사람이 둘을 동시에 경험할 수 있다**는 연구의 중심 메시지를 시각화한다.

### 다섯 쌍의 데이터

| 이점 | 전체 | 이미 경험 | 기대 | 위험 | 전체 | 이미 경험 | 예상 |
|---|---:|---:|---:|---|---:|---:|---:|
| 학습 | 33% | 30% | 3% | 인지 위축 | 17% | 8% | 9% |
| 더 나은 의사결정 | 22% | 19% | 3% | 신뢰성 부족 | 37% | 29% | 8% |
| 정서적 지원 | 16% | 13% | 3% | 의존성 | 12% | 5% | 7% |
| 시간 절약 | 50% | 37% | 13% | 허상적 생산성 | 18% | 17% | 1% |
| 경제적 역량 강화 | 28% | 19% | 9% | 일자리 대체 | 18% | 4% | 14% |

- 다섯 쌍 가운데 `신뢰성 부족 37%` 대 `더 나은 의사결정 22%`만 위험 총량이 이점보다 크다.
- 정서적 지원과 의존성은 함께 언급될 가능성이 약 3배 높아 가장 강한 공발생 관계로 설명된다.
- 실제 데이터에는 소수점 값이 있지만 화면에서는 정수로 반올림한다.

### 시각 사양

- 전체 최대 폭: `900px`
- 좌측 이점: 녹색 계열
  - 밝은 `#BFDE8D`
  - 강한 `#81B806`
- 우측 위험: 파란색 계열
  - 강한 `#86B6EF`
  - 밝은 `#CDE2FB`
- 막대 높이: 모바일 기본 `32px`, 768px 이상 `40px`
- 다섯 블록의 최대 합을 공통 기준으로 사용해 서로 비교할 수 있다.
- 각 막대는 `already lived`와 `hypothetical/future`를 누적으로 나눈다.
- 환산 폭이 약 8% 미만인 작은 segment의 숫자는 막대 안이 아니라 밖에 놓아 겹침을 피한다.
- 인용문:
  - 데스크톱 Serif `22px / 32px`
  - 모바일 `16px / 24px`

### 반응형

- 768px 이상: 좌우 2열, 가운데 기준선을 두고 mirror 구조, gap `16px`
- 767px 이하: 한 열, gap `32px`, 막대와 텍스트 방향을 읽기 순서에 맞게 재배치
- 모바일에서 단순히 CSS transform으로 좌우를 뒤집으면 스크린 리더 순서와 화면 순서가 달라질 수 있으므로 DOM 순서를 의미 순서로 유지한다.

---

## 3.9 세계 감정 버블 지도

### 시각 구조

- D3 `geoNaturalEarth1()` 투영을 사용한다.
- 기본 SVG 크기: `960 × 500`
- 실제 렌더 폭:
  - 데스크톱 최대 `1,150px`, 보통 컨테이너의 80%
  - 모바일 100%, 높이 약 `300px`
- 남극은 제외된다.
- 국가 중심점 주변에 응답자 규모를 나타내는 버블을 놓고 force-collision을 약 60 tick 적용해 겹침을 줄인다.
- 버블 반지름은 표본 수의 제곱근 비례이며 코드상 대략 1~48 범위다.
- 원은 무작위 0~900ms delay 후 약 250ms 동안 나타난다.

### 색 기준

전역 평균 감정 점수 약 `0.669`를 기준으로 ±`0.02` 허용 범위를 둔다.

| 상태 | 의미 | 색 |
|---|---|---|
| 평균보다 낮음 | 상대적으로 덜 긍정적 | 파랑 `#9EC5F4` |
| 평균 부근 | 전역 평균과 유사 | 회색 `#B0AEA5` |
| 평균보다 높음 | 상대적으로 더 긍정적 | 녹색 `#81B806` |

### 표본 예시

| 국가 | 표본 수 | 긍정 감정 |
|---|---:|---:|
| 미국 | 21,013 | 66% |
| 일본 | 4,960 | 69% |
| 대한민국 | 4,559 | 61% |
| 인도 | 3,793 | 70% |
| 독일 | 3,761 | 64% |
| 브라질 | 3,012 | 71% |

### 인터랙션

- hover: 국가명, 표본 수, 감정 수치 tooltip
- touch: tap으로 tooltip 고정
- drag/pinch: pan 및 zoom
- scale extent: `1x`~`12x`
- wheel zoom은 의도적으로 비활성화해 페이지 스크롤을 방해하지 않는다.
- `+`/`−`: `1.5배` 단위, 약 `300ms` 전환
- reset와 double-click: identity transform으로 약 `500ms` 전환
- 모바일에서는 지도만으로 정밀 선택하기 어려우므로 12개 지역 accordion 아래 현재 view 국가 목록을 제공한다. 캡처 시 표시는 123개국이며 원 데이터에는 125개국 레코드가 있다.
- 코드에는 sentiment/difference를 버블 크기 기준으로 쓰는 모드도 남아 있으나 현재 화면에는 선택 컨트롤이 없고 respondent count 모드로 고정되어 있다.

### 데이터 해석상 주의

- 본문은 조사 범위 159개국을 언급하고, 원 데이터는 125개국 레코드를 가지며, 캡처 UI는 현재 view 123개국을 표시한다. 이 세 수치의 의미와 pan/zoom·filter에 따른 동적 count를 caption에 구분해야 한다.
- 원본 문구에는 ‘60% 아래인 나라가 없다’는 취지의 설명이 있지만 실제 목록에는 브루나이 55%, 캄보디아·헝가리 57%, 보츠와나·모리셔스 58%가 있다. 문구 또는 데이터 버전이 어긋난 것으로 보이므로 재사용하면 안 된다.
- 원본 코드는 기본 최소 표본 임계값이 1로 보이지만 공개 설명과 데이터 선택 기준은 별도로 확인해야 한다. 낮은 n의 국가는 신뢰구간 또는 최소 표본 경고가 필요하다.

### 접근성 대체

- 지도 SVG에 `<title>`과 `<desc>`를 제공한다.
- 지도 뒤에 같은 데이터를 담은 정렬 가능한 표 또는 지역별 목록을 제공한다.
- 버블 색만으로 상태를 구분하지 말고 tooltip·표에 ‘평균보다 높음/비슷함/낮음’을 텍스트로 표시한다.
- 줌 버튼은 기호 `+`, `−`, `↺`만 두지 말고 `aria-label="지도 확대"`처럼 이름을 제공한다.

---

## 3.10 지역 산점도

### 목적

12개 지역에서 `일자리·경제 우려 비율`과 `AI에 대한 부정 정서`의 관계를 보여준다. 원본 UI 일부는 y축을 `AI sentiment`라고만 써 긍정 지표처럼 보이지만 실제 계산은 `1 - 해당 지역의 긍정 정서 비율`, 즉 지역별 **부정 정서**다.

### 지역별 데이터

| 지역 | 부정 정서 | 일자리·경제 우려 |
|---|---:|---:|
| 서유럽 | 35.6% | 22.5% |
| 오세아니아 | 35.5% | 24.3% |
| 북미 | 34.5% | 24.6% |
| 동아시아 | 34.5% | 21.9% |
| 남·동유럽 | 34.0% | 22.1% |
| 중앙아시아 | 31.1% | 15.9% |
| 남아시아 | 30.8% | 21.5% |
| 북아프리카 | 30.6% | 18.2% |
| 중동 | 29.2% | 19.9% |
| 동남아시아 | 28.3% | 19.3% |
| 라틴아메리카·카리브 | 26.3% | 18.5% |
| 사하라 이남 아프리카 | 24.2% | 18.2% |

### 데스크톱: 567px 이상

- 컨테이너 최대 폭: `920px`
- SVG `viewBox="0 0 700 500"`
- x축: 일자리·경제 우려
- y축: AI 부정 정서
- 버블 크기: 지역 표본 수, 반지름 약 7~25px
- 점 색: 녹색과 파란색으로 상대 위치를 구분
- 평균선을 점선으로 그어 사분면을 만든다.
- 사분면 배경:
  - 푸른 영역 `#F0F7FE`
  - 녹색 영역 `#E6F1D5`
- 그리드 `#CCC8BE`
- Delaunay/Voronoi를 이용해 pointer hit area와 라벨 배치 방향을 안정화한다.
- hover 시 지역 이름과 두 지표 값을 tooltip으로 표시한다.

### 모바일: 566px 이하

- 산점도를 억지로 축소하지 않고 12개 지역 카드형 목록으로 바꾼다.
- 각 카드에 두 개의 수평 막대를 표시한다.
- 상단 segmented control로 `AI sentiment` 또는 `Econ concern` 순 정렬을 선택한다.
- 재구현에서는 첫 레이블을 `AI 부정 정서`로 고쳐 지표 방향을 명확히 해야 한다.

---

## 3.11 지역 비교 차트 2종

첫 차트는 AI 비전, 두 번째 차트는 우려 범주를 두 지역 사이에서 비교한다.

### 표본 수

| 지역 | n |
|---|---:|
| 전 세계 | 79,734 |
| 북미 | 23,480 |
| 라틴아메리카·카리브 | 8,051 |
| 동아시아 | 10,175 |
| 동남아시아 | 2,805 |
| 남아시아 | 4,523 |
| 중앙아시아 | 310 |
| 중동 | 1,911 |
| 북아프리카 | 569 |
| 사하라 이남 아프리카 | 1,628 |
| 오세아니아 | 1,821 |
| 서유럽 | 15,134 |
| 남·동유럽 | 9,323 |

### 데스크톱 레이아웃

- 전체 최대 폭: `1,500px`
- 높이: `min(85vh, 620px)`
- 좌우에 선택 지역을 가리키는 글로브 2개가 각각 약 86% 크기로 배치된다.
- 중앙 비교 패널은 화면 폭의 약 54%, `min-width: 460px`, `max-width: 680px`
- slope line 중앙 여백은 약 `120px`
- 양끝 글로브 위에 그라데이션 veil을 얹어 중앙 데이터가 우선 보이게 한다.
- 각 행은 왼쪽 지역 비율과 오른쪽 지역 비율을 선으로 연결한다.
- 값의 분포가 넓어 위치 계산은 로그 축을 사용한다.
- 상대 차이가 ±20% 이상이면 우세한 쪽을 짙은 지역 색으로 강조한다.
- 행 hover 시 관련 없는 행을 흐리게 한다.

### 컨트롤과 애니메이션

- 왼쪽·오른쪽 각각 dropdown과 이전/다음 화살표가 있다.
- 현재 반대쪽에서 선택한 지역은 dropdown에서 disabled 처리한다.
- 화살표 이동도 반대쪽 지역을 건너뛴다.
- 선택 시 글로브가 해당 지역으로 약 `700ms` 회전한다.
- slope/dumbbell 값도 약 `700ms cubic-out`으로 전이한다.

### 반응형

- 900px 이하: 장식적 글로브 제거, 중앙 비교 차트에 집중
- 640px 이하:
  - 데스크톱 overlay를 숨김
  - 두 개 dropdown을 상단에 배치
  - `ResizeObserver`로 실제 폭을 측정한 모바일 dumbbell chart 사용

### 원본의 상태 불일치

- 첫 비전 비교의 데스크톱 우측 트리거 텍스트는 ‘사하라 이남 아프리카’인데 표시 비율은 동아시아와 일치하고 모바일 트리거는 동아시아로 표시된다.
- 실행 코드는 데스크톱과 모바일에 동일한 left/right React state를 공유하므로 독립 상태 버그로 볼 근거는 없다. 브라우저 번역의 DOM mutation이나 전환 중 캡처 때문에 생긴 스냅샷 이상일 가능성이 크다.
- 재구현에서도 선택 상태는 공유하고 표현 레이어만 viewport에 따라 바꾼다. 스냅샷의 불일치를 원래 의도한 초기 상태로 모사하지 않는다.

---

## 3.12 Quote Wall 전역 탐색 모달

저장 스냅샷에서는 닫혀 있어 모달 DOM이 없지만 연결된 컴포넌트와 620개 인용문 JSON에서 전체 동작을 확인할 수 있다.

### 콘텐츠와 데이터

- 제목: `Selected voices from 81,000 conversations about AI`
- 설명은 지역별 표본에서 선택했으며 익명성·명료성을 위해 일부 문구와 제품명을 편집했고, 견해는 응답자 개인의 것임을 밝힌다.
- 별도의 `Read privacy disclaimer` 다이얼로그가 있다.
- 각 인용문 데이터 필드:
  - 본문 `text`
  - 국가 `country`
  - 지역 `region`
  - 응답자 설명 `user_description`
  - 기억도/대표성 점수 `rough_mem_score`
  - 분류 태그 `tags`
  - 긍정·부정 감정과 강조 여부는 별도 원시 field가 아니라 `tags`의 `positive_sentiment`, `negative_sentiment`, `highlighted`에서 파생

### 탐색 UI

- 분류 방식 radio/segmented control:
  - Region
  - Vision
  - Experience
  - Concern
- 검색 placeholder: `Search quotes...`
- 검색 대상: 인용문 본문, 국가, 응답자 설명
- 데스크톱:
  - 좌측 category sidebar
  - 우측 scroll section
  - `IntersectionObserver`로 현재 보고 있는 섹션에 따라 sidebar active 상태 동기화
- 모바일:
  - sidebar 대신 category dropdown
- 카드는 `grid-template-columns: repeat(auto-fill, minmax(240px, 1fr))` 형태다.
- 각 범주 대표 카드는 너무 긴 문장만 선택되지 않도록 길이가 짧은 6개 후보 중 기억도 점수가 가장 높은 항목을 고른다.
- 나머지는 작은 카드로 표시하고, 문장 길이에 따라 글자 크기를 조정한다.
- 검색 결과가 없으면 empty state 메시지를 보여준다.

### 상세 보기

- 카드를 누르면 quote detail overlay가 열린다.
- 닫기, 이전, 다음 버튼 제공
- 키보드:
  - `ArrowLeft`: 이전
  - `ArrowRight`: 다음
  - `Escape`: 개인정보 다이얼로그 → 상세 overlay → 전체 Quote Wall 순으로 가장 위 레이어부터 닫음
- 전체를 닫을 때 `history.pushState`로 hash를 제거한다.

### 현재 문제와 개선안

- 모달을 열기 전부터 218KB 규모의 620개 인용문 JSON을 fetch한다. CTA 클릭 시 동적 import/fetch하는 편이 낫다.
- 한국어 페이지에서도 모달의 UI 문구가 대부분 영어다. locale 문자열을 컴포넌트 내부에 하드코딩하지 말고 번역 리소스로 분리한다.
- quote card가 클릭 가능한 `<div>`다. `<button>` 또는 상세 페이지 `<a>`로 바꿔야 한다.
- 전체 overlay와 세부 overlay에 `role="dialog"`, `aria-modal`, 초기 포커스, focus trap, 종료 후 trigger focus 복귀가 필요하다.
- 모달이 열릴 때 배경에 `inert`와 body scroll lock을 적용한다.
- 분류 control에는 `aria-pressed` 또는 실제 radio semantics가 필요하다.
- 검색창에는 placeholder 외에 시각적으로 숨긴 `<label>`이 필요하다.

---

## 3.13 결론, 저자, 인용 형식, 부록

### 마무리 흐름

1. ‘기대하고 있습니다’ 섹션에서 연구가 Anthropic의 후속 행동에 어떻게 반영되는지 설명한다.
   - 소수의 Claude 사용자를 대상으로 웰빙 영향을 살피는 다음 Anthropic Interviewer 연구
   - AI for Science 및 비영리 파트너와의 유익한 배포 프로그램
   - 부정적 경제 영향에 관한 우려를 후속 연구와 판단 갱신에 반영
2. 결론에서 사람들의 기대와 우려가 동시에 존재하며 제품·정책 설계가 둘을 함께 다뤄야 한다는 함의를 제시한다.
3. 두 번째 Quote Wall CTA로 다시 실제 목소리를 탐색하게 한다.
4. 저자 목록, BibTeX 인용, 부록 PDF, 각주, 정정 공지를 제공한다.

### 메타 정보

- 발행일: 2026-03-18
- 정정일: 2026-03-19
- 부록 PDF는 Sanity CDN 파일로 연결된다.
- 코드 블록에는 clipboard copy 버튼이 있고 성공 아이콘을 약 2초 보여준다.
- 저장된 화면에서는 코드 블록이 기본 펼침 상태이며 높이 약 `304px`라 별도 펼치기 버튼이 없다.

### 실제 크레디트 구성

| 역할 | 이름 |
|---|---|
| 프로젝트 리드, 분석 설계·시작, 글 작성 | Saffron Huang |
| 데이터 시각화 리드, 인터랙티브 기사 프로토타입, 분석 | Shan Carter |
| 편집 개발 | Jake Eaton |
| 커뮤니케이션 전략 | Sarah Pollack |
| 프로덕션 기사 구현 | Dexter Callender III |
| 디자인 | Nikki Makagiansar, Maria Gonzalez, Kelsey Nanan, Jerry Hong |
| 편집 자문 | Sylvie Carr |
| 분석 지원 | Miles McCain, Kunal Handa |
| Claude.ai 내 Anthropic Interviewer 구현 | Grace Yun, AJ Alt, Thomas Millar |
| 조사·경험 디자인 | Chelsea Larsson, Jane Leibrock, Matt Gallivan |
| 데이터 처리·클러스터링 인프라 | Theodore Sumers |
| 피드백·방향·조직 지원 | Jack Clark, Michael Stern, Deep Ganguli |

- BibTeX의 author 필드는 위 기여자에 Mo Julapalli, Esin Durmus, Matt Kearney, Judy Hanwen Shen을 포함한 25명을 열거한다.
- citation key는 `huang2026interviewer`, title은 `What 81,000 People Want from AI`, canonical URL은 `https://anthropic.com/features/81k-interviews`다.
- 각주는 비교 가능한 대형 정성 연구 사례로 USC Shoah Foundation Visual History Archive와 World Bank `Voices of the Poor Project`를 들며, 두 연구 모두 약 60,000명 규모라고 설명한다.
- 2026-03-19 정정은 ‘전 세계 사람의 67%가 AI를 긍정적으로 본다’는 일반화에서 ‘인터뷰 대상자의 67%가 순긍정 정서를 표현했다’는 표본 한정 표현으로 바뀌었다. 이는 연구 대상과 일반 인구를 구분하기 위한 중요한 수정이다.

### 구현 권장

- 연구 페이지라면 화면 하단에 다음을 구조화해 제공한다.
  - 연구 제목과 발행일
  - 저자 및 소속
  - DOI 또는 canonical URL
  - BibTeX/APA/Chicago 형식 복사
  - 방법론과 부록 다운로드
  - 데이터 공개 범위와 개인정보 처리 설명
  - 정정 이력 changelog
- 복사 성공 상태는 색·아이콘만 바꾸지 말고 `aria-live="polite"`로 알려야 한다.

---

## 3.14 글로벌 푸터

### 시각 사양

- 배경: `#141413`
- 기본 글자: `#FAF9F5`
- 보조 링크: `#B0AEA5`
- 내부 최대 폭: `1,400px`
- 모바일: 세로 스택
- 992px 이상: 사이트맵 링크 영역 내부가 2열로 전환
- 1,024px 이상: 로고·소셜 영역과 사이트맵이 좌우로 나뉘며, 왼쪽은 3열 분량, 오른쪽은 4열 분량의 촘촘한 grid
- 항목 간 세로 간격 약 `12px`, 그룹 제목과 링크 목록 간격 약 `16px`, 큰 그룹 간격 약 `64px`
- 푸터 링크는 약 `12px / 140%`

### 정보 구조

푸터는 단순 법적 링크가 아니라 회사 전체 사이트맵이다.

| 그룹 | 포함 내용 |
|---|---|
| Product | Claude, Claude Code, Enterprise, Cowork, @Claude, Design, Science, Security, Chrome, Microsoft 365, Skills, 앱, 가격, 로그인 |
| Models | Mythos, Fable, Opus, Sonnet, Haiku |
| Solutions | AI agents, 코드 현대화, 코딩, 고객 지원, 보안, 엔터프라이즈, 금융, 정부, 의료, 교육, 법률, 생명과학, 비영리, 중소기업 |
| Platform | 개요, 개발 문서, 가격, 생태계, Marketplace, 지역 규정 준수, AWS, Google Cloud, Microsoft Foundry, Console |
| Resources | 블로그, 파트너, 커뮤니티, Connectors, Academy, 고객 사례, Engineering, 이벤트, Plugins, Powered by Claude, 서비스 파트너, 튜토리얼, 사용 사례 |
| Programs | Startups, Research Labs |
| Help & Security | Availability, Status, Support |
| Company | Anthropic, Careers, Policy, Economic Futures, Research, News, Constitution, Claude Corps, Keep Thinking, AI Exponential, Responsible Scaling, Trust Center, Transparency |
| Terms | 개인정보, 건강정보 개인정보, 취약점 공개, 상업·소비자·K-12 약관, DPA, 이용 정책 |

- 하단에 Privacy Choices, 2026 저작권, LinkedIn·X·YouTube가 있다.
- 링크 수가 많으므로 모바일에서는 그룹별 accordion을 고려할 수 있으나, 원본의 단순 세로 목록도 검색성과 접근성 면에서는 예측 가능하다.

## 3.15 주요 링크 목적지

| 화면 역할 | 표시 예 | 목적지 |
|---|---|---|
| 본문 skip link | `주요 콘텐츠로 건너뛰기` | `#main-content` |
| 푸터 skip link | `푸터로 이동` | `#footer` |
| 헤더 1차 메뉴 | `연구`, `정책`, `뉴스` | `/research`, `/policy`, `/news` |
| 헤더 학습 계열 | Constitution, Learn, Engineering, Events | `/constitution`, `/learn`, `/engineering`, `/events` |
| 제품 CTA | `Claude를 시도해 보세요` | `https://claude.ai/` |
| 조사 방법 | Anthropic Interviewer | [Anthropic Interviewer 연구](https://www.anthropic.com/research/anthropic-interviewer) |
| 복지 관련 맥락 | 사용자 복지 보호 | [Protecting the well-being of our users](https://www.anthropic.com/news/protecting-well-being-of-users) |
| 후속 경제 연구 | 경제적 영향에 관한 판단 갱신 | [Economic policy responses](https://www.anthropic.com/research/economic-policy-responses) |
| 경제 데이터 | Economic Index | [Anthropic Economic Index](https://www.anthropic.com/economic-index) |
| 세부 인용 | 범주별 ‘더 읽기’ | `#quotes?vision=…`, `#quotes?tag=…`, `#quotes?concern=…` |
| 연구 부록 | `부록`, `여기에서` | Sanity CDN PDF |
| 제품 푸터 | Claude, Code, Cowork, Solutions, Platform | 주로 `https://claude.com/...` |
| 개발자 푸터 | 개발 문서, Console | `https://platform.claude.com/docs`, `https://platform.claude.com/` |
| 회사·정책 푸터 | Company, Research, Legal | 주로 `https://www.anthropic.com/...` 또는 내부 `/...` |
| 운영·신뢰 푸터 | Status, Support, Trust Center | `status.anthropic.com`, `support.claude.com`, `trust.anthropic.com` |

- 저장 DOM 일부 `Claude.ai` 본문 링크는 `http://claude.ai` 또는 대문자가 섞인 `http://Claude.ai`다. 구현 시 `https://claude.ai/`로 정규화해야 한다.
- 제품은 `claude.com`, 기업·연구·정책은 `anthropic.com`, 개발자 도구는 `platform.claude.com`으로 도메인 역할을 나눈다. 새 사이트에서도 링크의 정보 소유권을 일관되게 나누면 대규모 푸터를 관리하기 쉽다.

---

## 4. 시각 디자인 시스템

## 4.1 색상 토큰

### 기본 표면과 텍스트

아래 CSS 변수명은 색의 역할을 설명하기 위한 **재구현 권장 이름**이며 원본 변수명을 옮긴 것이 아니다. 예를 들어 원본의 `--border-strong` 값은 `#141413`이고, 아래 `#C2C0B6`은 원본 팔레트에서 slate 계열 경계색이다.

| 역할 | 값 | 사용 |
|---|---|---|
| `--surface-page` | `#FAF9F5` | 일반 본문 배경 |
| `--surface-intro` | `#E8E6DC` | 헤더와 지구본 인트로 |
| `--surface-panel` | `#F0EEE6` | 보조 패널 |
| `--surface-panel-soft` | `#F5F4ED` | Quote CTA 등 |
| `--surface-tooltip` | `#FFFFFF` | 일부 tooltip |
| `--surface-overlay` | `#FAF9F5` | Quote Wall lightbox, 일부 dropdown |
| `--surface-dialog-card` | `#F5F4ED` | quote detail·privacy 카드 |
| `--text-primary` | `#141413` | 본문·제목 |
| `--text-secondary` | `#30302E` | 보조 본문 |
| `--text-muted` | `#5E5D59` | 설명 |
| `--text-meta` | `#87867F` | 작은 메타 정보 |
| `--border-muted-strong` | `#C2C0B6` | 비교적 선명한 중립 경계 |
| `--border-default` | `#D1CFC5` | 기본 경계 |
| `--border-soft` | `#DEDCD1` | 패널 경계 |
| `--border-faint` | `#F0EEE6` | 아주 약한 구획 |
| `--surface-footer` | `#141413` | 푸터 |
| `--footer-link` | `#B0AEA5` | 푸터 보조 링크 |

### 데이터 의미색

| 역할 | 색 A | 색 B | 선/보조 |
|---|---|---|---|
| 기대·효용 | `#81B806` | `#BFDE8D` | `#6EA100`, `#95C53E` |
| 우려·위험 | `#86B6EF` | `#CDE2FB` | `#6396D6`, `#256ABF` |
| 지역 비교 녹색 | `#4A7B00` | `#81B806` | 아이보리 중앙 veil |
| 지역 비교 파랑 | `#256ABF` | `#86B6EF` | 아이보리 중앙 veil |
| 산점도 사분면 | - | 녹색 `#E6F1D5` | 파랑 `#F0F7FE` |
| 중립 데이터 | `#B0AEA5` | `#CFCEC8` | - |
| 지구본 포인트 보조 | `#EDA100` | - | - |

### 브랜드 보조 팔레트

페이지 핵심 차트에서는 거의 쓰지 않지만 공통 CSS에는 다음 보조색도 있다.

- Clay `#D97757`
- Oat `#E3DACC`
- Olive `#788C5D`
- Cactus `#BCD1CA`
- Sky `#6A9BCC`
- Heather `#CBCADB`
- Fig `#C46686`
- Coral `#EBCECE`

### 색 대비

계산상 대표 대비는 다음과 같다.

| 조합 | 대비비 | 평가 |
|---|---:|---|
| `#141413` / `#FAF9F5` | 17.5:1 | 충분 |
| `#30302E` / `#E8E6DC` | 10.57:1 | 충분 |
| `#87867F` / `#FAF9F5` | 3.47:1 | 작은 일반 텍스트에 부족 |
| `#B0AEA5` / `#141413` | 8.29:1 | 충분 |
| `#4A7B00` / `#FAF9F5` | 4.83:1 | 일반 텍스트 최소 기준 통과 |
| `#256ABF` / `#FAF9F5` | 5.12:1 | 일반 텍스트 최소 기준 통과 |
| `#81B806` / `#FAF9F5` | 2.27:1 | 텍스트로 단독 사용 금지 |
| `#86B6EF` / `#FAF9F5` | 2.0:1 | 텍스트로 단독 사용 금지 |

강한 녹색과 파란색은 면·막대·점에는 적합하지만 밝은 배경 위 작은 텍스트로 쓰면 안 된다. 의미는 색과 레이블을 함께 사용해야 한다.

## 4.2 타이포그래피

### 폰트 자산

HTML이 preload하는 핵심 WOFF2는 다음 6종이다.

- Anthropic Sans Roman / Italic
- Anthropic Serif Roman / Italic
- Anthropic Mono Roman / Italic

공통 CSS 전체에는 Copernicus Book/Medium, Styrene A/B, Tiempos Text, JetBrains Mono 등을 포함해 WOFF2 파일 19개가 정의되어 있다. 이 중 6개가 HTML에서 preload되고, 나머지는 13개다. 페이지는 주로 Anthropic Serif와 Sans를 쓰며 코드 블록은 JetBrains Mono 계열이다.

### 타입 역할

| 역할 | 폰트 | 크기 / 행간 | 굵기 |
|---|---|---|---|
| Hero 제목 | Serif | `61px / 1.2`; 모바일 `32px` | 400 |
| 인트로 설명 | Sans | `13px / 1.5` | 400 |
| 본문 | Serif | `17px / 30px` | 400 |
| H2 | Sans | `28px / 44px` | 600 |
| H3 | Sans | `22px / 36px` | 600 |
| H4 | Sans | `19px / 30px` | 600 |
| 자동 인용문 | Serif | `26px / 1.4`; 모바일 `18px / 1.4` | 400 |
| 스크롤 서사 | Serif | `26px / 1.25`; 모바일 `18px / 1.25` | 400 |
| 차트 인용 | Serif | `22px / 32px`; 모바일 `16px / 24px` | 400 |
| 차트 제목 | Sans | `17px / 32px` | 700, uppercase |
| 레이블·수치·caption | Sans | `13px / 20px` | 400~600 |
| 인용 출처 | Sans | `13px / 20px` | 700, uppercase |
| 코드 | Mono | `15px / 140%` | 400 |
| 푸터 | Sans | `12px / 140%` | 400 |

### 재현 규칙

- 이야기, 인용, 긴 본문: Serif
- 탐색, 제목, 숫자, 축, 버튼, 메타 정보: Sans
- 코드와 BibTeX: Mono
- 뷰포트 폭에 비례해 글자 크기를 계속 키우지 않는다. 명시적 breakpoint로 두세 단계만 바꾼다.
- 재구현의 본문 letter-spacing은 기본 0으로 유지하는 것을 권장한다. 원본에는 전역 body `-0.01em`, 일부 메타의 작은 양수 tracking, Quote CTA 설명과 mono의 음수 tracking처럼 예외가 있으나 콘텐츠 컴포넌트별 미세 조정에 가깝다.

## 4.3 레이아웃과 그리드

### 핵심 너비

| 용도 | 최대 폭 |
|---|---:|
| 전체 사이트 wrapper | `1,400px` |
| 읽기 본문 | `640px` |
| 일반 미디어 | `880px` |
| pairing 차트 | `900px` |
| 가로 막대/산점도 | `920px` |
| 버블 지도 | `1,150px` |
| 지역 비교 | `1,500px` |

### 페이지 좌우 여백

- 991px 이하: `32px`
- 992~1,023px: `48px`
- 1,024px 이상: `64px`
- 700px 이상부터 12열 grid, 기본 gutter `32px`
- 극소형 화면에서는 실제 구현 시 `20~24px`로 보정하는 것이 안전하다. 원본의 32px를 그대로 쓰면 320px 화면의 유효 폭이 지나치게 좁아질 수 있다.

### 여백 스케일

관찰되는 spacing token은 다음 계열이다.

`2, 4, 6, 8, 12, 16, 20, 24, 32, 36, 40, 48, 56, 64, 80, 96, 128, 200px`

- 기본 gap: `4, 12, 16, 24, 32, 48px`
- 992px 이상: `8, 12, 20, 32, 48, 56px`
- 1,024px 이상: `8, 16, 24, 32, 48, 64px`
- 큰 섹션 세로 여백:
  - 모바일 `64px`
  - 태블릿 `80px`
  - 데스크톱 `96px`
- 작은 내부 구획:
  - 모바일 `32px`
  - 태블릿 `40px`
  - 데스크톱 `48px`

### 모서리, 테두리, 그림자

- 반경 기본: `4, 8, 12, 16px`
- 992px 이상: `8, 12, 16, 24px`
- pill: `1000px`
- 테두리: `0.5, 1, 1.5, 2px`
- 그림자는 tooltip, dropdown, modal 같은 떠 있는 UI에만 제한적으로 사용한다.
  - tooltip: `0 4px 24px #0000000D`
  - dropdown: `0 8px 32px #1414131F, 0 2px 8px #14141314`
- 일반 본문 섹션을 떠 있는 카드처럼 만들지 않는다.

---

## 5. 반응형 설계 매트릭스

원본은 하나의 보편 breakpoint보다 시각화별 의미 있는 전환점을 사용한다.

| 기준 폭 | 주요 변화 |
|---:|---|
| `max-width: 567px` | Hero 제목·인용 모바일 규칙 적용 |
| `min-width: 567px` | 산점도 SVG 사용; 그 미만은 지역 카드 목록 |
| `640/641px` | 지역 비교 desktop slope ↔ mobile dumbbell |
| `767/768px` | pairing 한 열 ↔ 양면 2열; 지도 높이 300px 보정 |
| `900px` | 지역 비교의 양쪽 글로브 숨김 |
| `949/950px` | 모바일 헤더 ↔ 데스크톱 nav; 헤더 높이 64 ↔ 68px |
| `991/992px` | 페이지 여백·반경 확대; 지도 legend/국가 목록 구성 변화 |
| `1,024px` | 푸터 전체 grid와 Quote Wall sidebar 강화; 기사 본문은 계속 `17px/30px` |
| `1,090/1,091px` | 가로 막대 accordion ↔ hover+우측 인용문 2열 |
| `1,250px` | 심볼 로고 ↔ 전체 wordmark, 대형 grid utility 전환; 기본 12열 grid는 이미 700px부터 적용 |
| `1,290/1,291px` | 가로 막대 최대 740 ↔ 920px, 3:2 ↔ 1:1 열 비율 |

### 권장 테스트 뷰포트

- `320 × 568`: 최소 폭과 긴 한글 단어
- `390 × 844`: 대표 모바일
- `567 × 900`: 산점도 전환 경계
- `640 × 900`: 지역 비교 전환 경계
- `768 × 1024`: 태블릿과 pairing 전환
- `950 × 900`: 헤더 전환
- `1091 × 900`: 가로 막대 전환
- `1280 × 800`: 일반 노트북
- `1440 × 900`: 기준 데스크톱
- `1920 × 1080`: 최대 폭과 과도한 빈 공간 확인

### 반응형 구현 원칙

- 복잡한 차트는 축소보다 **표현 방식 전환**을 우선한다.
- 데스크톱과 모바일 DOM을 완전히 복제하지 않는다. 같은 상태와 데이터를 공유하고 하위 표현 컴포넌트만 바꾼다.
- CSS로 숨긴 중복 콘텐츠가 스크린 리더에서 두 번 읽히지 않도록 한다.
- 고정 형식 시각화는 `aspect-ratio`, `min/max`, 명시적 grid track을 사용해 tooltip이나 긴 레이블 때문에 레이아웃이 흔들리지 않게 한다.

---

## 6. 인터랙션·모션 명세

| 기능 | 입력 | 반응 | 시간/곡선 |
|---|---|---|---|
| 인트로 인용 자동 진행 | 시간 | 국가·점·인용 전환 | 장면 약 7초 |
| 타이핑 | 자동 | 1.8초 후 글자 표시 | 약 65자/초 |
| 인트로 인용 이동 | 진행점 click, swipe | 이전/다음 인용 | swipe 임계 40px |
| 지구본 | pointer drag | 회전과 관성 | rAF 기반 |
| 스크롤 서사 | scroll | 단계·지구 회전·강조 보간 | 9단계, 각 약 70vh |
| 가로 막대 | desktop mouseenter, 행 click | 설명·인용 활성화; 원본은 focus 미지원 | CSS transition |
| 지도 버블 진입 | mount | 지연 순차 등장 | 0~900ms delay + 250ms |
| 지도 확대 | 버튼 | 1.5배 확대/축소 | 300ms |
| 지도 reset | 버튼/double click | 기본 transform | 500ms |
| 지역 선택 | dropdown/arrow | 글로브·slope 값 이동 | 700ms cubic-out |
| Quote sidebar | scroll | 활성 범주 동기화 | IntersectionObserver |
| Quote detail | 카드 pointer click 후 ArrowLeft/Right·Escape | overlay 열기와 이전/다음·닫기; 카드 자체는 keyboard 미지원 | 즉시 또는 짧은 fade |
| 코드 복사 | click | check 상태 | 2초 유지 |

### 모션 원칙

- 모션은 장식보다 **위치 관계와 데이터 변화 설명**에 사용된다.
- 페이지 스크롤과 충돌하는 wheel zoom은 제거한다.
- 긴 인트로는 즉시 건너뛸 수 있는 컨트롤을 제공한다.
- 비가시 상태에서는 rAF를 정지한다.
- 새 구현은 다음 reduced-motion 모드를 별도로 정의해야 한다.

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    scroll-behavior: auto !important;
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

단순 CSS만으로 끝내지 말고 JavaScript의 자동 진행, typewriter, D3 transition, 관성, rAF 루프도 media query를 읽어 정지해야 한다.

---

## 7. 기술 구조 분석

## 7.1 확인된 기술

- Next.js App Router
- React Server Components / Flight payload
- Turbopack 빌드 산출물
- SCSS 기반 CSS Modules
- Sanity CMS Portable Text 및 Sanity CDN
- D3 계열
  - selection
  - scale
  - geo
  - zoom
  - force
  - Delaunay/Voronoi
- `topojson-client`
- React portal
- GSAP + ScrollTrigger
- `lottie-web`
- `IntersectionObserver`
- `ResizeObserver`
- Google Tag Manager와 GA

### 렌더러에서 지원하는 콘텐츠 블록 타입

```text
clintScrollIntroBlock
clintHorizontalBarGraphBlock
clintPairingBlock
clintTranscriptBlock
clintSentimentBubbleMapBlock
clintScatterPlotBlock
clintRegionCompareBlock
clintQuoteGridBlock
clintQuoteGridCardBlock
clintDataTableBlock
codeBlock
```

- `clintDataTableBlock`은 렌더러 매핑과 지원 코드에서 확인되지만 현재 페이지 DOM에는 실제 DataTable 인스턴스나 `<table>`이 없다.

## 7.2 자산과 데이터 크기

아래 값은 다운로드한 비압축 응답 기준이며 실제 네트워크 전송량은 gzip/Brotli, 브라우저 캐시, CDN 헤더에 따라 달라진다.

| 자산 | 대략 크기 | 역할 |
|---|---:|---|
| 저장 HTML | 2.35MB | 렌더 DOM + RSC 데이터 + 런타임 상태 |
| 핵심 페이지 JS 청크 | 184KB | 페이지 전용 인터랙션 |
| 전체 연결 JS 청크 | 1.69MB | 공통 사이트 코드 포함 |
| 본 CSS 5개 | 약 348KB | 전역·헤더·페이지·차트 스타일 |
| 지연 CSS | 약 3.8KB | 보조 스타일 |
| CLINT 데이터 JSON | 279KB | global/byRegion/byCountry/byState/labels |
| curated quote JSON | 13KB | 차트·typewriter·pairing 대표 인용 |
| Quote Wall JSON | 218KB | 인용문 620건 |
| 미국 주 TopoJSON | 115KB | 미국 세부 지도 |
| 세계 TopoJSON | 886KB | 세계 지도 |
| 외부 데이터 합계 | 약 1.51MB | 위 5개 JSON 합계 |
| OG 이미지 | 2400×1260 PNG | 소셜 공유 이미지 |
| 부록 PDF | 약 264KB | 연구 부록 |

### 미디어 특성

- 본문 `<img>`, `<video>`, `<canvas>`는 0개다.
- inline SVG는 약 126개이며 대부분 로고와 데이터 시각화다.
- OG 이미지는 거대한 옅은 지구, 녹색·파란 응답자 점, 중앙 세리프 제목으로 hero 콘셉트를 압축한다.
- 노란 종이 하이라이트 PNG가 공통 자산으로 연결된다.

## 7.3 관찰된 성능 문제

1. CLINT와 curated 데이터가 RSC payload에 통째로 다시 직렬화되어 초기 HTML을 비대하게 만든다.
2. Quote Wall 데이터는 모달이 닫혀 있어도 컴포넌트 mount 직후 fetch된다.
3. 세계 TopoJSON을 여러 컴포넌트가 독립 fetch하며 브라우저 캐시에 의존한다.
4. 데스크톱과 모바일 표현을 일부 중복 DOM으로 렌더한다.
5. D3가 실행 후 생성한 많은 국가·버블 SVG 노드는 초기 다운로드 HTML 또는 React hydration 대상이라고 단정할 수 없다. 다만 런타임 DOM 수, 레이아웃·페인트, 메모리 비용은 커진다.
6. GSAP와 Lottie는 첫 스크롤 또는 idle callback에서 동적 import되므로 초기 eager bundle과 구분해야 한다. 다만 idle timeout이 최대 2초라 상호작용이 없어도 세션 초기에 로드될 수 있다.

## 7.4 권장 성능 구조

### 초기 렌더에 포함

- 제목, 요약, 연구 메타 정보
- 첫 본문과 핵심 SEO 콘텐츠
- 정적 chart caption과 접근 가능한 요약
- hero의 최소한의 정적 globe shell

### viewport 근접 시 hydrate

- 가로 막대 상호작용
- 지도
- 산점도
- 지역 비교

Pairing 블록은 원본에서 정적이므로 별도 hydration이 필수는 아니다. 숫자 전환 같은 모션을 새로 추가할 때만 선택적으로 hydrate한다.

### 사용자가 요청할 때 로드

- Quote Wall 모달 코드
- 620개 인용문 JSON
- 개인정보 disclaimer overlay
- 고급 지도 데이터 또는 주 단위 세부 지도

### 데이터 캐시

```ts
// 동일 TopoJSON을 여러 차트가 공유하도록 모듈 수준 promise를 캐시한다.
let worldTopologyPromise: Promise<WorldTopology> | undefined;

export function getWorldTopology() {
  return worldTopologyPromise ??=
    fetch('/data/world.topo.json').then((response) => response.json());
}
```

- JSON은 CDN에서 Brotli 압축하고 immutable hash URL을 쓴다.
- 국가·지역 lookup은 로드 시 한 번 `Map`으로 색인한다.
- D3 projection과 path는 크기·데이터가 바뀔 때만 memoize한다.
- animation loop는 observer, reduced motion, visibility 상태로 gate한다.
- 모바일/데스크톱 데이터는 하나의 normalized store를 공유한다.

## 7.5 권장 컴포넌트 구조

```text
ResearchStoryPage
├─ SiteHeader
├─ Main
│  ├─ ScrollGlobeIntro
│  │  ├─ GlobeScene
│  │  ├─ TypewriterQuote
│  │  ├─ NarrativeSteps
│  │  └─ StoryProgress
│  ├─ RichTextSection[]
│  ├─ QuoteWallCallout
│  ├─ RankedBarStory[vision]
│  ├─ RankedBarStory[experience]
│  ├─ RankedBarStory[concern]
│  ├─ PairingStory[]
│  ├─ SentimentMap
│  │  ├─ MapCanvas
│  │  ├─ MapControls
│  │  ├─ MapLegend
│  │  └─ AccessibleCountryList
│  ├─ RegionalScatter
│  │  ├─ DesktopScatterPlot
│  │  └─ MobileRegionCards
│  ├─ RegionComparison[vision]
│  ├─ RegionComparison[concern]
│  ├─ CitationBlock
│  └─ QuoteWallCallout
├─ SiteFooter
└─ QuoteWallPortal
   ├─ QuoteFilters
   ├─ QuoteSearch
   ├─ QuoteSections
   ├─ QuoteDetailDialog
   └─ PrivacyDialog
```

## 7.6 권장 데이터 모델

```ts
type LocalizedString = Record<'ko' | 'en', string>;

type RespondentQuote = {
  id: string;
  text: LocalizedString;
  countryCode: string;
  regionId: string;
  respondentDescription?: LocalizedString;
  tags: {
    visions: string[];
    experiences: string[];
    concerns: string[];
  };
  sentiment?: 'hope' | 'mixed' | 'concern';
  featuredScore?: number;
  privacyEdited: boolean;
};

type RankedCategory = {
  id: string;
  label: LocalizedString;
  definition: LocalizedString;
  value: number;
  quoteIds: string[];
  semanticGroup: 'benefit' | 'neutral' | 'concern';
};

type GeographyMetric = {
  id: string;
  label: LocalizedString;
  kind: 'country' | 'region' | 'state';
  parentRegionId?: string;
  sampleSize: number;
  positiveSentiment: number;
  negativeSentiment: number;
  jobConcern: number;
  visions: Record<string, number>;
  concerns: Record<string, number>;
};
```

핵심은 시각화에 맞춘 중복 객체를 여러 개 만들지 않고, ID와 locale을 기준으로 하나의 normalized 데이터 계층을 만드는 것이다.

---

## 8. 접근성 평가와 필수 개선

## 8.1 잘된 점

- `<html lang="ko-KR">`
- main과 footer로 이동하는 skip link
- `main#main-content`
- section, heading, blockquote, cite 등 기본 문서 semantics
- 데스크톱 nav의 `aria-haspopup`, `aria-expanded`, `aria-controls`
- 모바일 nav의 dialog semantics와 body scroll lock
- 일부 지역 이동, 닫기, 소셜, 복사 버튼의 접근 가능한 이름
- 외부 링크의 `noopener`
- 푸터 navigation label

## 8.2 주요 결함

| 심각도 | 문제 | 영향 | 개선 |
|---|---|---|---|
| 높음 | 막대 행·step dot·지역 trigger·quote card가 clickable div/span | 키보드 사용 불가 | 실제 button/link로 교체 |
| 높음 | Quote overlay에 dialog semantics와 focus trap 부족 | 포커스가 배경으로 빠짐 | `role=dialog`, `aria-modal`, inert, trap, restore |
| 높음 | 지도·산점도·비교 SVG에 title/desc/대체 표 부족 | 스크린 리더로 데이터 해석 불가 | 요약 + 표 + SVG 설명 제공 |
| 높음 | feature animation이 reduced motion을 무시 | 전정기관 민감 사용자 부담 | JS와 CSS 모두 정적 모드 제공 |
| 중간 | hover 동작의 keyboard 동등 기능 부족 | 탭 사용자 세부 정보 접근 불가 | focus/click 상태 통합 |
| 중간 | accordion에 aria-expanded/controls 부족 | 펼침 상태 알 수 없음 | 표준 accordion pattern |
| 중간 | zoom 버튼이 기호와 title만 가짐 | 접근 가능한 이름 불확실 | 명시적 `aria-label` |
| 중간 | 검색 input이 placeholder만 가짐 | 입력 목적 인식 어려움 | `<label>` 제공 |
| 중간 | group toggle에 상태 semantics 없음 | 현재 필터 인식 어려움 | radio 또는 aria-pressed |
| 중간 | 작은 meta text `#87867F` 대비 3.47:1 | 가독성 저하 | 더 진한 색 또는 큰 글자 |
| 중간 | 한국어 페이지의 영어 control 혼재 | 언어 전환 혼란 | locale 리소스 통일 |
| 낮음 | 모바일 nav section이 존재하지 않는 button id를 참조 | 관계 정보 깨짐 | id 연결 수정 |

## 8.3 구현 체크리스트

- 모든 pointer hover 정보는 keyboard focus와 touch click으로도 제공
- 모든 dialog는 초기 포커스, 순환 포커스, Escape, 종료 후 포커스 복귀 지원
- modal 배경은 `inert`, 시각적으로도 비활성
- 각 chart 앞에 한두 문장으로 결론을 제공
- chart 뒤에 표 또는 구조화 목록 제공
- 애니메이션 없는 상태에서도 정보 손실 없음
- 색 외에 레이블, 모양, 텍스트로 상태 구분
- tooltip은 pointer를 옮겨도 접근 가능하고 viewport 밖으로 잘리지 않음
- 로딩·오류·복사 완료는 적절한 live region으로 전달
- 스크롤 장면을 건너뛰는 링크를 실제 첫 본문 heading에 연결
- 동적 필터 결과 수를 텍스트로 알림

---

## 9. SEO·메타데이터·분석

### 확인된 항목

- canonical URL
- viewport meta
- theme color `#141413`
- Open Graph 제목·설명·이미지
- Twitter card 메타
- 각종 favicon/app icon
- Google Tag Manager `GTM-KWW2N9TQ`
- Google Analytics `G-MT0111843S`

### 부족하거나 확인되지 않은 항목

- `Article` 또는 `ScholarlyArticle` JSON-LD
- `datePublished`, `dateModified`의 구조화 메타
- author 구조화 데이터
- 언어별 `hreflang`
- 완전히 현지화된 title/description

### 권장 구조화 데이터

```json
{
  "@context": "https://schema.org",
  "@type": "ScholarlyArticle",
  "headline": "연구 제목",
  "datePublished": "2026-03-18",
  "dateModified": "2026-03-19",
  "author": [{ "@type": "Person", "name": "저자명" }],
  "publisher": { "@type": "Organization", "name": "기관명" },
  "mainEntityOfPage": "https://example.com/research/story",
  "inLanguage": "ko-KR"
}
```

### consent 관련 주의

- 원본은 `anthropic-consent-preferences` cookie, `/api/country`, GPC 신호를 조합해 국가별 기본 consent를 정한다.
- analytics와 marketing을 구분하고 consent 변경 시 관련 cookie를 삭제한다.
- 저장 스냅샷에는 모든 consent가 `granted`인 런타임 상태가 포함되어 있다.
- 이 로직과 GTM ID를 복사하면 안 된다. 새 사이트의 관할권, 개인정보 방침, CMP, 분석 목적에 맞게 법률 검토와 함께 설계해야 한다.

---

## 10. 콘텐츠·현지화 품질 분석

### 10.1 좋은 콘텐츠 패턴

- 큰 수치 뒤에 반드시 사람의 사례를 붙인다.
- 각 범주마다 이름, 비율, 짧은 정의, 대표 인용, 국가·직업 출처를 제공한다.
- 효용만 말한 뒤 위험을 덧붙이는 것이 아니라 둘의 공존을 별도 장으로 만든다.
- 전역 결과 → 국가 지도 → 지역 상관관계 → 두 지역 직접 비교 순으로 공간적 해상도를 높인다.
- 상세 Quote Wall은 본문을 방해하지 않고 선택적으로 깊게 탐색하게 한다.
- 연구 페이지 끝에 인용 형식, 부록, 정정 이력을 제공해 신뢰를 보완한다.

### 10.2 원본 한국어에서 발견한 번역 문제

| 원본 표시 | 문제 | 권장 표현 |
|---|---|---|
| `81,000명 AI에서 원합니다` | 문법 파손 | `81,000명이 AI에 바라는 것` |
| `AI가 전달하지 않았습니다` | deliver의 직역 | `아직 기대한 효용을 얻지 못함` |
| `아시` | sycophancy 오역 | `아첨·영합` |
| `대리` | agency의 의미 축소 | `주체성` 또는 `자율성과 주체성` |
| `이동` | displacement 오역 | `일자리 대체` 또는 `고용 displacement` |
| `인간적인` | Anthropic 고유명사 번역 | `Anthropic` 유지 |
| `견적 벽` 계열 | quote를 가격 견적으로 오역 | `Quote Wall` 또는 `인용문 탐색` |
| `그것이 어떤 도움이 될지 우려` | 원문의 fear/harm 의미를 반대로 전달 | `어떤 해를 끼칠까 우려하는지` |
| `다른 AI 제품의 이름은 가산되었습니다` | redacted 오역 | `다른 AI 제품명은 삭제·가림 처리했습니다` |
| 산점도 caption의 `핑크` | 실제 점 색은 파랑 `#9EC5F4` | `파란색` |
| `현재 작동하지 않습니다` | `currently not working`을 기계 작동으로 오역 | `현재 미취업` 또는 실제 직업 상태에 맞는 표현 |
| `매니저/임수` | 직업명 파손 | `관리자/임원` |
| `경제 선물` | 프로그램 고유명사 번역 | `Economic Futures` |
| `AI 지수에 관한 정책` | 고유 캠페인명 의미 훼손 | `Policy on the AI Exponential` |

- 차트 정의, 인용문, 출처, 산점도 레이블, 모달 문구에 영어와 한국어가 섞여 있다.
- 번역된 콘텐츠와 영어 fallback이 같은 객체에 임시로 혼재한 정황이 있다.
- 구현 시 content ID와 번역 문자열을 분리하고 fallback 발생을 로깅해야 한다.

### 10.3 용어집 권장

```text
vision              비전 / 기대하는 변화
experience          실제 경험 / 체감 효용
concern             우려
sentiment           정서 또는 태도
negative sentiment  부정 정서
agency              주체성
sycophancy          아첨·영합
displacement        일자리 대체
cognitive atrophy   인지 위축
illusory productivity  허상적 생산성
```

---

## 11. 원본에서 그대로 복사하면 안 되는 부분

1. **지도 설명과 실제 수치 불일치**  
   60% 미만 국가가 없다는 설명은 공개 목록과 맞지 않는다.

2. **산점도 지표 이름의 방향 오류**  
   `AI sentiment`로 쓰였지만 실제 y값은 부정 정서다.

3. **지역 비교 캡처 상태 불일치**  
   데스크톱 trigger와 차트 수치·모바일 trigger가 서로 다르지만 코드는 state를 공유한다. 브라우저 번역 mutation 또는 전환 중 캡처 가능성이 있으므로 제품의 의도된 초기 상태로 해석하지 않는다.

4. **81,000 / 80,508 / 79,734 혼용**  
   각각 반올림 제목, 전체 참여자·인터뷰 수, 지역 비교기의 `Global Average n`이다. `79,734`를 페이지 전체의 분석 표본으로 일반화하면 안 된다.

5. **159개국 / 데이터 125개국 / 현재 view 123개국 혼용**  
   조사 범위, `byCountry` 레코드 수, pan/zoom·filter에 따른 동적 화면 수를 분리해 써야 한다.

6. **‘여섯 영역’ / 차트 7행**  
   성공한 효용 6개에 미달성 1행을 더한 구조임을 설명해야 한다.

7. **기계 번역 품질**  
   연구 용어와 고유명사를 전문 편집자가 검수해야 한다.

8. **클릭 가능한 비시맨틱 요소**  
   div/span 기반 interaction을 그대로 재현하지 않는다.

9. **거대한 초기 payload**  
   RSC 안에 대형 데이터를 반복 직렬화하거나 닫힌 모달 데이터를 즉시 받지 않는다.

10. **중복 desktop/mobile DOM**  
    상태 불일치, 스크린 리더 중복, hydration 비용을 유발할 수 있다.

11. **접근성 없는 모션**  
    자동 typewriter와 D3 transition을 reduced-motion에서도 계속 실행하지 않는다.

12. **CSS Module hash 재사용**  
    해시 클래스는 빌드 산출물이므로 의미 있는 토큰·컴포넌트 이름으로 다시 설계한다.

---

## 12. 유사 사이트 구현 청사진

## 12.1 1단계: 콘텐츠와 데이터 계약

- 핵심 연구 질문 1개를 정의한다.
- 헤드라인용 반올림 수치, 전체 참여자 수, 각 분석·차트별 유효 표본을 분리한다.
- 기대/경험/우려 taxonomy를 먼저 확정한다.
- 모든 범주에 정의, 비율, 대표 quote ID, 근거 표본을 연결한다.
- 국가·지역 ID는 화면 레이블이 아니라 ISO 코드와 내부 stable ID로 연결한다.
- 용어집과 locale fallback 정책을 만든다.
- 공개 가능 인용문에 개인정보 편집 여부와 승인 상태를 기록한다.

## 12.2 2단계: 정적 읽기 경험

- header, 본문, section heading, footnote, citation, footer를 먼저 구현한다.
- JavaScript 없이도 연구 흐름과 핵심 결론을 읽을 수 있어야 한다.
- 각 시각화 위치에 접근 가능한 요약과 데이터 표를 둔다.
- canonical, Article JSON-LD, OG image, 발행·정정 메타를 완성한다.

## 12.3 3단계: 시각화 컴포넌트

- RankedBarStory
- PairingStory
- SentimentMap
- RegionalScatter
- RegionComparison
- 각 컴포넌트에 desktop view, mobile view, accessible table을 같은 데이터 source에서 공급한다.
- 차트 좌표 계산과 UI 상태를 분리해 단위 테스트한다.

## 12.4 4단계: scrollytelling

- 정적 globe를 먼저 렌더한다.
- 진행 상태 machine을 추가한다.
- typewriter와 자동 진행을 추가한다.
- scroll progress와 지구본 projection을 연결한다.
- pause/resume, reduced motion, skip, keyboard navigation을 추가한다.
- 마지막에 관성과 세부 transition을 조정한다.

## 12.5 5단계: Quote Wall

- route/hash 상태를 parser 한 곳에서 관리한다.
- 모달을 열 때 코드와 JSON을 lazy load한다.
- 검색과 facet 분류를 web worker 또는 memoized index로 처리할 필요가 있는지 측정한다.
- desktop sidebar와 mobile dropdown은 같은 active category 상태를 공유한다.
- detail dialog, privacy dialog, focus management를 완성한다.

## 12.6 6단계: 성능·품질 예산

권장 초기 목표:

- 초기 서버 HTML: gzip 기준 100KB 안팎
- 초기 route JS: gzip 기준 200KB 이하를 목표로 측정
- hero 외 차트: viewport 접근 시 lazy hydrate
- Quote Wall JSON: 사용자 액션 시 로드
- world TopoJSON: 단일 cache, 가능하면 단순화된 geometry 제공
- LCP: 모바일 2.5초 이내
- INP: 200ms 이내
- CLS: 0.1 이하
- 긴 task: 50ms 이상 작업을 나눔
- Lighthouse만이 아니라 실제 저사양 모바일에서 scroll과 drag를 점검

## 12.7 상태 모델 예시

```ts
type StoryState =
  | { phase: 'intro'; quoteIndex: number; paused: boolean }
  | { phase: 'narrative'; stepIndex: number; progress: number }
  | { phase: 'complete' };

type QuoteWallState = {
  open: boolean;
  groupBy: 'region' | 'vision' | 'experience' | 'concern';
  categoryId?: string;
  query: string;
  detailQuoteId?: string;
  privacyOpen: boolean;
};
```

상태를 DOM class 이름이나 현재 화면 폭에서 역산하지 말고 URL과 명시적 reducer/state machine을 기준으로 관리한다.

---

## 13. 디자인 QA 체크리스트

### 콘텐츠

- [ ] 헤드라인 수치, 전체 참여자 수, 각 차트의 유효 표본 차이가 설명되어 있는가?
- [ ] 모든 범주 정의가 한 문장 안에 들어오는가?
- [ ] 대표 인용문에 국가·응답자 맥락·익명 처리 기준이 있는가?
- [ ] 기대와 우려를 이분법적으로 과장하지 않는가?
- [ ] 각 chart caption이 실제 데이터 버전과 일치하는가?
- [ ] 모든 전문 용어가 용어집과 일치하는가?
- [ ] 한국어와 영어 fallback이 한 컴포넌트 안에서 섞이지 않는가?

### 레이아웃

- [ ] 640px 읽기 열과 900px 이상 데이터 열의 전환이 자연스러운가?
- [ ] 320px 화면에서 긴 국가명과 범주명이 잘리거나 겹치지 않는가?
- [ ] sticky hero 끝에서 본문으로 이동할 때 갑작스러운 점프가 없는가?
- [ ] 모바일 주소창 높이 변화에서 `100vh`가 흔들리지 않는가? 가능하면 `svh/dvh`를 검토했는가?
- [ ] tooltip, dropdown, modal이 viewport 밖으로 잘리지 않는가?
- [ ] 고정 헤더가 anchor target을 가리지 않는가?

### 시각화

- [ ] 상대 막대 스케일과 절대 퍼센트를 구분해 설명했는가?
- [ ] 지역 표본 수가 작은 경우 경고 또는 불확실성을 표시하는가?
- [ ] 색 없이도 평균 이상/이하와 좌우 우세를 구분할 수 있는가?
- [ ] 모바일 표현이 데스크톱의 핵심 데이터를 모두 보존하는가?
- [ ] 필터 변경 후 차트와 label, caption, URL이 같은 상태인가?
- [ ] resize 후 projection과 label collision이 다시 계산되는가?

### 인터랙션

- [ ] hover 정보가 focus와 touch에서도 열리는가?
- [ ] 모든 아이콘 버튼에 tooltip과 접근 가능한 이름이 있는가?
- [ ] wheel zoom이 페이지 스크롤을 가로채지 않는가?
- [ ] scrollytelling을 즉시 건너뛸 수 있는가?
- [ ] offscreen·background 탭에서 animation loop가 멈추는가?
- [ ] reduced motion에서 자동 진행과 관성이 사라지는가?
- [ ] back/forward로 Quote Wall hash 상태가 복원되는가?

### 접근성

- [ ] 키보드만으로 모든 차트 상세와 Quote Wall을 탐색할 수 있는가?
- [ ] dialog focus trap과 focus restore가 동작하는가?
- [ ] accordion에 `aria-expanded`, `aria-controls`가 있는가?
- [ ] SVG에 title/desc와 대체 데이터가 있는가?
- [ ] 작은 텍스트 대비가 WCAG AA를 통과하는가?
- [ ] 스크린 리더에서 desktop/mobile 중복 콘텐츠가 읽히지 않는가?
- [ ] 200% 확대에서도 내용 손실이나 가로 스크롤이 없는가?

### 성능

- [ ] Quote Wall과 대형 JSON이 초기 로드에서 빠져 있는가?
- [ ] TopoJSON을 여러 번 fetch하지 않는가?
- [ ] chart별 dynamic import 경계가 있는가?
- [ ] SSR 데이터와 client fetch 데이터가 중복되지 않는가?
- [ ] SVG 노드 수와 collision 계산 비용을 실제 기기에서 측정했는가?
- [ ] font preload가 실제 첫 화면에 필요한 폰트만 포함하는가?

---

## 14. 핵심 구현 사양 요약

유사한 결과를 내려면 다음 요소를 우선 보존해야 한다.

1. **따뜻한 오프화이트 배경과 거의 검정인 텍스트**
2. **서사 640px / 차트 900~1,500px의 폭 대비**
3. **세리프 본문·인용과 산세리프 제목·수치의 역할 분리**
4. **녹색 기대와 파란색 우려라는 일관된 데이터 문법**
5. **지구본으로 시작하는 장기 scrollytelling**
6. **통계마다 정의와 실제 사람의 인용을 함께 제공하는 구조**
7. **전역 → 국가 → 지역 관계 → 두 지역 직접 비교의 탐색 단계**
8. **모바일에서 차트를 아코디언·카드·덤벨로 재구성하는 방식**
9. **본문과 분리된 깊이 탐색용 Quote Wall**
10. **연구 인용, 부록, 정정 이력을 포함한 학술적 마무리**

표면적인 색과 폰트만 복제하면 이 페이지와 비슷해지지 않는다. 가장 중요한 것은 `집단 규모 → 개인 목소리 → 분류 → 공존 관계 → 지리적 차이 → 원자료 탐색`이라는 정보 흐름과, 각 데이터마다 사람의 맥락을 다시 연결하는 편집 방식이다.

---

## 15. 근거 위치와 관련 자산

- 로컬 DOM/RSC 스냅샷: [`html.txt` 1행](/Users/taesooa/Desktop/temp/html.txt:1), [`html.txt` 7행](/Users/taesooa/Desktop/temp/html.txt:7)
- 공개 페이지: [Anthropic 81k interviews](https://www.anthropic.com/features/81k-interviews)
- 페이지 canonical: `https://www.anthropic.com/features/81k-interviews`
- OG 이미지: `https://cdn.sanity.io/images/4zrzovbb/website/4f94dcd81c982c69811aafbd56cc07aec185bc19-2400x1260.png`
- 연구 부록: `https://cdn.sanity.io/files/4zrzovbb/website/99156863ed4a812569fe00a2adfb1c93f7e5a911.pdf`

검색 시 유용한 식별자:

```text
ScrollIntroGlobe
HorizontalBarGraph
SentimentBubbleMap
ScatterPlot
RegionCompare
QuoteGrid
clintDataFile
curatedQuotesFile
quoteGridFile
worldTopoJson
usStatesTopoJson
```
