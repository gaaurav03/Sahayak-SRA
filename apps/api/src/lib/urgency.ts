const KEYWORDS: Array<{ token: string; weight: number }> = [
  { token: 'emergency', weight: 1 },
  { token: 'urgent', weight: 0.5 },
  { token: 'critical', weight: 0.5 },
  { token: 'dying', weight: 0.5 },
  { token: 'flood', weight: 0.5 },
  { token: 'no water', weight: 0.5 },
  { token: 'hospital', weight: 0.5 },
  { token: 'collapsed', weight: 0.5 },
];

const severityBase: Record<'low' | 'medium' | 'high' | 'critical', number> = {
  low: 2,
  medium: 4,
  high: 6,
  critical: 8,
};

const categoryWeight: Record<string, number> = {
  health: 2,
  water: 1.5,
  food: 1,
};

export type UrgencyReason = {
  label: string;
  points: number;
};

export type UrgencyEvaluation = {
  score: number;
  confidence: number;
  reasons: UrgencyReason[];
  keywordHits: number;
};

export function computeUrgencyEvaluation(input: {
  severity: 'low' | 'medium' | 'high' | 'critical';
  affectedCount: number;
  title: string;
  description: string;
  category?: string;
  hoursSinceCreated?: number;
  clusterCount?: number;
  dataCompleteness?: number; // 0..1
  consistencyScore?: number; // 0..1
}): UrgencyEvaluation {
  const base = severityBase[input.severity] ?? 2;
  const affectedBonus = Math.min(2, Math.max(0, input.affectedCount) / 100);
  const categoryBonus = categoryWeight[input.category ?? ''] ?? 0;
  const timeBonus = Math.min(2, Math.max(0, input.hoursSinceCreated ?? 0) / 12);
  const clusterBonus = Math.min(2, Math.max(0, input.clusterCount ?? 0) / 5);

  const haystack = `${input.title} ${input.description}`.toLowerCase();
  const matchedWeights: number[] = [];
  for (const keyword of KEYWORDS) {
    if (haystack.includes(keyword.token)) matchedWeights.push(keyword.weight);
  }
  const keywordHits = matchedWeights.length;
  const keywordBonus = Math.min(2, matchedWeights.reduce((sum, w) => sum + w, 0));

  const reasons: UrgencyReason[] = [
    { label: `Severity (${input.severity})`, points: base },
    { label: `Affected people (${Math.max(0, input.affectedCount)})`, points: affectedBonus },
  ];
  if (categoryBonus > 0) reasons.push({ label: `Category (${input.category})`, points: categoryBonus });
  if (keywordBonus > 0) reasons.push({ label: 'Critical keywords detected', points: keywordBonus });
  if (timeBonus > 0) reasons.push({ label: 'Unresolved age bonus', points: timeBonus });
  if (clusterBonus > 0) reasons.push({ label: 'Local cluster hotspot bonus', points: clusterBonus });

  const rawScore = base + affectedBonus + categoryBonus + keywordBonus + timeBonus + clusterBonus;
  const score = Number(Math.min(10, rawScore).toFixed(2));

  const completeness = Math.min(1, Math.max(0, input.dataCompleteness ?? 0.6));
  const consistency = Math.min(1, Math.max(0, input.consistencyScore ?? 0.6));
  const keywordStrength = Math.min(1, keywordBonus / 2);
  const confidence = Math.round((completeness * 0.4 + consistency * 0.35 + keywordStrength * 0.25) * 100);

  return { score, confidence, reasons, keywordHits };
}

export function computeUrgencyScore(input: {
  severity: 'low' | 'medium' | 'high' | 'critical';
  affectedCount: number;
  title: string;
  description: string;
  category?: string;
  hoursSinceCreated?: number;
  clusterCount?: number;
  dataCompleteness?: number;
  consistencyScore?: number;
}): number {
  return computeUrgencyEvaluation(input).score;
}
