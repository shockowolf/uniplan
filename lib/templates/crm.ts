import { prisma } from '@/lib/db';
import { QueryTemplate } from './types';

export const delayedConsultations: QueryTemplate = {
  id: 'crm.delayed_consultations',
  title: '미처리 상담',
  examples: ['상담 지연 건', '아직 처리 안 된 문의', '미처리 상담 보여줘'],
  keywords: ['상담', '문의'],
  async run({ companyId }) {
    const consultations = await prisma.consultation.findMany({
      where: { companyId, status: { not: 'resolved' } },
      include: { customer: true },
      orderBy: { createdAt: 'asc' },
      take: 20
    });

    const rows = consultations.map((consultation) => ({
      거래처: consultation.customer?.name ?? '-',
      유형: consultation.type,
      상태: consultation.status,
      내용: consultation.content,
      접수일: consultation.createdAt.toISOString().slice(0, 10)
    }));

    return {
      templateId: 'crm.delayed_consultations',
      message: `미처리 상담은 ${rows.length}건입니다. 오래된 건부터 확인하는 게 좋습니다.`,
      resultType: 'grid',
      grid: { columns: ['거래처', '유형', '상태', '내용', '접수일'], rows },
      suggestions: ['거래처별 상담 보기', 'AS 지연 건 보기']
    };
  }
};
