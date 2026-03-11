"use client";

import React from "react";

type FAQItem = {
  question: string;
  answer: string[];
};

const FAQ_ITEMS: FAQItem[] = [
  {
    question: "Do contractors on 8Fold charge by the hour?",
    answer: [
      "No. On 8Fold, you pay for the entire job - not hourly time.",
      "When you post a job, you select a price using our sliding scale system. That price covers the job from start to finish. There are no surprise hourly extensions and no time-based disputes.",
      "Payment is securely processed and only released after completion is confirmed.",
    ],
  },
  {
    question: "What makes 8Fold different from other platforms?",
    answer: [
      "8Fold is built on structure and accountability.",
      "Instead of open bidding or racing to the lowest price, jobs are routed locally by real people who match your job with qualified contractors in your area.",
      "No bidding wars. No algorithm chaos. No hourly misunderstandings.",
    ],
  },
  {
    question: "What are Routers, and why does 8Fold use them?",
    answer: [
      "Routers are community members who connect jobs with contractors.",
      "Rather than relying only on automation, 8Fold gives people the opportunity to coordinate jobs locally. This creates faster routing, local accountability, and paid opportunities for people in the community.",
    ],
  },
  {
    question: "Do I need to search for contractors myself?",
    answer: [
      "No.",
      "You post your job. We handle the routing.",
      "Routers send your job to appropriate local contractors who can assign themselves to the job. There's no browsing, bidding, or vetting required on your end.",
    ],
  },
  {
    question: "When am I charged for my job?",
    answer: [
      "You are charged when you post your job.",
      "Your payment is securely processed and held in escrow. Funds are released only after job completion is confirmed.",
      "If your job is not assigned within 7 days (approximately 5 business days), you may request a refund.",
    ],
  },
  {
    question: "How does payment protection work?",
    answer: [
      "8Fold acts as the neutral mediator.",
      "Funds are held securely until completion is confirmed by all parties. This protects both the Job Poster and the Contractor.",
    ],
  },
  {
    question: "I'm a contractor. Are there membership fees?",
    answer: [
      "No membership fees. No advertising fees.",
      "Qualified contractors can join 8Fold and receive routed jobs directly. You simply accept jobs, complete the work, and get paid according to the structured payout model.",
    ],
  },
  {
    question: "How much do contractors earn on 8Fold?",
    answer: [
      "Contractors keep 80% of the job value on local urban jobs.",
      "For regional jobs that require travel, contractors keep 85% of the job value.",
      "Routers earn 10% for coordinating and assigning the job. The platform retains the remaining share.",
      "All splits are shown upfront — no hidden fees, no surprises.",
    ],
  },
  {
    question: "I'm interested in becoming a Router. Am I eligible?",
    answer: [
      "Yes.",
      "Anyone with reliable internet access and a bank account for direct deposit can apply. Routers help connect jobs with contractors in their region and earn income from successful connections.",
    ],
  },
  {
    question: "Wait... are you saying I can sign up as a Router and start earning?",
    answer: [
      "Yes - that's exactly what we're saying.",
      "After completing your basic profile setup, you can begin routing available jobs in your area.",
      "Routers can also earn additional income through Referral Rewards when referred Job Posters or Contractors successfully complete jobs.",
    ],
  },
];

function FAQHeaderIcon() {
  return (
    <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-400/10 text-emerald-300 ring-1 ring-emerald-400/25">
      <svg
        className="h-6 w-6"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        aria-hidden
      >
        <circle cx="12" cy="12" r="9" />
        <path d="M9.25 9a2.75 2.75 0 0 1 5.5 0c0 1.2-.62 1.82-1.4 2.38-.9.65-1.35 1.05-1.35 2.12" />
        <circle cx="12" cy="17.2" r="0.85" fill="currentColor" stroke="none" />
      </svg>
    </span>
  );
}

export function HomepageFAQSection() {
  const [openIndex, setOpenIndex] = React.useState<number>(0);

  return (
    <section className="relative overflow-hidden bg-gradient-to-b from-[#0b1622] via-[#0f2132] to-[#15283a] py-20">
      <div className="absolute inset-0 pointer-events-none opacity-70">
        <div className="absolute left-1/2 top-10 h-64 w-64 -translate-x-1/2 rounded-full bg-emerald-500/10 blur-3xl" />
      </div>

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <div className="mb-5 flex justify-center">
            <FAQHeaderIcon />
          </div>
          <h2 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
            Frequently Asked Questions
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-gray-300">
            Everything you need to know about how 8Fold works.
          </p>
        </div>

        <div className="mx-auto mt-10 max-w-4xl space-y-4">
          {FAQ_ITEMS.map((item, index) => {
            const isOpen = openIndex === index;
            const answerId = `homepage-faq-answer-${index}`;

            return (
              <article
                key={item.question}
                className="rounded-2xl border border-white/10 bg-white/[0.04] shadow-lg shadow-black/20 backdrop-blur-sm"
              >
                <h3>
                  <button
                    type="button"
                    className="flex w-full items-center justify-between gap-4 px-5 py-5 text-left sm:px-6"
                    aria-expanded={isOpen}
                    aria-controls={answerId}
                    onClick={() => setOpenIndex(isOpen ? -1 : index)}
                  >
                    <span className="text-base font-bold text-white sm:text-lg">
                      {item.question}
                    </span>
                    <span
                      className={`inline-flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border border-white/15 text-white transition-transform duration-300 ${
                        isOpen ? "rotate-180 bg-emerald-400/20 text-emerald-200" : "bg-white/5"
                      }`}
                      aria-hidden
                    >
                      <svg
                        className="h-4 w-4"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={2.2}
                        strokeLinecap="round"
                      >
                        {isOpen ? <path d="M7 12h10" /> : <path d="M12 7v10M7 12h10" />}
                      </svg>
                    </span>
                  </button>
                </h3>

                <div
                  id={answerId}
                  className={`grid transition-[grid-template-rows,opacity] duration-300 ease-out ${
                    isOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-70"
                  }`}
                >
                  <div className="overflow-hidden">
                    <div className="max-w-3xl px-5 pb-5 text-[15px] leading-7 text-gray-200 sm:px-6">
                      {item.answer.map((paragraph) => (
                        <p key={paragraph} className="mt-2 first:mt-0">
                          {paragraph}
                        </p>
                      ))}
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
