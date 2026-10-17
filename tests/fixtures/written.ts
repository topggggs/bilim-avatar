import type { TestConfig } from '../../packages/core/src/index';
import type { AnalysisReport } from '../../packages/core/src/written';
export const writtenAnswer =
  'Сверю факты с проектом, проверю риски, согласую безопасный план и зафиксирую результат.';
export function reportFor(c: TestConfig, value = 4): AnalysisReport {
  return {
    summary:
      'Тестовая фикстура: описанные действия дают основу для обсуждения развития с наставником.',
    scales: Object.keys(c.scales).map((scale) => ({
      scale: scale as keyof typeof c.scales,
      explanation: 'Описана проверка условий и согласование дальнейших действий.',
    })),
    ratings: c.questions.flatMap((q) =>
      q.scales.map((scale) => ({
        questionId: q.id,
        scale,
        value,
        evidence: 'Проверка условий перед действием.',
      })),
    ),
    limitedEvidence: false,
    model: 'test-fixture',
    rubricVersion: 'written-v1',
    analyzedAt: new Date().toISOString(),
  };
}
