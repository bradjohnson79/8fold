import { RolePage } from "../_components/RolePage";

export default function RoutersWorkerPage() {
  return (
    <RolePage
      roleTitle="Routers"
      valueProp="Coordinate local jobs and earn a predictable routing fee — without doing labor."
      whoItsFor="For coordinators, connectors, and organizers who are responsive, reliable, and good at follow-through."
      responsibilities={[
        "Claim available jobs in your region (first-come, first-served).",
        "Route each job to a vetted contractor who can complete it.",
        "Coordinate progress and keep the handoff clean and accountable.",
        "Earn your routing fee when completion is properly confirmed.",
      ]}
      notResponsibleFor={[
        "Performing labor, bringing tools, or taking on job-site liability.",
        "Negotiating pricing or competing in bidding wars.",
        "Hoarding jobs — daily routing limits prevent it.",
      ]}
      paidSummary="Routers earn 15% of labor on completed jobs. The split is shown upfront on every job so you know exactly what you’re earning before you act."
      payoutTiming={[
        "Stripe (Direct Bank Deposit) payouts are typically processed immediately or next business day once a job is completed.",
        "PayPal payouts may have a clearing period of 3 or more business days after job completion before funds are transferred.",
        "Payout timing depends on the selected provider and may be subject to third‑party processing delays.",
      ]}
      perks={[
        "Earnings visibility upfront (no guessing).",
        "No cold calling and no bidding wars — the job is already posted and funded.",
        "Admin step-in when jobs stall or need a failsafe router.",
        "Dispute handling supported by clear job states and confirmations.",
      ]}
      whyDifferent={[
        "Routing is a real role with real economics — not a hidden middleman layer.",
        "Structured workflow reduces friction between posters and contractors.",
        "Transparent split: contractor 75%, router 15%, platform 10%.",
        "Accountability: one router per job, tracked progress, and oversight when needed.",
      ]}
      ctaLabel="Sign Up"
      ctaHref="/sign-up"
    />
  );
}

