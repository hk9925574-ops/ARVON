export enum ResponseFormat {
  SHORT_ANSWER = 'SHORT_ANSWER',
  PARAGRAPH = 'PARAGRAPH',
  BULLETS = 'BULLETS',
  TABLE = 'TABLE',
  STEPS = 'STEPS',
  CODE = 'CODE',
  CHECKLIST = 'CHECKLIST',
  COMPARISON = 'COMPARISON',
  DEFAULT = 'DEFAULT'
}

export class ResponseFormatter {
  /**
   * Generates prompt instructions to strictly control the AI's output format
   * based on the detected intent or explicit user request.
   */
  public determineFormatInstruction(input: string, intent: string): string {
    const lowerInput = input.toLowerCase();
    
    // Explicit user requests take highest priority
    if (lowerInput.includes('short answer') || lowerInput.includes('one line') || lowerInput.includes('brief')) {
      return 'Format: Provide a very brief, single-sentence or short-paragraph answer. No fluff.';
    }
    if (lowerInput.includes('bullet points') || lowerInput.includes('bullets')) {
      return 'Format: Use bullet points.';
    }
    if (lowerInput.includes('table')) {
      return 'Format: Output the response primarily as a Markdown table.';
    }
    if (lowerInput.includes('step by step') || lowerInput.includes('steps')) {
      return 'Format: Use numbered steps.';
    }
    if (lowerInput.includes('checklist')) {
      return 'Format: Provide a Markdown checklist (- [ ] item).';
    }
    if (lowerInput.includes('only the code') || lowerInput.includes('just code')) {
      return 'Format: Output ONLY the raw code block. Do not provide explanations before or after the code.';
    }
    if (lowerInput.includes('explain simply') || lowerInput.includes('explain like i\'m 5')) {
      return 'Style: Explain simply, using analogies. Avoid technical jargon.';
    }
    if (lowerInput.includes('explain technically') || lowerInput.includes('expert level')) {
      return 'Style: Explain technically. Use proper terminology, architectural details, and cover edge cases.';
    }

    // Default formatting based on Intent
    switch (intent) {
      case 'COMPARISON':
        return 'Format: Use clear comparison structures, such as a table or side-by-side bullet points.';
      case 'CODING':
        return 'Format: Use markdown code blocks. Keep explanations concise unless asked otherwise.';
      case 'SYSTEM_INFORMATION':
      case 'MATH':
        return 'Format: Provide a direct, factual answer. Stop immediately after answering.';
      case 'PLANNING':
        return 'Format: Use structured headings and numbered lists.';
      case 'SUMMARY':
        return 'Format: Provide a highly condensed paragraph or a few bullet points.';
      default:
        return 'Format: Natural conversation. Use formatting (bolding, lists, etc.) only if it improves readability.';
    }
  }
}
