"use client";

import { useId, useState } from "react";

import adminGuide from "@/data/admin_guide.json";
import { getPoleBadge } from "@/lib/city-axes";
import { getCityType } from "@/lib/city-types";
import type {
  AgeBand,
  AxisStat,
  AxisSummary,
  BriefingFinding,
  BriefingImplication,
  BriefingQuote,
  BriefingTension,
  TopicStat,
} from "@/lib/api";

import {
  AGE_BANDS,
  AXIS_QUESTION,
  SECTIONS,
  axisTitle,
  spellCode,
} from "../dashboard-data";
import { Band, grown, step, useRevealed } from "./report-motion";
import styles from "./report.module.css";

type AdminGuide = {
  axes: {
    title: string;
    measures: string;
    poles: { name: string; description: string }[];
  }[];
  excluded_axis: { display: string; title: string; reason: string };
};

const GUIDE = adminGuide as AdminGuide;

/** briefing.md contracts <b> emphasis inside every sentence, so the tags render. */
export function Rich({
  className,
  html,
}: {
  className?: string;
  html: string;
}) {
  return (
    <div className={className} dangerouslySetInnerHTML={{ __html: html }} />
  );
}

/**
 * A narrative slot. A run whose one Gemini call failed leaves the slot empty and
 * says so, because another sample's reading beside these numbers is worse than none.
 */
export function AiText({ html }: { html: string | undefined }) {
  if (!html?.trim()) {
    return <p className={styles.missing}>AI 서술 없음</p>;
  }

  return (
    <div className={styles.ai}>
      <span className={styles.aitag}>AI 서술</span>
      <Rich className={styles.aibody} html={html} />
    </div>
  );
}

/**
 * A bar that stays at zero until its band is reached. It has to be its own
 * component: a section that renders the Band cannot read the Band's own context.
 */
function Fill({
  className,
  index,
  max,
  value,
}: {
  className?: string;
  index: number;
  max: number;
  value: number;
}) {
  const revealed = useRevealed();

  return (
    <span
      className={className ?? styles.fill}
      style={{ width: grown(value, max, revealed), ...step(index) }}
    />
  );
}

export function Head({ n, title }: { n: string; title: string }) {
  return (
    <header className={styles.head}>
      <span className={styles.num}>{n}</span>
      <h2>{title}</h2>
    </header>
  );
}

/** Every quote carries its ID so a reader can trace it back to one submission. */
export function QuoteText({ quote }: { quote: BriefingQuote }) {
  return (
    <figure className={styles.quote}>
      <blockquote>“{quote.text}”</blockquote>
      <figcaption>
        {quote.demand_title} · {quote.region || "자치구 미확인"}
        {quote.age_band ? ` · ${quote.age_band}세` : ""}
        <span className={styles.qid}>{quote.quote_id}</span>
      </figcaption>
    </figure>
  );
}

/** The reference original picked its fallback quote at random and lost reproducibility. */
function firstQuote(
  quotes: BriefingQuote[],
  topic: string,
): BriefingQuote | null {
  const matches = quotes.filter((quote) => quote.topics.includes(topic));
  if (matches.length === 0) return null;

  return matches.reduce((best, quote) =>
    quote.quote_id < best.quote_id ? quote : best,
  );
}

export function FindingsSection({
  findings,
  id,
}: {
  findings: BriefingFinding[] | undefined;
  id?: string;
}) {
  return (
    <Band id={id}>
      <div className={styles.read}>
        <Head n="01" title="이번 분석의 핵심" />
        {findings?.length ? (
          <ol className={styles.findings}>
            {findings.map((finding) => (
              <li key={finding.title}>
                <h3>{finding.title}</h3>
                <Rich className={styles.serif} html={finding.body} />
              </li>
            ))}
          </ol>
        ) : (
          <p className={styles.missing}>
            AI 서술 없음 — 이번 실행은 핵심 정리를 생성하지 못했습니다.
          </p>
        )}
      </div>
    </Band>
  );
}

/**
 * The fixed layer states how the survey works and what the four axes are, and the
 * variable layer says what this particular sample was like. Letting the model write
 * the whole section would drift the axis contract and the wording run to run.
 */
