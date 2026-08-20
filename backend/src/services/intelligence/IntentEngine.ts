export enum Intent {
  CHAT = 'CHAT',
  QUESTION = 'QUESTION',
  EXPLANATION = 'EXPLANATION',
  COMPARISON = 'COMPARISON',
  SUMMARY = 'SUMMARY',
  TRANSLATION = 'TRANSLATION',
  CODING = 'CODING',
  DEBUGGING = 'DEBUGGING',
  MATH = 'MATH',
  PLANNING = 'PLANNING',
  RESEARCH = 'RESEARCH',
  MEMORY_SAVE = 'MEMORY_SAVE',
  MEMORY_RECALL = 'MEMORY_RECALL',
  MEMORY_DELETE = 'MEMORY_DELETE',
  SYSTEM_INFORMATION = 'SYSTEM_INFORMATION',
  TOOL_REQUEST = 'TOOL_REQUEST',
  WEB_SEARCH = 'WEB_SEARCH',
  DOCUMENT_SEARCH = 'DOCUMENT_SEARCH',
  PROJECT_ANALYSIS = 'PROJECT_ANALYSIS',
  CREATIVE = 'CREATIVE',
  STUDY = 'STUDY',
  SPORTS = 'SPORTS',
  PRODUCTIVITY = 'PRODUCTIVITY'
}

export interface IntentResult {
  intent: Intent;
  time_sensitive: boolean;
  confidence: number;
  entities: string[];
}

export class IntentEngine {
  /**
   * Evaluates the user's input and returns a structured Intent.
   * If the intent cannot be confidently classified, it defaults to QUESTION or CHAT.
   */
  public async determineIntent(input: string): Promise<IntentResult> {
    const lowerInput = input.trim().toLowerCase();
    let time_sensitive = false;
    let entities: string[] = [];
    
    // Basic entity extraction (nouns/subjects following action verbs)
    const words = lowerInput.replace(/[^\w\s]/gi, '').split(' ');
    const stopWords = ['what', 'is', 'the', 'of', 'for', 'a', 'an', 'to', 'do', 'how', 'who', 'in', 'on', 'at', 'about', 'can', 'you'];
    entities = words.filter(w => w.length > 2 && !stopWords.includes(w));

    // Time-sensitive detection
    if (
      lowerInput.includes('current') ||
      lowerInput.includes('latest') ||
      lowerInput.includes('now') ||
      lowerInput.includes('today') ||
      lowerInput.includes('recent') ||
      lowerInput.includes('weather') ||
      lowerInput.includes('score') ||
      lowerInput.startsWith('who is ')
    ) {
      time_sensitive = true;
    }

    // Memory operations
    if (lowerInput.startsWith('remember ')) {
      return { intent: Intent.MEMORY_SAVE, time_sensitive, confidence: 0.9, entities };
    }
    if (lowerInput.includes('forget ')) {
      return { intent: Intent.MEMORY_DELETE, time_sensitive, confidence: 0.9, entities };
    }
    if (lowerInput.includes('what did i say') || lowerInput.includes('what is my') || lowerInput.includes('what are my')) {
      return { intent: Intent.MEMORY_RECALL, time_sensitive, confidence: 0.8, entities };
    }

    // System Information
    if (
      lowerInput.includes('what time is it') || 
      lowerInput.includes('system info') || 
      lowerInput.includes('date') ||
      lowerInput.includes('ram') ||
      lowerInput.includes('cpu')
    ) {
      return { intent: Intent.SYSTEM_INFORMATION, time_sensitive, confidence: 0.9, entities };
    }

    // Math / Calculation
    if (
      lowerInput.match(/^what is \d+ [\+\-\*\/] \d+/) || 
      lowerInput.startsWith('calculate ') ||
      lowerInput.includes('math ')
    ) {
      return { intent: Intent.MATH, time_sensitive, confidence: 0.9, entities };
    }

    // Tool Requests
    if (
      (lowerInput.startsWith('open ') && !lowerInput.includes('website')) ||
      lowerInput.startsWith('close ') ||
      lowerInput.startsWith('play ') ||
      lowerInput.startsWith('pause')
    ) {
      return { intent: Intent.TOOL_REQUEST, time_sensitive, confidence: 0.85, entities };
    }

    // Web Search
    if (
      lowerInput.startsWith('search for ') || 
      lowerInput.includes('search the web') ||
      lowerInput.startsWith('google ') ||
      lowerInput.includes('news about')
    ) {
      return { intent: Intent.WEB_SEARCH, time_sensitive: true, confidence: 0.9, entities };
    }

    // Coding & Debugging
    if (lowerInput.includes('debug') || lowerInput.includes('fix this error') || lowerInput.includes('why is this code failing')) {
      return { intent: Intent.DEBUGGING, time_sensitive, confidence: 0.9, entities };
    }
    if (
      lowerInput.includes('write code') || 
      lowerInput.includes('python') || 
      lowerInput.includes('typescript') ||
      lowerInput.includes('javascript') ||
      lowerInput.includes('react')
    ) {
      return { intent: Intent.CODING, time_sensitive, confidence: 0.8, entities };
    }

    // Explanation / Teaching
    if (lowerInput.startsWith('explain ') || lowerInput.startsWith('teach me')) {
      return { intent: Intent.EXPLANATION, time_sensitive, confidence: 0.9, entities };
    }

    // Summary
    if (lowerInput.startsWith('summarize') || lowerInput.includes('tl;dr')) {
      return { intent: Intent.SUMMARY, time_sensitive, confidence: 0.9, entities };
    }

    // Comparison
    if (lowerInput.includes('compare ') || lowerInput.includes('difference between')) {
      return { intent: Intent.COMPARISON, time_sensitive, confidence: 0.9, entities };
    }

    // Translation
    if (lowerInput.startsWith('translate ') || lowerInput.includes(' in spanish') || lowerInput.includes(' in french')) {
      return { intent: Intent.TRANSLATION, time_sensitive, confidence: 0.9, entities };
    }

    // Planning & Productivity
    if (lowerInput.includes('plan') || lowerInput.includes('schedule') || lowerInput.includes('routine')) {
      return { intent: Intent.PLANNING, time_sensitive, confidence: 0.8, entities };
    }

    // Research
    if (lowerInput.startsWith('research ')) {
      return { intent: Intent.RESEARCH, time_sensitive, confidence: 0.8, entities };
    }

    // Study
    if (lowerInput.includes('quiz me') || lowerInput.includes('test me on') || lowerInput.includes('exam')) {
      return { intent: Intent.STUDY, time_sensitive, confidence: 0.85, entities };
    }

    // Project Analysis
    if (lowerInput.includes('project structure') || lowerInput.includes('in my project')) {
      return { intent: Intent.PROJECT_ANALYSIS, time_sensitive, confidence: 0.8, entities };
    }

    // Sports
    if (lowerInput.includes('cricket') || lowerInput.includes('football') || lowerInput.includes('tennis') || lowerInput.includes('basketball') || lowerInput.includes('olympics')) {
      return { intent: Intent.SPORTS, time_sensitive, confidence: 0.8, entities };
    }

    // Default Questions
    if (
      lowerInput.startsWith('what is ') || 
      lowerInput.startsWith('how do ') ||
      lowerInput.startsWith('why ') ||
      lowerInput.startsWith('who is ') ||
      lowerInput.startsWith('where ')
    ) {
      return { intent: Intent.QUESTION, time_sensitive, confidence: 0.7, entities };
    }

    // Conversational Chat
    return { intent: Intent.CHAT, time_sensitive, confidence: 0.5, entities };
  }
}
