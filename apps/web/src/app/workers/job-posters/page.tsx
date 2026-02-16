import { RolePage } from "../_components/RolePage";

export default function JobPostersWorkerPage() {
  return (
    <RolePage
      roleTitle="Job Posters"
      valueProp="Post a job once, get clear pricing, and stay protected from start to finish."
      whoItsFor="For homeowners, renters, property managers, and small businesses who want reliable outcomes without negotiation chaos."
      responsibilities={[
        "Describe the job once (title, scope, photos if helpful).",
        "Review a fair, AI-assisted baseline price and adjust within a small range if needed.",
        "Fund the job securely before it goes live for routing.",
        "Approve completion through clear confirmations so everyone is paid correctly.",
      ]}
      notResponsibleFor={[
        "Negotiating with multiple contractors or managing bidding wars.",
        "Guessing fee math or payout splits.",
        "Paying for parts & materials without receipts or verification.",
      ]}
      paidSummary="As a Job Poster, you pay a single, transparent job total. The platform shows exactly how money is allocated before work begins."
      payoutTiming={[
        "Pricing is set before routing begins; no surprise changes after the fact.",
        "Parts & Materials are handled via escrow + reimbursement rules (receipts required).",
        "Refunds and reimbursements are processed through Stripe and returned to the original payment method per Stripe timelines.",
      ]}
      perks={[
        "AI-assisted pricing baseline to reduce inflated quotes and speed up acceptance.",
        "Escrow protections for Parts & Materials with receipt verification.",
        "Admin oversight when jobs stall or need escalation.",
        "Clear dispute handling with documented job state and confirmations.",
      ]}
      whyDifferent={[
        "No auctions. No race-to-the-bottom bidding.",
        "Clear economics and deterministic payout math.",
        "Structured roles: routing and labor are handled by the right people.",
        "Accountability built into the workflow, not left to chance.",
      ]}
      ctaLabel="Sign Up as a Job Poster"
      ctaHref="/signup?role=job-poster"
    />
  );
}

