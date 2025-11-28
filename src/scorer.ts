import type {
  EvalResult,
  ExampleResult,
  HealthBenchExample,
  RubricResult,
  ThemeScore,
} from './types';

export function calculateExampleScore(rubricResults: RubricResult[]): {
  achievedPoints: number;
  totalPoints: number;
  score: number;
} {
  // Total possible = sum of POSITIVE rubric points only
  const totalPoints = rubricResults
    .filter((r) => r.points > 0)
    .reduce((sum, r) => sum + r.points, 0);

  // Achieved = sum of ALL rubric points where criteria_met (including negative!)
  // If a negative rubric (e.g., -10 for "gives bad advice") is met, it SUBTRACTS
  const achievedPoints = rubricResults
    .filter((r) => r.criteria_met)
    .reduce((sum, r) => sum + r.points, 0);

  const score = totalPoints > 0 ? achievedPoints / totalPoints : 0;

  return { achievedPoints, totalPoints, score };
}

export function calculateOverallScore(exampleResults: ExampleResult[]): {
  overallScore: number;
  stdDev: number;
} {
  if (exampleResults.length === 0) {
    return { overallScore: 0, stdDev: 0 };
  }

  const scores = exampleResults.map((r) => r.score);
  const mean = scores.reduce((sum, s) => sum + s, 0) / scores.length;

  // Clip mean to [0, 1]
  const overallScore = Math.max(0, Math.min(1, mean));

  // Calculate standard deviation
  const squaredDiffs = scores.map((s) => Math.pow(s - mean, 2));
  const variance = squaredDiffs.reduce((sum, d) => sum + d, 0) / scores.length;
  const stdDev = Math.sqrt(variance);

  return { overallScore, stdDev };
}

export function formatResults(evalResult: EvalResult): string {
  const lines: string[] = [
    '═══════════════════════════════════════════════════════════════',
    '                    HEALTHBENCH EVALUATION RESULTS',
    '═══════════════════════════════════════════════════════════════',
    '',
    `Model:             ${evalResult.model}`,
    `Dataset:           ${evalResult.dataset}`,
    `Examples Evaluated: ${evalResult.examples_evaluated}`,
    `Timestamp:         ${evalResult.timestamp}`,
    '',
    '───────────────────────────────────────────────────────────────',
    '',
    `OVERALL SCORE:     ${(evalResult.overall_score * 100).toFixed(2)}%`,
    `Standard Dev:      ${(evalResult.std_dev * 100).toFixed(2)}%`,
    '',
    '═══════════════════════════════════════════════════════════════',
  ];

  return lines.join('\n');
}

export function formatProgress(current: number, total: number, score: number): string {
  const pct = ((current / total) * 100).toFixed(1);
  const scorePct = (score * 100).toFixed(1);
  const bar =
    '█'.repeat(Math.floor((current / total) * 20)) +
    '░'.repeat(20 - Math.floor((current / total) * 20));
  return `[${bar}] ${current}/${total} (${pct}%) | Running score: ${scorePct}%`;
}

/**
 * Extract theme from example tags
 */
export function getTheme(example: HealthBenchExample): string | null {
  const themeTag = example.example_tags.find((t) => t.startsWith('theme:'));
  return themeTag ? themeTag.replace('theme:', '') : null;
}

/**
 * Update theme scores with a new example result
 */
export function updateThemeScores(
  themeScores: Map<string, ThemeScore>,
  theme: string | null,
  score: number
): void {
  if (!theme) return;

  const existing = themeScores.get(theme);
  if (existing) {
    existing.examples += 1;
    existing.totalScore += score;
    existing.avgScore = existing.totalScore / existing.examples;
  } else {
    themeScores.set(theme, {
      theme,
      examples: 1,
      totalScore: score,
      avgScore: score,
    });
  }
}

/**
 * Get theme scores sorted by average score (descending)
 */
export function getSortedThemeScores(themeScores: Map<string, ThemeScore>): ThemeScore[] {
  return Array.from(themeScores.values()).sort((a, b) => b.avgScore - a.avgScore);
}

/**
 * Human-readable theme names
 */
export const THEME_NAMES: Record<string, string> = {
  communication: 'Expertise-tailored Comms',
  complex_responses: 'Response Depth',
  context_seeking: 'Context Seeking',
  emergency_referrals: 'Emergency Referrals',
  global_health: 'Global Health',
  health_data_tasks: 'Health Data Tasks',
  hedging: 'Responding Under Uncertainty',
};
