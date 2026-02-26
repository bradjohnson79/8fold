export default function ContractorPaymentSetupPage() {
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-gray-900">Payment Setup</h1>
      <p className="mt-2 text-gray-600">
        Connect your payment method to accept routed jobs. Invite acceptance is blocked until payment setup is complete.
      </p>
      <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        Payment setup for Contractor V4 is required before accepting any job invites.
      </div>
    </div>
  );
}
