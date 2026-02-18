import { RouterTermsClient } from "../RouterTermsClient";

export default async function RouterTermsPage() {
  // RouterWizardGate is authoritative; this route exists for direct navigation only.
  // Do not mount wizard components here (prevents hybrid states / double-mount).
  void RouterTermsClient;
  return null;
}

