export interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface RubricItem {
  criterion: string;
  points: number;
  tags: string[];
}

export interface HealthBenchExample {
  prompt_id: string;
  prompt: Message[];
  rubrics: RubricItem[];
  example_tags: string[];
  ideal_completions_data?: unknown;
}

export interface GraderResponse {
  explanation: string;
  criteria_met: boolean;
}

export interface RubricResult {
  criterion: string;
  points: number;
  criteria_met: boolean;
  explanation: string;
}

export interface ExampleResult {
  prompt_id: string;
  model_response: string;
  rubric_results: RubricResult[];
  achieved_points: number;
  total_points: number;
  score: number;
}

export interface EvalResult {
  model: string;
  dataset: string;
  timestamp: string;
  examples_evaluated: number;
  overall_score: number;
  std_dev: number;
  example_results: ExampleResult[];
}

export type ReasoningEffort = 'none' | 'minimal' | 'low' | 'medium' | 'high';

export interface CLIArgs {
  model: string;
  examples?: number;
  dataset: 'main' | 'hard' | 'consensus';
  grader: string;
  output: string;
  concurrency: number;
  reasoningEffort?: ReasoningEffort;
}

// Token usage tracking
export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

// Chat response with token usage
export interface ChatResponse {
  content: string;
  usage: TokenUsage;
}

// Theme-based score tracking
export interface ThemeScore {
  theme: string;
  examples: number;
  totalScore: number;
  avgScore: number;
}

// Run state for TUI updates
export interface RunState {
  phase: 'loading' | 'running' | 'complete';
  startTime: Date;
  currentExample: number;
  totalExamples: number;
  currentRubric: number;
  totalRubrics: number;
  currentActivity: string;
  completedExamples: ExampleResult[];
  modelTokens: TokenUsage;
  graderTokens: TokenUsage;
  modelTimeMs: number; // total time spent on model calls
  graderTimeMs: number; // total time spent on grader calls
  themeScores: Map<string, ThemeScore>;
  lastCompletionElapsed: number; // ms elapsed when last example completed (for ETA calc)
  currentPrompt: Message[] | null; // full conversation history for current example
  currentQuestion: string | null; // last user message from current prompt
  currentAnswer: string | null; // model's response (null while generating)
  lastError: string | null; // most recent error message
  errorCount: number; // total number of errors encountered
}

// Model pricing from OpenRouter
export interface ModelPricing {
  prompt: number; // cost per token
  completion: number; // cost per token
}

// Extended example result with theme
export interface ExampleResultWithTheme extends ExampleResult {
  theme: string | null;
}