export function MethodSection({ sample }: { sample: string | undefined }) {
  return (
    <Band>
      <div className={styles.read}>
        <Head n="02" title="어떻게 조사했나" />
        <div className={styles.fixed}>
          <span className={styles.layertag}>
            고정 설명 · 실행마다 바뀌지 않습니다
          </span>

          <h3>인터뷰 방식</h3>
          <p>
            참여자는 AI 인터뷰어와 1:1로 대화했습니다. 인터뷰어는 지금의 하루를
            먼저 듣고 2040년 인천에서의 하루로 넘어가며, 참여자가 방금 한 말에
            맞춰 꼬리질문을 이어갑니다. 답변은 타이핑으로 받고 한 번에 묻는 것은
            하나입니다. 대화는 18턴을 목표로 하고, 참여자가 그만하겠다고 말하면
            그 자리에서 끝냅니다.
          </p>

          <h3>증거 기반 판정</h3>
          <p>
            대화 전체를 한 번에 평가하지 않습니다. 참여자가 스스로 꺼낸 발화에서
            미시 증거를 뽑고, 그 증거의 가중치를 코드가 합산해 축마다 판정
            글자와 강도를 냅니다. 인터뷰어가 답의 후보를 내밀어 받아낸 답은
            증거로 세지 않습니다. 유도해서 얻은 답이 아무 값도 갖지 않아야
            인터뷰어에게 그 질문이 지름길이 되지 않기 때문입니다. 증거가 한 건도
            없는 축은 기본 극으로 채우고 축별 집계에서 뺍니다.
          </p>

          <h3>비식별 처리</h3>
          <p>
            제출된 요구와 인용 발화는 비식별 사본으로 바꾼 뒤 이 문서에 씁니다.
            인용마다 인용 ID가 붙어 있어 근거를 제출본 상세까지 따라갈 수
            있습니다.
          </p>

          <h3>표본의 성격과 한계</h3>
          <p>
            참여자는 무작위로 뽑은 표본이 아니라 홍보를 보고 스스로 참여한
            청년입니다. 이 문서의 수치는 참여한 사람들이 실제로 한 말이며 인천
            청년 전체를 대표하지 않습니다. 자치구당 참여자가 한 자릿수이므로
            자치구 사이의 요구 성향은 비교하지 않고, 표지의 지도는 참여가 어디에
            몰렸는지만 보여줍니다.
          </p>
        </div>
      </div>

      <div className={styles.wide}>
        <h3 className={styles.wideh3}>도시가치 4축의 정의</h3>
        <div className={styles.axdefs}>
          {GUIDE.axes.map((axis) => (
            <article className={styles.axdef} key={axis.title}>
              <h4>{axis.title}</h4>
              <p>{axis.measures}</p>
              {axis.poles.map((pole) => (
                <p className={styles.poledef} key={pole.name}>
                  <b>{pole.name}</b> {pole.description}
                </p>
              ))}
            </article>
          ))}
        </div>
        <p className={styles.caption}>
          {GUIDE.excluded_axis.display} · {GUIDE.excluded_axis.title} —{" "}
          {GUIDE.excluded_axis.reason}
        </p>
      </div>

      <div className={styles.read}>
        <h3>이번 표본은 어땠나</h3>
        <AiText html={sample} />
      </div>
    </Band>
  );
}

