import { ModulePage } from '@/components/ModulePage';

export default function OperationsPage() {
  return (
    <ModulePage
      description="상담, 장애, AS 처리 상태를 묶어서 운영 지연과 고객 대응 우선순위를 확인합니다."
      eyebrow="Operations"
      metrics={[
        { label: 'AS 접수', value: 2 },
        { label: '지연 AS', value: 1 },
        { label: '진행 중', value: 1 },
        { label: '상담건', value: 3 }
      ]}
      sections={[
        { title: 'AS 상태', body: '접수일과 처리 예정일을 기준으로 지연 위험을 분리합니다.' },
        { title: '상담 큐', body: 'open, pending, resolved 상담을 운영 흐름에 맞게 정리합니다.' },
        { title: '대시보드 연결', body: '홈 화면에서 오늘 사업 현황을 보면 운영 지표가 매출 지표와 함께 표시됩니다.' }
      ]}
      title="운영 이슈와 AS 흐름"
    />
  );
}
