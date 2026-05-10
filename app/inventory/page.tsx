import { ModulePage } from '@/components/ModulePage';

export default function InventoryPage() {
  return (
    <ModulePage
      description="품목별 재고 수량과 안전재고 기준을 비교해 부족 위험을 먼저 보여줍니다."
      eyebrow="Inventory"
      metrics={[
        { label: '관리 품목', value: 5 },
        { label: '재고 부족', value: 1 },
        { label: '창고', value: 1 },
        { label: '서비스 품목', value: 3 }
      ]}
      sections={[
        { title: '재고 위험', body: '현재고와 안전재고를 비교해 보충이 필요한 품목을 찾습니다.' },
        { title: '품목 조회', body: '상품명을 포함한 질문으로 해당 품목의 현재 상태를 조회합니다.' },
        { title: '이동 이력', body: '입출고 이력 템플릿을 붙이면 운영 흐름까지 확장할 수 있습니다.' }
      ]}
      title="재고와 품목 상태"
    />
  );
}
