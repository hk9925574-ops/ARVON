import { IntentResult, Intent } from '../intelligence/IntentEngine';

export enum RouteDestination {
  AI_INTERNAL = 'AI_INTERNAL',
  LIVE_WEB = 'LIVE_WEB',
  LIVE_SPORTS = 'LIVE_SPORTS',
  LIVE_NEWS = 'LIVE_NEWS',
  TOOLS = 'TOOLS'
}

export class KnowledgeRouter {
  private timeSensitiveKeywords = [
    'latest', 'today', 'yesterday', 'tomorrow', 'current', 'currently', 
    'now', 'recent', 'recently', 'this week', 'this month', 'this year', 
    'new', 'newest', 'updated', 'update', 'latest version', 'current price', 'current score'
  ];

  public determineRoutes(text: string, intentResult: IntentResult): RouteDestination[] {
    const routes: RouteDestination[] = [];
    const lowerText = text.toLowerCase();

    // 1. Check Explicit Tool Routing
    if ([Intent.MATH, Intent.TOOL_REQUEST, Intent.SYSTEM_INFORMATION].includes(intentResult.intent)) {
      routes.push(RouteDestination.TOOLS);
      // Don't usually need web for simple tool lookups, unless specifically asked.
      if (!this.isTimeSensitive(lowerText) || intentResult.intent === Intent.MATH) {
        return routes;
      }
    }

    // 2. Check Time Sensitivity
    let requiresLive = intentResult.time_sensitive || this.isTimeSensitive(lowerText);

    // Implicit time sensitivity based on intent
    // Add additional intent checks if needed

    // 3. Specific Live Routing
    if (requiresLive) {
      if (lowerText.includes('sport') || lowerText.includes('score') || lowerText.includes('match') || lowerText.includes('won')) {
        routes.push(RouteDestination.LIVE_SPORTS);
      } else if (lowerText.includes('news') || lowerText.includes('happened')) {
        routes.push(RouteDestination.LIVE_NEWS);
      } else {
        routes.push(RouteDestination.LIVE_WEB);
      }
    }

    // 4. Default AI Routing
    // Always include internal AI knowledge unless it's a strict calculator task
    if (intentResult.intent !== Intent.MATH) {
      routes.push(RouteDestination.AI_INTERNAL);
    }

    // Deduplicate
    return Array.from(new Set(routes));
  }

  private isTimeSensitive(text: string): boolean {
    // Current year check
    const currentYear = new Date().getFullYear().toString();
    if (text.includes(currentYear)) return true;

    for (const kw of this.timeSensitiveKeywords) {
      if (text.includes(kw)) return true;
    }

    // Check for "who won" etc.
    if (text.includes('who won') || text.includes('who is currently') || text.includes('what happened')) {
      return true;
    }

    return false;
  }
}
