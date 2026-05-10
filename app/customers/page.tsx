import { ModulePage } from '@/components/ModulePage';

export default function CustomersPage() {
  return (
    <ModulePage
      description="거래처 상태, 등급, 상담 이력을 기준으로 후속 조치가 필요한 고객을 정리합니다."
      eyebrow="Customers"
      metrics={[
        { label: '거래처', value: 5 },
        { label: 'A 등급', value: 2 },
        { label: '열린 상담', value: 1 },
        { label: '지연 문의', value: 1 }
      ]}
      sections={[
        { title: '거래처 현황', body: '고객 등급과 최근 활동을 기준으로 영업 우선순위를 잡습니다.' },
        { title: '상담 관리', body: '도입문의, 장애문의, 사용문의 상태를 한 흐름으로 추적합니다.' },
        { title: 'AI 요약', body: '거래처명을 포함한 질문을 홈에서 실행하면 관련 미수와 활동을 요약합니다.' }
      ]}
      title="거래처와 상담 관리"
    />
  );
}
