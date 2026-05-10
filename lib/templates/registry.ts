import { delayedConsultations } from './crm';
import { todaySummary } from './dashboard';
import { receivablesTop } from './finance';
import { lowStockItems } from './inventory';
import { salesMonthlySummary } from './sales';
import { ChatResult, QueryTemplate } from './types';

export const templates: QueryTemplate[] = [
  receivablesTop,
  lowStockItems,
  delayedConsultations,
  todaySummary,
  salesMonthlySummary
];

export function findTemplateByKeyword(message: string) {
  const normalized = message.replace(/\s+/g, '').toLowerCase();
  return templates.find((template) => template.keywords.some((keyword) => normalized.includes(keyword)));
}

export function findTemplateById(templateId: string) {
  return templates.find((template) => template.id === templateId);
}

export function fallbackResult(): ChatResult {
  return {
    templateId: 'fallback.unsupported',
    message: '아직 이 질문은 MVP 템플릿에 없습니다. 매출, 미수금, 재고, 상담, 오늘 현황부터 물어볼 수 있습니다.',
    resultType: 'grid',
    suggestions: ['이번 달 매출 어때?', '미수금 많은 거래처 TOP 10', '재고 부족한 품목', '오늘 사업 현황 요약']
  };
}
