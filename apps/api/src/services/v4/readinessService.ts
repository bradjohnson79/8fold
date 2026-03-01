import { getRoleCompletionSnapshot } from "@/src/services/v4/roleCompletionService";

export async function getV4Readiness(userId: string) {
  let snapshot;
  try {
    snapshot = await getRoleCompletionSnapshot(userId);
  } catch (error) {
    console.error("[v4/readiness] failed to load role completion snapshot", {
      userId,
      message: error instanceof Error ? error.message : String(error),
    });
    snapshot = {
      role: null,
      hasAcceptedJobPosterTerms: false,
      hasCompletedJobPosterProfile: false,
      hasCompletedJobPosterPaymentSetup: false,
      hasAcceptedContractorTerms: false,
      hasCompletedContractorProfile: false,
      hasCompletedContractorPaymentSetup: false,
      contractorPaymentSetupComplete: false,
      contractorStripeAccountId: null,
      contractorStripeOnboardingComplete: false,
      contractorStripePayoutsEnabled: false,
      hasAcceptedRouterTerms: false,
      hasCompletedRouterProfile: false,
      hasCompletedRouterPaymentSetup: false,
      roleCompletion: null,
    };
  }
  const completion = snapshot.roleCompletion;
  const roleCompletion = {
    terms: Boolean(completion?.terms),
    profile: Boolean(completion?.profile),
    payment: Boolean(completion?.payment),
    complete: Boolean(completion?.complete),
    missing: Array.isArray(completion?.missing) ? completion.missing : ["TERMS", "PROFILE", "PAYMENT"],
  };

  return {
    role: snapshot.role ?? "",
    paymentSetupComplete: roleCompletion.payment,
    roleCompletion,
    hasAcceptedJobPosterTerms: snapshot.hasAcceptedJobPosterTerms,
    hasCompletedJobPosterProfile: snapshot.hasCompletedJobPosterProfile,
    hasCompletedJobPosterPaymentSetup: snapshot.hasCompletedJobPosterPaymentSetup,
    hasAcceptedContractorTerms: snapshot.hasAcceptedContractorTerms,
    hasCompletedContractorProfile: snapshot.hasCompletedContractorProfile,
    hasCompletedContractorPaymentSetup: snapshot.hasCompletedContractorPaymentSetup,
    contractorPaymentSetupComplete: snapshot.contractorPaymentSetupComplete,
    contractorStripeAccountId: snapshot.contractorStripeAccountId,
    contractorStripeOnboardingComplete: snapshot.contractorStripeOnboardingComplete,
    contractorStripePayoutsEnabled: snapshot.contractorStripePayoutsEnabled,
    hasAcceptedRouterTerms: snapshot.hasAcceptedRouterTerms,
    hasCompletedRouterProfile: snapshot.hasCompletedRouterProfile,
    hasCompletedRouterPaymentSetup: snapshot.hasCompletedRouterPaymentSetup,
    // Legacy fields retained for compatibility while web migrates.
    jobPosterReady: snapshot.hasCompletedJobPosterProfile,
    jobPosterAcceptedTos: snapshot.hasAcceptedJobPosterTerms,
    contractorAcceptedTos: snapshot.hasAcceptedContractorTerms,
    contractorReady: snapshot.hasCompletedContractorProfile,
    routerReady: snapshot.hasCompletedRouterProfile,
    routerAcceptedTos: snapshot.hasAcceptedRouterTerms,
    routes: {
      jobPoster: "/post-job",
      contractor: "/contractor/setup",
      router: "/dashboard/setup",
    },
  };
}
