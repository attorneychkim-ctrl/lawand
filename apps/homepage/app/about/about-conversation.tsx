"use client";

import { useEffect, useMemo, useState } from "react";

import { moveAttention } from "@/lib/move-attention";

import { ArrowIcon, CheckIcon } from "../bank/_components/site-chrome";

type QuestionKey = "visit" | "curiosity" | "priority" | "discovery";

type Option = {
  answer: string;
  answerCheck: string;
  answerTitle: string;
  description: string;
  label: string;
  value: string;
};

type Question = {
  eyebrow: string;
  key: QuestionKey;
  options: Option[];
  question: string;
};

const questions: Question[] = [
  {
    key: "visit",
    eyebrow: "먼저, 오늘의 목적",
    question: "무엇을 확인하려고 로앤을 찾아오셨나요?",
    options: [
      {
        value: "learn",
        label: "회생·파산 제도부터 알아보려고",
        description: "아직 상담보다 정보를 먼저 보고 싶어요.",
        answerTitle: "상담부터 서두르지 않으셔도 됩니다.",
        answer:
          "개인회생과 파산은 채무액 하나만으로 고르지 않습니다. 먼저 매달 반복되는 소득, 생계비를 빼고 남는 금액, 담보를 제외한 재산과 최근 처분 내역을 정리해 보세요. 이 세 가지를 모르면 누구도 책임 있게 방향을 말하기 어렵습니다.",
        answerCheck:
          "자격·절차·필요서류를 먼저 읽고, 상담은 필요하다고 느낄 때 결정해도 됩니다.",
      },
      {
        value: "compare",
        label: "법률대리인을 비교해 보려고",
        description: "누구에게 맡길지 판단할 기준이 필요해요.",
        answerTitle: "사건 수보다 ‘내 사건을 누가 어떻게 맡는지’를 물어보세요.",
        answer:
          "처음 상담한 사람과 실제 사건 담당자가 같은지, 수임료에 어떤 업무가 포함되는지, 보정명령이나 채권자 이의가 생기면 누구에게 어떻게 연락받는지 확인하세요. 이런 질문에 답이 흐리면 계약을 서두를 이유가 없습니다.",
        answerCheck:
          "계약 전 업무 범위, 추가 비용 가능성, 담당 연락 방법을 문서로 확인하는 편이 안전합니다.",
      },
      {
        value: "trust",
        label: "상담 전에 믿을 만한 곳인지 보려고",
        description: "광고 문구보다 확인 가능한 근거가 궁금해요.",
        answerTitle: "저희도 자료를 보기 전에는 가능하다고 장담하지 않습니다.",
        answer:
          "전화 몇 분만으로 ‘무조건 된다’고 말하면 빠른 답은 될 수 있어도 정확한 답은 아닙니다. 소득·재산·채무 내역과 최근 거래를 확인해야 유리한 점뿐 아니라 불리할 수 있는 부분도 설명할 수 있습니다.",
        answerCheck:
          "로앤을 포함해 어느 곳이든 결과 보장보다 확인할 자료와 변수를 먼저 말하는지 보세요.",
      },
      {
        value: "client",
        label: "이미 로앤과 함께하고 있어서",
        description: "사건 진행과 소통 방식을 다시 확인하고 싶어요.",
        answerTitle: "진행이 조용하면 불안한 것이 당연합니다.",
        answer:
          "담당자에게 지금 단계, 다음 제출 또는 법원 일정, 내가 준비할 일을 세 가지로 나눠 물어보세요. 로앤은 상담 접수와 담당 배정을 기록으로 남기고, 계약 뒤 사건 정보는 리걸프렌즈로 이어서 확인합니다.",
        answerCheck:
          "현재 단계가 보이지 않거나 담당 연락이 이어지지 않으면 접수번호나 사건정보와 함께 다시 확인해 주세요.",
      },
    ],
  },
  {
    key: "curiosity",
    eyebrow: "두 번째, 일하는 방식",
    question: "법무법인의 어떤 모습이 가장 궁금한가요?",
    options: [
      {
        value: "responsibility",
        label: "누가 판단하고 책임지는지",
        description: "자동 답변이 아니라 사람의 판단을 원해요.",
        answerTitle: "AI나 자동화가 회생·파산 가능 여부를 결정하지 않습니다.",
        answer:
          "시스템은 접수 누락을 막고 자료를 정리하며 확인 질문 후보를 만들 수 있습니다. 하지만 어떤 절차를 택할지, 법원에 무엇을 제출할지, 불리한 사실을 어떻게 설명할지는 담당자가 원문을 보고 판단해야 합니다.",
        answerCheck:
          "자동으로 만들어진 요약이나 초안도 사람의 확인 없이 고객 안내나 법원 제출로 확정하지 않습니다.",
      },
      {
        value: "explanation",
        label: "어떻게 설명해 주는지",
        description: "법률용어보다 내 질문에 맞는 설명이 중요해요.",
        answerTitle: "좋은 설명이라면 네 가지가 남아야 합니다.",
        answer:
          "현재 확인된 사실, 아직 모르는 것, 그래서 달라질 수 있는 결과, 지금 준비할 자료입니다. ‘가능합니다’라는 한 문장만 남고 이유와 변수가 없다면 충분한 설명이 아닙니다.",
        answerCheck:
          "상담 뒤에도 왜 그런 방향을 제안했는지 본인의 말로 다시 설명할 수 있어야 합니다.",
      },
      {
        value: "continuity",
        label: "계약 뒤에도 소통이 이어지는지",
        description: "담당이 바뀌거나 진행을 놓치는 것이 걱정돼요.",
        answerTitle: "담당자 이름만 아는 것으로는 충분하지 않습니다.",
        answer:
          "현재 단계, 다음 기한, 고객이 할 일, 담당자가 확인할 일을 함께 기록해야 담당 변경이나 연락 공백이 생겨도 사건이 이어집니다. 로앤은 상담 접수, 담당 배정, 외부 사건 인계를 각각 기록으로 남깁니다.",
        answerCheck:
          "계약 전에는 진행 알림을 어디서 받고, 질문이 생기면 어느 채널을 쓰는지 먼저 확인하세요.",
      },
      {
        value: "evidence",
        label: "실제 경험과 사무소가 있는지",
        description: "직접 확인할 수 있는 자료를 보고 싶어요.",
        answerTitle:
          "이 페이지의 후기 숫자는 ‘성공 건수’가 아니라 현재 공개 중인 후기 수입니다.",
        answer:
          "좋은 결과를 보장하는 숫자로 쓰지 않습니다. 후기마다 작성일과 상담·개시·면책 같은 작성 당시 단계를 함께 보여주고, 개인정보 검수 대기·삭제 글은 공개 집계에서 제외합니다.",
        answerCheck:
          "서울·대전·부산 사무소의 주소·전화·사업자정보도 이 페이지 아래에 그대로 공개합니다.",
      },
    ],
  },
  {
    key: "priority",
    eyebrow: "세 번째, 선택의 기준",
    question: "변호사를 선택할 때 무엇을 가장 중요하게 보시나요?",
    options: [
      {
        value: "honesty",
        label: "과장하지 않는 설명",
        description: "좋은 이야기뿐 아니라 변수도 알고 싶어요.",
        answerTitle: "듣기 좋은 말보다, 걸리는 부분을 먼저 묻겠습니다.",
        answer:
          "최근 대출·재산 처분, 누락된 채권자, 불규칙한 소득, 과거 면책처럼 절차에 영향을 줄 수 있는 사실은 숨긴다고 없어지지 않습니다. 처음부터 확인해야 보정이나 기각 위험을 줄이는 준비가 가능합니다.",
        answerCheck:
          "로앤도 결과나 기간을 무조건 약속하지 않습니다. 법원과 사실관계에 따라 달라지는 범위를 설명해야 합니다.",
      },
      {
        value: "specificity",
        label: "내 상황을 구체적으로 보는 태도",
        description: "정형화된 답보다 내 자료를 봐주면 좋겠어요.",
        answerTitle: "채무 금액이 같아도 같은 답을 드릴 수 없습니다.",
        answer:
          "급여인지 사업소득인지, 부양가족과 실제 생계비가 어떤지, 차량·보험·보증금·퇴직금이 있는지, 담보채무와 최근 거래가 어떤지가 함께 보여야 합니다. 그래서 첫 답이 짧고 단정적이면 오히려 조심해야 합니다.",
        answerCheck:
          "상담 전에는 완벽한 서류보다 알고 있는 범위를 솔직히 정리하는 것부터 충분합니다.",
      },
      {
        value: "communication",
        label: "진행 상황을 놓치지 않는 소통",
        description: "다음 할 일과 현재 단계를 알고 싶어요.",
        answerTitle: "연락이 잦은 것보다, 필요한 때 정확히 오는지가 중요합니다.",
        answer:
          "사건마다 매일 새 소식이 생기지는 않습니다. 대신 접수됐는지, 현재 어떤 단계인지, 다음 기한과 고객의 할 일이 무엇인지는 놓치지 않아야 합니다.",
        answerCheck:
          "계약 전에 정기 안내 방식, 긴급 연락 채널, 담당자 부재 시 대체 연락 방법을 확인하세요.",
      },
      {
        value: "access",
        label: "필요할 때 닿을 수 있는 접근성",
        description: "전화·온라인·가까운 사무소가 중요해요.",
        answerTitle: "채널이 많아도 역할이 섞이면 더 답답해집니다.",
        answer:
          "전화·카카오톡은 빠른 문의, 홈페이지 상담 요청은 ERP에 남는 정식 접수, 계약 뒤 사건 진행은 리걸프렌즈로 역할을 나눕니다. 어떤 채널로 말했는지 몰라 다시 설명하는 일을 줄이려는 구조입니다.",
        answerCheck:
          "방문이 필요하면 서울·대전·부산 사무소 주소와 연락처를 먼저 확인할 수 있습니다.",
      },
    ],
  },
  {
    key: "discovery",
    eyebrow: "마지막, 처음 만난 경로",
    question: "로앤을 어떻게 알게 되셨나요?",
    options: [
      {
        value: "search",
        label: "검색하다가",
        description: "자격·절차·서류 같은 정보를 찾았어요.",
        answerTitle: "검색 결과만으로 내 사건의 답을 만들지는 않습니다.",
        answer:
          "검색 페이지는 법 조문·법원 안내와 일반적인 확인 순서를 설명할 뿐입니다. 같은 조건처럼 보여도 재산, 소득, 최근 거래가 다르면 실제 판단은 달라질 수 있습니다.",
        answerCheck:
          "정보를 먼저 충분히 읽고, 개인 상황의 결론이 필요할 때만 상담을 요청하세요.",
      },
      {
        value: "review",
        label: "고객후기를 보고",
        description: "비슷한 과정을 먼저 겪은 사람의 글을 봤어요.",
        answerTitle: "나와 비슷한 후기가 내 결과를 대신하지는 않습니다.",
        answer:
          "후기는 ‘이 사람도 됐으니 나도 된다’는 증거가 아니라 상담 태도와 진행 경험을 보는 자료입니다. 그래서 원문, 작성일, 작성 당시 단계를 함께 보여주고 별점으로 줄 세우지 않습니다.",
        answerCheck:
          "후기는 법률 판단보다 담당자의 설명·소통 방식을 비교하는 데 활용해 주세요.",
      },
      {
        value: "referral",
        label: "주변의 소개로",
        description: "지인의 경험을 듣고 찾아왔어요.",
        answerTitle: "소개받았어도 계약 조건은 처음부터 다시 확인하세요.",
        answer:
          "지인에게 잘 맞았던 방식이 내 사건에도 같다는 보장은 없습니다. 담당자, 업무 범위, 비용, 예상 변수와 진행 채널은 본인의 조건에 맞춰 직접 설명받아야 합니다.",
        answerCheck:
          "소개해 준 사람의 결론보다 본인이 이해하고 동의한 계약 내용을 기준으로 결정하세요.",
      },
      {
        value: "other",
        label: "광고·지도 또는 다른 경로로",
        description: "처음이라 로앤을 더 알아보고 싶어요.",
        answerTitle: "광고를 보고 왔다는 이유로 상담 기준이 달라지지는 않습니다.",
        answer:
          "어떤 문구나 지도에서 처음 만났든 확인해야 할 소득·재산·채무와 설명해야 할 변수는 같습니다. 광고 유입 여부가 법률 판단이나 사건 우선순위를 정해서는 안 됩니다.",
        answerCheck:
          "지금 선택한 답은 이 페이지 안에서만 쓰이며 로앤으로 전송되거나 상담 정보에 붙지 않습니다.",
      },
    ],
  },
];

