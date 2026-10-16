import ranks from '../../../config/ranks.ru.json';
/** Development milestones only; assessment percentages never affect the rank. */
export function developmentRank(hasAssessment: boolean, approvedRecommendationIds: string[]) {
  const completed = new Set(approvedRecommendationIds).size;
  const points = hasAssessment ? 1 + completed : 0;
  let index = 0;
  for (let i = 1; i < ranks.length; i++) if (points >= ranks[i].points) index = i;
  const current = ranks[index];
  const next = ranks[index + 1] ?? null;
  const progress = next
    ? hasAssessment
      ? Math.round((completed / (next.points - 1)) * 100)
      : 0
    : 100;
  return {
    current,
    next,
    points,
    completed,
    progress,
    remaining: next ? next.points - points : 0,
    ranks,
  };
}
export type DevelopmentRank = ReturnType<typeof developmentRank>;
