import { RolePage } from "../_components/RolePage";

export default function ContractorsWorkerPage() {
  return (
    <RolePage
      roleTitle="Contractors"
      valueProp="Get routed work in your trade with transparent pricing, protected payments, and no race-to-the-bottom bidding."
      whoItsFor="For skilled trades and service professionals who want steady, structured work without lead ads or price games."
      responsibilities={[
        "Accept jobs routed to you that match your trade and region.",
        "Complete work to spec and update progress through the platform.",
        "Submit Parts & Materials receipts for reimbursement (escrow-backed).",
        "Get paid after completion is properly confirmed.",
      ]}
      notResponsibleFor={[
        "Paying for Parts & Materials without reimbursement rules or receipts.",
        "Competing against other contractors to undercut price.",
        "Dealing with ambiguous payout math or hidden deductions.",
      ]}
      paidSummary="Contractors receive 75% of labor and keep 100% of tips. The platform shows the split upfront so you know what the job pays before you commit."
      payoutTiming={[
        "Stripe (Direct Bank Deposit) payouts are typically processed immediately or next business day once a job is completed.",
        "PayPal payouts may have a clearing period of 3 or more business days after job completion before funds are transferred.",
        "Payouts are issued in full minus any transaction or transfer fees charged by the selected payout provider (e.g., Stripe or PayPal). 8Fold does not add additional payout fees.",
      ]}
      perks={[
        "No bidding wars and no lead marketplaces — jobs are routed with clear expectations.",
        "Transparent economics: contractor 75% of labor, router 15%, platform 10%.",
        "Parts & Materials handled via escrow with receipts and verification.",
        "Admin oversight and dispute handling when needed to keep jobs from falling through the cracks.",
      ]}
      whyDifferent={[
        "Pricing logic is established before work begins — fewer unrealistic jobs and less friction.",
        "Clear role separation keeps coordination clean and professional.",
        "Protected payment flow: confirmations determine payout timing.",
        "No platform undercutting or shifting percentages after the job.",
      ]}
      ctaLabel="Sign Up"
      ctaHref="/sign-up"
    />
  );
}