const priorityResults: Record<
  string,
  { body: string; title: string }
> = {
  honesty: {
    title: "좋은 가능성만큼, 걸리는 사실도 먼저 말하는 곳.",
    body: "최근 대출·재산 처분·누락 채권·불규칙한 소득처럼 절차에 영향을 줄 수 있는 사실부터 확인하겠습니다. 결과와 기간은 법원과 사실관계에 따라 달라지므로, 확정할 수 없는 범위도 분명히 말씀드리겠습니다.",
  },
  specificity: {
    title: "채무액 하나로, 사람의 상황을 단정하지 않는 곳.",
    body: "월 소득과 실제 생계비, 부양가족, 차량·보험·보증금·퇴직금, 담보채무와 최근 거래를 함께 확인하겠습니다. 자료가 부족하다면 결론부터 말하지 않고 무엇이 더 필요한지 먼저 설명하겠습니다.",
  },
  communication: {
    title: "연락 횟수보다, 현재 단계와 다음 일을 놓치지 않는 곳.",
    body: "접수 여부, 담당자, 현재 단계, 다음 기한과 고객이 준비할 일을 나눠 기록하겠습니다. 매일 새 소식이 없더라도 중요한 변화와 해야 할 일이 생겼을 때는 정확히 이어지게 하겠습니다.",
  },
  access: {
    title: "어디로 연락할지, 사건 단계마다 헷갈리지 않는 곳.",
    body: "전화·카카오톡은 빠른 문의, 홈페이지 상담 요청은 정식 접수, 계약 뒤 사건 진행은 리걸프렌즈로 역할을 나누겠습니다. 온라인에서 시작해도 서울·대전·부산의 실제 사무소와 담당 체계로 이어집니다.",
  },
};

