export interface VerificationResult {
  isValid: boolean;
  correctionRequired: boolean;
  correctionPrompt?: string;
}

export class ResponseVerifier {
  /**
   * Generates a prompt instruction that forces the model to self-verify its drafted response
   * against strict factuality and logical constraints before finalizing.
   */
  public buildVerificationPrompt(): string {
    return `
[SELF-VERIFICATION PHASE]
Before outputting your final response, silently evaluate your draft against the following criteria:
1. FACTUALITY: Do not invent names, dates, URLs, or statistics. State uncertainty if unsure.
2. LOGICAL CONSISTENCY: Ensure there are no contradictory statements.
3. CONSTRAINTS: Did you respect the user's specific formatting or constraints?
4. UNCERTAINTY: If the information is outdated or unverified, explicitly state this.

If your draft fails any criteria, correct it immediately before responding.
Do not output the verification process, only output the final, verified response.`;
  }
}
