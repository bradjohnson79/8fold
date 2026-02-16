"use client";

export function PayoutDisclosures(props: { includeRefundNote?: boolean }) {
  return (
    <div className="border border-gray-200 rounded-2xl p-5 bg-white">
      <div className="text-sm font-semibold text-gray-500">Payout Methods &amp; Timing</div>
      <div className="mt-2 text-sm text-gray-800 space-y-2">
        <ul className="list-disc pl-5 space-y-1">
          <li>
            Stripe (Direct Bank Deposit) payouts are typically processed immediately or next business day once a
            job is completed.
          </li>
          <li>
            PayPal payouts may have a clearing period of 3 or more business days after job completion before
            funds are transferred.
          </li>
        </ul>
        <div className="text-sm text-gray-700">
          Payout timing depends on the selected provider and may be subject to third-party processing delays.
        </div>
      </div>

      <div className="mt-4 border-t border-gray-100 pt-4">
        <div className="text-sm font-semibold text-gray-500">Fee Notice</div>
        <div className="mt-2 text-sm text-gray-800">
          Payouts are issued in full minus any transaction or transfer fees charged by the selected payout provider
          (e.g., Stripe or PayPal). 8Fold does not add additional payout fees.
        </div>
      </div>

      {props.includeRefundNote ? (
        <div className="mt-4 border-t border-gray-100 pt-4">
          <div className="text-sm font-semibold text-gray-500">Refunds &amp; Reimbursements</div>
          <div className="mt-2 text-sm text-gray-800">
            Refunds and reimbursements are processed through Stripe and returned to the original payment method
            according to Stripe’s processing timelines.
          </div>
        </div>
      ) : null}
    </div>
  );
}

