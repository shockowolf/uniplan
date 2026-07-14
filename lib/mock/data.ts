export type Customer = {
  id: string;
  name: string;
  grade: 'A' | 'B' | 'C';
};

export type Item = {
  id: string;
  name: string;
  category: string;
  safetyQuantity: number;
  quantity: number;
};

export type Invoice = {
  id: string;
  customerId: string;
  issueDate: string;
  totalAmount: number;
  paidAmount: number;
  remainingAmount: number;
  status: 'issued' | 'paid' | 'partial' | 'overdue';
};

export type Consultation = {
  id: string;
  customerId: string;
  type: string;
  status: 'open' | 'pending' | 'resolved';
  content: string;
  createdAt: string;
};

export type ServiceCase = {
  id: string;
  customerId: string;
  itemId: string;
  status: 'received' | 'in_progress' | 'done' | 'delayed';
  symptom: string;
  receivedAt: string;
  dueAt: string;
};

export const customers: Customer[] = [
  { id: 'c-001', name: '구리정밀', grade: 'A' },
  { id: 'c-002', name: '남양유통', grade: 'B' },
  { id: 'c-003', name: '한강푸드', grade: 'A' },
  { id: 'c-004', name: '별내테크', grade: 'C' },
  { id: 'c-005', name: '다산메디', grade: 'B' }
];

export const items: Item[] = [
  { id: 'item-001', name: 'ERP Basic 월구독', category: 'SaaS', safetyQuantity: 0, quantity: 999 },
  { id: 'item-002', name: '재고관리 모듈', category: 'Module', safetyQuantity: 0, quantity: 999 },
  { id: 'item-003', name: 'QR 주문 태블릿', category: 'Device', safetyQuantity: 10, quantity: 6 },
  { id: 'item-004', name: '바코드 스캐너', category: 'Device', safetyQuantity: 8, quantity: 12 },
  { id: 'item-005', name: '현장 설치 지원', category: 'Service', safetyQuantity: 0, quantity: 999 }
];

export const invoices: Invoice[] = [
  { id: 'i-001', customerId: 'c-001', issueDate: '2026-05-01', totalAmount: 4800000, paidAmount: 4800000, remainingAmount: 0, status: 'paid' },
  { id: 'i-002', customerId: 'c-002', issueDate: '2026-05-02', totalAmount: 2600000, paidAmount: 1000000, remainingAmount: 1600000, status: 'partial' },
  { id: 'i-003', customerId: 'c-003', issueDate: '2026-05-03', totalAmount: 7200000, paidAmount: 0, remainingAmount: 7200000, status: 'issued' },
  { id: 'i-004', customerId: 'c-004', issueDate: '2026-04-20', totalAmount: 1800000, paidAmount: 0, remainingAmount: 1800000, status: 'overdue' },
  { id: 'i-005', customerId: 'c-005', issueDate: '2026-04-28', totalAmount: 3600000, paidAmount: 3600000, remainingAmount: 0, status: 'paid' },
  { id: 'i-006', customerId: 'c-001', issueDate: '2026-04-10', totalAmount: 5200000, paidAmount: 5200000, remainingAmount: 0, status: 'paid' }
];

export const consultations: Consultation[] = [
  { id: 'cs-001', customerId: 'c-002', type: '도입문의', status: 'open', content: '재고관리 모듈 견적 요청', createdAt: '2026-04-30' },
  { id: 'cs-002', customerId: 'c-004', type: '장애문의', status: 'pending', content: '대시보드 로딩 지연 문의', createdAt: '2026-04-29' },
  { id: 'cs-003', customerId: 'c-001', type: '사용문의', status: 'resolved', content: '거래처별 매출 조회 방법', createdAt: '2026-05-02' }
];

export const serviceCases: ServiceCase[] = [
  { id: 'as-001', customerId: 'c-003', itemId: 'item-003', status: 'delayed', symptom: 'QR 주문 태블릿 충전 불량', receivedAt: '2026-04-27', dueAt: '2026-05-01' },
  { id: 'as-002', customerId: 'c-005', itemId: 'item-004', status: 'in_progress', symptom: '스캐너 인식률 저하', receivedAt: '2026-05-01', dueAt: '2026-05-04' }
];

export function customerName(id: string) {
  return customers.find((customer) => customer.id === id)?.name ?? '알 수 없음';
}

export function itemName(id: string) {
  return items.find((item) => item.id === id)?.name ?? '알 수 없음';
}
