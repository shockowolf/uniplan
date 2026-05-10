import { ModulePage } from '@/components/ModulePage';

export default function FinancePage() {
  return (
    <ModulePage
      description="청구, 수금, 미수 잔액을 기준으로 현금흐름 위험을 빠르게 확인합니다."
      eyebrow="Finance"
      metrics={[
        { label: '총 미수금', value: '1,060만원' },
        { label: '부분수금', value: 1 },
        { label: '연체', value: 1 },
        { label: '완납', value: 2 }
      ]}
      sections={[
        { title: '미수 우선순위', body: '남은 금액이 큰 거래처부터 수금 액션을 잡을 수 있습니다.' },
        { title: '청구서 상태', body: 'issued, partial, overdue, paid 상태를 한 화면에서 구분합니다.' },
        { title: '읽기 전용 원칙', body: '재무 데이터는 조회와 분석만 수행하고 변경은 별도 승인 흐름으로 분리합니다.' }
      ]}
      title="수금과 미수 관리"
    />
  );
}
