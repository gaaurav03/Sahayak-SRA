const KEYWORDS = [
  'urgent',
  'emergency',
  'critical',
  'dying',
  'flood',
  'no water',
  'hospital',
  'collapsed',
];

const severityBase: Record<'low' | 'medium' | 'high' | 'critical', number> = {
  low: 2,
  medium: 4,
  high: 6,
  critical: 8,
};

export function computeUrgencyScore(input: {
  severity: 'low' | 'medium' | 'high' | 'critical';
  affectedCount: number;
  title: string;
  description: string;
}): number {
  const base = severityBase[input.severity] ?? 2;
  const affectedBonus = Math.min(2, Math.max(0, input.affectedCount) / 100);

  const haystack = `${input.title} ${input.description}`.toLowerCase();
  const keywordBonus = KEYWORDS.some((keyword) => haystack.includes(keyword)) ? 1 : 0;

  return Number(Math.min(10, base + affectedBonus + keywordBonus).toFixed(2));
}
