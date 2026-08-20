import { Intent } from './IntentEngine';

export interface ReasoningStep {
  stepName: string;
  description: string;
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';
  result?: string;
}

export interface ReasoningPlan {
  originalQuery: string;
  intent: Intent;
  steps: ReasoningStep[];
  constraints: string[];
}

export class ReasoningEngine {
  /**
   * Generates a step-by-step reasoning plan for complex tasks.
   * This ensures the LLM tackles problems systematically rather than via zero-shot generation.
   */
  public buildPlan(query: string, intent: Intent): ReasoningPlan {
    const plan: ReasoningPlan = {
      originalQuery: query,
      intent,
      steps: [],
      constraints: []
    };

    switch (intent) {
      case Intent.MATH:
        plan.steps.push({ stepName: 'Parse', description: 'Identify numbers and operations', status: 'PENDING' });
        plan.steps.push({ stepName: 'Calculate', description: 'Perform the calculation step-by-step', status: 'PENDING' });
        plan.steps.push({ stepName: 'Verify', description: 'Double check the result', status: 'PENDING' });
        plan.constraints.push('Ensure mathematical accuracy');
        break;
        
      case Intent.CODING:
      case Intent.DEBUGGING:
        plan.steps.push({ stepName: 'Understand', description: 'Analyze the requirements or error', status: 'PENDING' });
        plan.steps.push({ stepName: 'Plan', description: 'Determine the optimal code structure or fix', status: 'PENDING' });
        plan.steps.push({ stepName: 'Implement', description: 'Write the code', status: 'PENDING' });
        plan.steps.push({ stepName: 'Review', description: 'Check for syntax errors or edge cases', status: 'PENDING' });
        plan.constraints.push('Use modern best practices', 'Keep code minimal and robust');
        break;

      case Intent.PLANNING:
      case Intent.PRODUCTIVITY:
      case Intent.STUDY:
        plan.steps.push({ stepName: 'Analyze', description: 'Identify goals and available time/resources', status: 'PENDING' });
        plan.steps.push({ stepName: 'Structure', description: 'Break down the goal into phases or sessions', status: 'PENDING' });
        plan.steps.push({ stepName: 'Refine', description: 'Optimize for realism and efficiency', status: 'PENDING' });
        plan.constraints.push('Must be realistic', 'Must be structured logically');
        break;

      case Intent.RESEARCH:
      case Intent.COMPARISON:
        plan.steps.push({ stepName: 'Identify', description: 'Identify key subjects and evaluation criteria', status: 'PENDING' });
        plan.steps.push({ stepName: 'Analyze', description: 'Gather facts for each subject', status: 'PENDING' });
        plan.steps.push({ stepName: 'Evaluate', description: 'Compare objectively', status: 'PENDING' });
        plan.steps.push({ stepName: 'Synthesize', description: 'Form a conclusive summary or recommendation', status: 'PENDING' });
        plan.constraints.push('Remain objective', 'Clearly distinguish fact from opinion');
        break;
        
      default:
        // Simple tasks don't need a heavy plan
        break;
    }

    return plan;
  }

  /**
   * Converts a plan into a prompt instruction that forces the model to follow the steps.
   */
  public formatPlanForPrompt(plan: ReasoningPlan): string {
    if (plan.steps.length === 0) return '';
    
    let prompt = `\n[REASONING ENGINE: MULTI-STEP EXECUTION REQUIRED]\n`;
    prompt += `You must follow this internal plan before generating the final answer:\n`;
    plan.steps.forEach((step, idx) => {
      prompt += `${idx + 1}. ${step.stepName} - ${step.description}\n`;
    });
    
    if (plan.constraints.length > 0) {
      prompt += `\nConstraints:\n`;
      plan.constraints.forEach(c => {
        prompt += `- ${c}\n`;
      });
    }

    prompt += `\nDo not expose this chain-of-thought directly to the user. Instead, provide a concise summary of your reasoning in your final answer.\n`;
    return prompt;
  }
}
