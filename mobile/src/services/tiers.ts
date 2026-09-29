export function tierLabel(score: number): string {
  if (score >= 90) return "SAFE RIDER";
  if (score >= 75) return "GOOD RIDER";
  if (score >= 60) return "NEEDS IMPROVEMENT";
  return "HIGH RISK";
}

export function tierColor(score: number): string {
  if (score >= 90) return "#22C55E";
  if (score >= 75) return "#84CC16";
  if (score >= 60) return "#F59E0B";
  return "#EF4444";
}
