// UI color constants
export const COLORS = {
  model: '#60A5FA', // Sky blue - for model name, metrics, responses
  grader: 'blue', // Standard blue - for grader name and metrics
  header: 'cyan', // Section headers
  label: 'gray', // Labels and secondary text
} as const;

// Score color based on HealthBench typical ranges
export function getScoreColor(score: number): string {
  if (score >= 0.4) return 'green';
  if (score >= 0.1) return 'yellow';
  return 'red';
}