export function TopicSection({
  lead,
  participants,
  quotes,
  read,
  topics,
}: {
  lead: string | undefined;
  participants: number;
  quotes: BriefingQuote[];
  read: string | undefined;
  topics: TopicStat[] | undefined;
}) {
  const [active, setActive] = useState<string | null>(null);
  const base = useId();

  const rows = [...(topics ?? [])].sort(
    (left, right) =>
      right.demands - left.demands || left.topic.localeCompare(right.topic),
  );
  const max = Math.max(1, ...rows.map((row) => row.demands));

  return (
    <Band>
      <div className={styles.read}>
        <Head n="03" title="무엇을 가장 많이 말했나" />
        <AiText html={lead} />
      </div>

      <div className={styles.wide}>
        {rows.length === 0 ? (
          <p className={styles.missing}>계획 부문 집계가 아직 없습니다.</p>
        ) : (
          <>
            <ul className={styles.rows}>
              {rows.map((row, index) => {
                const id = `${base}-${row.topic}`;
                const open = active === row.topic;
                const quote = firstQuote(quotes, row.topic);

                return (
                  <li key={row.topic}>
                    <button
                      /* Spelled out, because the three cells run together into
                         one unpunctuated string when read aloud. */
                      aria-label={`${row.topic}, 담당 ${SECTIONS[row.topic]}, 요구 ${row.demands}건, ${row.people}명이 언급`}
                      aria-controls={id}
                      aria-expanded={open}
                      className={styles.row}
                      onClick={() => setActive(open ? null : row.topic)}
                      type="button"
                    >
                      <span className={styles.rowlabel}>
                        {row.topic}
                        <em>{SECTIONS[row.topic]}</em>
                      </span>
                      <span className={styles.track}>
                        <Fill index={index} max={max} value={row.demands} />
                      </span>
                      <span className={styles.rownum}>
                        요구 <b>{row.demands}</b>건 · {row.people}명 언급
                      </span>
                    </button>
                    <div className={styles.panel} data-open={open} id={id}>
                      <div>
                        {quote ? (
                          <QuoteText quote={quote} />
                        ) : (
                          <p className={styles.missing}>
                            이 부문으로 태그된 비식별 인용이 아직 없습니다.
                          </p>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
            <p className={styles.caption}>
              막대 길이는 요구가 가장 많은 부문({max}건)에 대한 상대 길이입니다.
              부문 이름 아래는 그 부문을 담당하는 부서이고, 뒤의 인원은 참여자{" "}
              {participants}명 가운데 그 부문을 언급한 사람 수입니다. 부문을
              누르면 그 부문에서 나온 대표 인용을 펼칩니다.
            </p>
          </>
        )}
      </div>

      <div className={styles.read}>
        <AiText html={read} />
      </div>
    </Band>
  );
}

/**
 * The two poles of an axis are equal preferences, so they are told apart by the
 * city's own two colours: Incheon Blue (Pantone 300C) on the left, Incheon Green
 * (326C) on the right. Never a good/bad split.
 */
export function AxisSection({
  lead,
  read,
  stats,
  summaries,
}: {
  lead: string | undefined;
  read: string | undefined;
  stats: AxisStat[];
  summaries: AxisSummary[];
}) {
  const max = Math.max(
    1,
    ...stats.flatMap((stat) => stat.poles.map((pole) => pole.count)),
  );

  return (
    <Band>
      <div className={styles.read}>
        <Head n="04" title="어떤 도시를 바라나" />
        <AiText html={lead} />
      </div>

      <div className={styles.wide}>
        {stats.length === 0 ? (
          <p className={styles.missing}>축 집계가 아직 없습니다.</p>
        ) : (
          <>
            {stats.map((stat, axisIndex) => {
              const [left, right] = stat.poles;
              const summary = summaries.find((item) => item.axis === stat.axis);
              const total = left.count + right.count;

              return (
                <article className={styles.axis} key={stat.axis}>
                  <div className={styles.axishead}>
                    <h3>{axisTitle(stat.axis)}</h3>
                    <p>{AXIS_QUESTION[stat.axis]}</p>
                    <span>이 축에 증거가 있는 참여자 {total}명</span>
                  </div>

                  <div className={styles.mirror}>
                    {[left, right].map((pole, index) => (
                      <div
                        className={`${styles.side} ${index === 0 ? styles.sideL : styles.sideR}`}
                        key={pole.letter}
                      >
                        <span className={styles.polename}>
                          {getPoleBadge(stat.axis, pole.letter)}
                        </span>
                        <span className={styles.polenum}>
                          {pole.count === 0
                            ? "판정된 참여자 없음"
                            : `${pole.count}명 · 판정 강도 평균 ${pole.mean_strength}`}
                        </span>
                        <span className={styles.mtrack}>
                          <Fill
                            className={
                              index === 0 ? styles.mfillL : styles.mfillR
                            }
                            index={axisIndex}
                            max={max}
                            value={pole.count}
                          />
                        </span>
                      </div>
                    ))}
                  </div>

                  <div className={styles.poles}>
                    {(summary?.poles ?? []).map((pole) => (
                      <div key={pole.letter}>
                        <h4>
                          {getPoleBadge(stat.axis, pole.letter)} 쪽 요구 경향
                        </h4>
                        {pole.sentences.length === 0 ? (
                          <p className={styles.missing}>
                            이 극으로 판정된 참여자가 없습니다.
                          </p>
                        ) : (
                          pole.sentences.map((sentence, index) => (
                            <Rich
                              className={styles.serif}
                              html={sentence}
                              key={index}
                            />
                          ))
                        )}
                      </div>
                    ))}
                  </div>

                  {(summary?.quotes ?? []).length > 0 && (
                    <div className={styles.axquotes}>
                      {summary?.quotes.map((quote) => (
                        <figure className={styles.quote} key={quote.quote_id}>
                          <blockquote>“{quote.text}”</blockquote>
                          <figcaption>
                            <span className={styles.qid}>{quote.quote_id}</span>
                          </figcaption>
                        </figure>
                      ))}
                    </div>
                  )}
                </article>
              );
            })}
            <p className={styles.caption}>
              좌우 막대는 같은 축의 두 극을 마주 놓은 것이고, 길이는 여덟 극
              가운데 인원이 가장 많은 극({max}명)에 대한 상대 길이입니다. 왼쪽
              극은 인천 블루, 오른쪽 극은 인천 그린으로 인천시 상징색 두 가지를
              그대로 썼습니다. 두 색은 좋음과 나쁨이 아니라 대등한 선호를
              가리킵니다. 판정 강도는 백분율이 아니라 그 극으로 얼마나 치우쳐
              판정됐는지를 51~100으로 나타낸 지표이며, 증거가 없어 기본 극으로
              채워진 축은 이 집계에 들어가지 않습니다.
            </p>
          </>
        )}
      </div>

      <div className={styles.read}>
        <AiText html={read} />
      </div>
    </Band>
  );
}

/** The one section where two demands actually oppose, so the one that gets the accent. */
export function TensionSection({
  tensions,
}: {
  tensions: BriefingTension[] | undefined;
}) {
  return (
    <Band className={styles.tensions}>
      <div className={styles.read}>
        <Head n="05" title="엇갈리는 요구" />
      </div>

      <div className={styles.wide}>
        {tensions?.length ? (
          tensions.map((tension) => (
            <article className={styles.tension} key={tension.title}>
              <h3>{tension.title}</h3>
              <Rich className={styles.serif} html={tension.body} />
              <div className={styles.sidebyside}>
                {[
                  {
                    side: "left",
                    label: tension.left_label,
                    quotes: tension.left_quotes,
                  },
                  {
                    side: "right",
                    label: tension.right_label,
                    quotes: tension.right_quotes,
                  },
                ].map(({ label, quotes, side }) => (
                  <div className={styles.tside} key={side}>
                    <h4>{label}</h4>
                    {quotes.length === 0 ? (
                      <p className={styles.missing}>
                        이쪽을 가리키는 인용을 고르지 못했습니다.
                      </p>
                    ) : (
                      quotes.map((quote) => (
                        <figure className={styles.quote} key={quote.quote_id}>
                          <blockquote>“{quote.text}”</blockquote>
                          <figcaption>
                            <span className={styles.qid}>{quote.quote_id}</span>
                            {/* Every one of these links reads "제출본 열기", so
                                the quote number carries the difference. */}
                            <a
                              aria-label={`인용 ${quote.quote_id}의 제출본 열기`}
                              href={`/admin/submissions/${quote.submission_id}`}
                              rel="noopener"
                              target="_blank"
                            >
                              제출본 열기
                            </a>
                          </figcaption>
                        </figure>
                      ))
                    )}
                  </div>
                ))}
              </div>
            </article>
          ))
        ) : (
          <p className={styles.missing}>
            AI 서술 없음 — 이번 실행은 엇갈리는 요구를 정리하지 못했습니다.
          </p>
        )}
      </div>
    </Band>
  );
}

/** Age comparisons are absolute counts only; a share would overstate this sample. */
export function CrossSection({
  ages,
  cross,
  lead,
  participants,
  read,
  topics,
}: {
  ages: AgeBand[] | undefined;
  cross: Record<string, number[]> | undefined;
  lead: string | undefined;
  participants: number;
  read: string | undefined;
  topics: TopicStat[] | undefined;
}) {
  return (
    <Band>
      <div className={styles.read}>
        <Head n="06" title="누가 무엇을 말했나" />
        <AiText html={lead} />
      </div>

      <div className={styles.wide}>
        <h3 className={styles.wideh3}>연령과 성별 구성</h3>
        {ages?.length ? (
          <>
            <div className={styles.scroller}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th scope="col">연령대</th>
                    <th scope="col">남성</th>
                    <th scope="col">여성</th>
                    <th scope="col">기타</th>
                    <th scope="col">합계</th>
                  </tr>
                </thead>
                <tbody>
                  {ages.map((band) => (
                    <tr key={band.band}>
                      <th scope="row">{band.band}세</th>
                      <td>{band.male}명</td>
                      <td>{band.female}명</td>
                      <td>{band.other}명</td>
                      <td>{band.total}명</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className={styles.caption}>
              참여자 {participants}명을 연령대와 성별로 나눈 건수입니다.
              &lsquo;기타&rsquo;는 그 외의 성별과 밝히지 않은 경우를 함께
              담습니다.
            </p>
          </>
        ) : (
          <p className={styles.missing}>연령 집계가 아직 없습니다.</p>
        )}

        <h3 className={styles.wideh3}>계획 부문과 연령대의 교차</h3>
        {topics?.length && cross ? (
          <>
            <div className={styles.scroller}>
              <table className={`${styles.table} ${styles.crosstable}`}>
                <thead>
                  <tr>
                    <th scope="col">계획 부문</th>
                    {AGE_BANDS.map((band) => (
                      <th key={band} scope="col">
                        {band}세
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {topics.map((row) => (
                    <tr key={row.topic}>
                      <th scope="row">{row.topic}</th>
                      {AGE_BANDS.map((band, index) => (
                        <td key={band}>
                          {(cross[row.topic] ?? [])[index] ?? 0}건
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className={styles.caption}>
              각 칸은 그 연령대가 말한 요구의 건수입니다. 표본이 작아 비율로
              비교하지 않고 건수만 싣습니다. 집계 대상은 참여자 {participants}
              명입니다.
            </p>
          </>
        ) : (
          <p className={styles.missing}>교차 집계가 아직 없습니다.</p>
        )}
      </div>

      <div className={styles.read}>
        <AiText html={read} />
      </div>
    </Band>
  );
}

export function TypeSection({
  distribution,
  lead,
  participants,
  read,
}: {
  distribution: Record<string, number>;
  lead: string | undefined;
  participants: number;
  read: string | undefined;
}) {
  const rows = Object.entries(distribution).sort(
    (left, right) => right[1] - left[1] || left[0].localeCompare(right[0]),
  );
  const max = Math.max(1, ...rows.map(([, count]) => count));

  return (
    <Band>
      <div className={styles.read}>
        <Head n="07" title="바라는 도시유형" />
        <AiText html={lead} />
      </div>

      <div className={styles.wide}>
        {rows.length === 0 ? (
          <p className={styles.missing}>유형 집계가 아직 없습니다.</p>
        ) : (
          <>
            <ul className={styles.rows}>
              {rows.map(([code, count], index) => (
                <li key={code}>
                  <div className={`${styles.row} ${styles.rowslim}`}>
                    <span className={styles.rowlabel}>
                      {getCityType(code).nickname}
                      <em>{spellCode(code)}</em>
                    </span>
                    <span className={styles.track}>
                      <Fill index={index} max={max} value={count} />
                    </span>
                    <span className={styles.rownum}>
                      <b>{count}</b>명
                    </span>
                  </div>
                </li>
              ))}
            </ul>
            <p className={styles.caption}>
              막대 길이는 인원이 가장 많은 유형({max}명)에 대한 상대 길이입니다.
              유형은 네 축의 판정 글자를 이어 붙인 조합이며, 별명 아래에 네 축의
              기울기를 적었습니다. 집계 대상은 참여자 {participants}명이고
              증거가 없는 축도 기본 극으로 세므로 모든 참여자가 한 유형에
              들어갑니다.
            </p>
          </>
        )}
      </div>

      <div className={styles.read}>
        <AiText html={read} />
      </div>
    </Band>
  );
}

/** Not a policy proposal but the follow-up question an officer has to answer. */
export function ImplicationSection({
  implications,
}: {
  implications: BriefingImplication[] | undefined;
}) {
  return (
    <Band>
      <div className={styles.read}>
        <Head n="08" title="확인이 필요한 것" />
        {implications?.length ? (
          <ul className={styles.implications}>
            {implications.map((item) => (
              <li key={item.question}>
                <span className={styles.badge}>
                  {item.topic}
                  {/* Several sectors are named after their own department. */}
                  {SECTIONS[item.topic] && SECTIONS[item.topic] !== item.topic
                    ? ` · ${SECTIONS[item.topic]}`
                    : ""}
                </span>
                <Rich className={styles.serif} html={item.question} />
              </li>
            ))}
          </ul>
        ) : (
          <p className={styles.missing}>
            AI 서술 없음 — 이번 실행은 확인 질문을 만들지 못했습니다.
          </p>
        )}
      </div>
    </Band>
  );
}
