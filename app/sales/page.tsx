import { ModulePage } from '@/components/ModulePage';

export default function SalesPage() {
  return (
    <ModulePage
      description="매출 흐름, 청구 상태, 거래처별 성과를 한 화면에서 확인하는 영업 분석 작업공간입니다."
      eyebrow="Sales"
      metrics={[
        { label: '이번 달 매출', value: '1,460만원' },
        { label: '청구건수', value: 3 },
        { label: '미수금', value: '880만원' },
        { label: 'TOP 거래처', value: '한강푸드' }
      ]}
      sections={[
        { title: '매출 요약', body: '기간별 매출과 거래처별 순위를 템플릿 기반으로 조회합니다.' },
        { title: '미수 추적', body: '발행된 청구서의 남은 금액과 지연 위험 거래처를 우선 확인합니다.' },
        { title: '질문 연결', body: '홈 화면의 AI 분석 명령실에서 매출 질문을 바로 실행할 수 있습니다.' }
      ]}
      title="매출과 청구 흐름"
    />
  );
}
