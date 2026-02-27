import { StripeExpressPayoutSetup } from "@/components/StripeExpressPayoutSetup";

export default function ContractorPaymentSetupPage() {
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-gray-900">Payment Setup</h1>
      <p className="mt-2 text-gray-600">
        Connect your payment method to accept routed jobs. Invite acceptance is blocked until payment setup is complete.
      </p>
      <StripeExpressPayoutSetup />
    </div>
  );
}
