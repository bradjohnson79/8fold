declare module "email-deep-validator" {
  interface VerifyResult {
    wellFormed?: boolean;
    validDomain?: boolean;
    validMailbox?: boolean | null;
  }

  export default class EmailValidator {
    constructor(opts?: { timeout?: number });
    verify(email: string): Promise<VerifyResult>;
  }
}