export function AboutConversation() {
  const [answers, setAnswers] = useState<Partial<Record<QuestionKey, string>>>(
    {},
  );
  const [activeQuestion, setActiveQuestion] = useState(0);

  useEffect(() => {
    const sections = Array.from(
      document.querySelectorAll<HTMLElement>("[data-about-question]"),
    );
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort(
            (left, right) =>
              right.intersectionRatio - left.intersectionRatio,
          )[0];
        if (!visible) return;
        const index = Number((visible.target as HTMLElement).dataset.index);
        if (Number.isInteger(index)) setActiveQuestion(index);
      },
      { rootMargin: "-28% 0px -48% 0px", threshold: [0.1, 0.45, 0.7] },
    );
    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, []);

  const completedCount = Object.keys(answers).length;
  const result = useMemo(
    () =>
      answers.priority
        ? priorityResults[answers.priority]
        : undefined,
    [answers.priority],
  );

  function choose(questionIndex: number, key: QuestionKey, value: string) {
    setAnswers((current) => ({ ...current, [key]: value }));
    window.setTimeout(() => {
      const response = document.querySelector<HTMLElement>(
        `[data-about-answer][data-index="${questionIndex}"]`,
      );
      if (!response) return;
      moveAttention(response, {
        focusTarget: response.querySelector<HTMLElement>("h4"),
      });
    }, 80);
  }

  function continueConversation(questionIndex: number) {
    const target =
      questionIndex + 1 < questions.length
        ? document.querySelector<HTMLElement>(
            `[data-about-question][data-index="${questionIndex + 1}"]`,
          )
        : document.querySelector<HTMLElement>(".about-conversation-result");
    if (!target) return;
    moveAttention(target, {
      focusTarget: target.querySelector<HTMLElement>("h3"),
    });
  }

  return (
    <section className="about-conversation" id="conversation">
      <div className="shell about-conversation-layout">
        <aside className="about-conversation-guide">
          <p className="eyebrow">A SHORT CONVERSATION</p>
          <h2>
            소개보다 먼저,
            <br />
            무엇이 궁금한지
            <br />
            듣겠습니다.
          </h2>
          <p>
            네 번의 선택을 마치면, 로앤을 판단하실 기준 하나를 정리해
            드립니다.
          </p>
          <div
            className="about-conversation-progress"
            role="progressbar"
            aria-label="소개 질문 진행률"
            aria-valuemax={questions.length}
            aria-valuemin={0}
            aria-valuenow={completedCount}
          >
            <span style={{ width: `${(completedCount / questions.length) * 100}%` }} />
          </div>
          <ol>
            {questions.map((question, index) => {
              const answer = question.options.find(
                (option) => option.value === answers[question.key],
              );
              return (
                <li
                  className={activeQuestion === index ? "active" : undefined}
                  key={question.key}
                >
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <div>
                    <strong>{question.eyebrow}</strong>
                    <small>{answer?.label ?? "아직 선택하지 않음"}</small>
                  </div>
                </li>
              );
            })}
          </ol>
          <small className="about-conversation-privacy">
            선택한 답은 이 브라우저 화면에서만 사용되며 서버로 전송하거나
            저장하지 않습니다.
          </small>
        </aside>

        <div className="about-question-flow">
          {questions.map((question, questionIndex) => {
            const selected = question.options.find(
              (option) => option.value === answers[question.key],
            );
            return (
              <article
                className={`about-question-card ${
                  selected ? "answered" : ""
                }`}
                data-about-question
                data-index={questionIndex}
                id={`about-question-${questionIndex + 1}`}
                key={question.key}
              >
                <header>
                  <span>{String(questionIndex + 1).padStart(2, "0")}</span>
                  <p>{question.eyebrow}</p>
                </header>
                <h3 tabIndex={-1}>{question.question}</h3>
                <div className="about-answer-options">
                  {question.options.map((option) => {
                    const isSelected =
                      answers[question.key] === option.value;
                    return (
                      <button
                        aria-pressed={isSelected}
                        key={option.value}
                        onClick={() =>
                          choose(questionIndex, question.key, option.value)
                        }
                        type="button"
                      >
                        <span>
                          {isSelected ? <CheckIcon /> : null}
                        </span>
                        <div>
                          <strong>{option.label}</strong>
                          <small>{option.description}</small>
                        </div>
                      </button>
                    );
                  })}
                </div>
                {selected ? (
                  <div
                    className="about-answer-response"
                    aria-live="polite"
                    data-about-answer
                    data-index={questionIndex}
                    key={selected.value}
                  >
                    <p className="about-answer-response-label">
                      로앤의 솔직한 답
                    </p>
                    <h4 tabIndex={-1}>{selected.answerTitle}</h4>
                    <p className="about-answer-response-body">
                      {selected.answer}
                    </p>
                    <div className="about-answer-check">
                      <span>먼저 확인해 보세요</span>
                      <p>{selected.answerCheck}</p>
                    </div>
                    <button
                      className="about-answer-next"
                      onClick={() => continueConversation(questionIndex)}
                      type="button"
                    >
                      {questionIndex + 1 < questions.length
                        ? "답을 읽었어요 · 다음 질문"
                        : "답을 읽었어요 · 내 기준 확인"}
                      <ArrowIcon />
                    </button>
                  </div>
                ) : (
                  <p className="about-answer-prompt">
                    가장 가까운 답을 하나 골라주세요.
                  </p>
                )}
              </article>
            );
          })}

          <section
            className={`about-conversation-result ${
              completedCount === questions.length ? "complete" : ""
            }`}
            aria-live="polite"
          >
            {completedCount === questions.length && result ? (
              <>
                <p className="eyebrow">YOUR LAW&amp; STANDARD</p>
                <h3 tabIndex={-1}>{result.title}</h3>
                <p>{result.body}</p>
                <div>
                  <a className="button button-inverse" href="#evidence">
                    확인 가능한 기록 보기
                    <ArrowIcon />
                  </a>
                  <a
                    className="button button-outline-light"
                    href="/bank/consultation"
                    data-consultation-cta="about-conversation-result"
                  >
                    내 상황 상담 요청
                  </a>
                </div>
              </>
            ) : (
              <>
                <span>
                  {completedCount} / {questions.length}
                </span>
                <p>네 가지 답을 마치면, 선택하신 기준으로 로앤을 정리해 드립니다.</p>
              </>
            )}
          </section>
        </div>
      </div>
    </section>
  );
}
