# UNIPLAN_QUERY_TEMPLATES

UniPlan AI ERP MVP용 안전 쿼리 템플릿 초안.

목표는 LLM이 DB에 자유 SQL을 직접 생성/실행하지 않게 하고, 사용자의 자연어 질문을 **승인된 템플릿 ID**로 매핑한 뒤 파라미터만 채워 읽기 전용 조회를 수행하는 것이다.

## 1. 실행 흐름

```text
사용자 질문
  → intent classification
  → template_id 선택
  → 파라미터 추출/보정
  → 사용자 권한 확인
  → read-only SQL/view 실행
  → summary + chart/grid/card 렌더링
```

## 2. 공통 파라미터 규칙

| 파라미터 | 설명 | 기본값 |
|---|---|---|
| `company_id` | 현재 로그인 회사 | session |
| `date_from` | 조회 시작일 | 템플릿별 기본값 |
| `date_to` | 조회 종료일 | 오늘 |
| `customer_id` | 고객 ID | optional |
| `product_id` | 상품 ID | optional |
| `employee_id` | 직원/영업담당자 ID | optional |
| `limit` | 결과 개수 | 10 또는 20 |

## 3. 결과 타입

| 타입 | 설명 |
|---|---|
| `summary` | 자연어 요약 |
| `metric_cards` | KPI 카드 |
| `grid` | 표 |
| `chart_line` | 추이 차트 |
| `chart_bar` | 순위/비교 차트 |
| `chart_pie` | 비중 차트 |
| `suggestions` | 후속 질문 버튼 |

## 4. MVP 템플릿 목록

## Sales

### `sales.monthly_summary`

**질문 예시**

- 이번 달 매출 어때?
- 월 매출 요약해줘
- 지난달이랑 비교해서 매출 보여줘

**필요 권한**

- `sales.read`
- `finance.read_summary`

**파라미터**

| 이름 | 필수 | 설명 |
|---|---|---|
| `date_from` | no | 기본: 이번 달 1일 |
| `date_to` | no | 기본: 오늘 |

**SQL 초안**

```sql
SELECT
  COALESCE(SUM(total_amount), 0) AS total_sales,
  COALESCE(SUM(supply_amount), 0) AS supply_amount,
  COALESCE(SUM(tax_amount), 0) AS tax_amount,
  COUNT(*) AS invoice_count
FROM invoices
WHERE company_id = :company_id
  AND issue_date BETWEEN :date_from AND :date_to
  AND status NOT IN ('cancelled');
```

**렌더링**

- `metric_cards`: 총매출, 공급가, 세액, 청구건수
- `summary`
- `suggestions`: `["일별 추이", "상품별 순위", "거래처별 순위", "미수금 보기"]`

---

### `sales.monthly_trend`

**질문 예시**

- 월별 매출 추이 보여줘
- 최근 6개월 매출 그래프
- 매출 흐름이 어때?

**파라미터**

| 이름 | 필수 | 설명 |
|---|---|---|
| `months` | no | 기본 6, 최대 24 |

**SQL 초안**

```sql
SELECT
  DATE_TRUNC('month', issue_date)::date AS month,
  SUM(total_amount) AS total_sales,
  COUNT(*) AS invoice_count
FROM invoices
WHERE company_id = :company_id
  AND issue_date >= DATE_TRUNC('month', CURRENT_DATE) - (:months::int - 1) * INTERVAL '1 month'
  AND status NOT IN ('cancelled')
GROUP BY 1
ORDER BY 1;
```

**렌더링**

- `chart_line`
- `grid`
- `summary`

---

### `sales.daily_trend`

**질문 예시**

- 이번 달 일별 매출 보여줘
- 최근 30일 매출 추이

**SQL 초안**

```sql
SELECT
  issue_date AS day,
  SUM(total_amount) AS total_sales,
  COUNT(*) AS invoice_count
FROM invoices
WHERE company_id = :company_id
  AND issue_date BETWEEN :date_from AND :date_to
  AND status NOT IN ('cancelled')
GROUP BY issue_date
ORDER BY issue_date;
```

**렌더링**

- `chart_line`
- `grid`

---

### `sales.customer_ranking`

**질문 예시**

- 거래처별 매출 순위 보여줘
- 매출 많은 고객 TOP 10
- 이번 달 고객사별 매출

**파라미터**

| 이름 | 필수 | 설명 |
|---|---|---|
| `limit` | no | 기본 10 |

**SQL 초안**

```sql
SELECT
  c.id AS customer_id,
  c.name AS customer_name,
  SUM(i.total_amount) AS total_sales,
  COUNT(i.id) AS invoice_count
FROM invoices i
JOIN customers c ON c.id = i.customer_id
WHERE i.company_id = :company_id
  AND i.issue_date BETWEEN :date_from AND :date_to
  AND i.status NOT IN ('cancelled')
GROUP BY c.id, c.name
ORDER BY total_sales DESC
LIMIT :limit;
```

**렌더링**

- `chart_bar`
- `grid`
- `summary`

---

### `sales.product_ranking`

**질문 예시**

- 상품별 매출 순위
- 가장 많이 팔린 품목은?
- 이번 달 제품 매출 TOP 10

**SQL 초안**

```sql
SELECT
  COALESCE(p.id, ii.product_id) AS product_id,
  COALESCE(p.name, ii.item_name) AS product_name,
  SUM(ii.quantity) AS quantity,
  SUM(ii.supply_amount + ii.tax_amount) AS total_sales
FROM invoice_items ii
JOIN invoices i ON i.id = ii.invoice_id
LEFT JOIN products p ON p.id = ii.product_id
WHERE i.company_id = :company_id
  AND i.issue_date BETWEEN :date_from AND :date_to
  AND i.status NOT IN ('cancelled')
GROUP BY COALESCE(p.id, ii.product_id), COALESCE(p.name, ii.item_name)
ORDER BY total_sales DESC
LIMIT :limit;
```

**렌더링**

- `chart_bar`
- `grid`

---

### `sales.employee_performance`

**질문 예시**

- 영업 담당자별 실적 보여줘
- 이번 달 직원별 매출

**SQL 초안**

```sql
SELECT
  e.id AS employee_id,
  e.name AS employee_name,
  SUM(i.total_amount) AS total_sales,
  COUNT(DISTINCT so.id) AS order_count,
  COUNT(DISTINCT i.id) AS invoice_count
FROM invoices i
LEFT JOIN sales_orders so ON so.id = i.sales_order_id
LEFT JOIN employees e ON e.id = so.sales_employee_id
WHERE i.company_id = :company_id
  AND i.issue_date BETWEEN :date_from AND :date_to
  AND i.status NOT IN ('cancelled')
GROUP BY e.id, e.name
ORDER BY total_sales DESC;
```

**렌더링**

- `chart_bar`
- `grid`

---

## Finance

### `finance.receivables_top`

**질문 예시**

- 미수금 많은 거래처 TOP 10
- 아직 못 받은 돈 보여줘
- 연체된 청구 건 알려줘

**필요 권한**

- `finance.read`

**SQL 초안**

```sql
SELECT
  c.id AS customer_id,
  c.name AS customer_name,
  SUM(i.remaining_amount) AS receivable_amount,
  COUNT(i.id) AS invoice_count,
  MIN(i.due_date) AS oldest_due_date
FROM invoices i
JOIN customers c ON c.id = i.customer_id
WHERE i.company_id = :company_id
  AND i.remaining_amount > 0
  AND i.status IN ('issued', 'partial', 'overdue')
GROUP BY c.id, c.name
ORDER BY receivable_amount DESC
LIMIT :limit;
```

**렌더링**

- `metric_cards`: 총 미수금, 미수 거래처 수
- `chart_bar`
- `grid`
- `suggestions`: `["연체 건만 보기", "거래처별 상세", "이번 달 입금 내역"]`

---

### `finance.overdue_invoices`

**질문 예시**

- 연체 청구건 보여줘
- 납기 지난 미수금 뭐 있어?

**SQL 초안**

```sql
SELECT
  i.id AS invoice_id,
  i.invoice_no,
  c.name AS customer_name,
  i.issue_date,
  i.due_date,
  i.total_amount,
  i.paid_amount,
  i.remaining_amount,
  CURRENT_DATE - i.due_date AS overdue_days
FROM invoices i
JOIN customers c ON c.id = i.customer_id
WHERE i.company_id = :company_id
  AND i.remaining_amount > 0
  AND i.due_date < CURRENT_DATE
  AND i.status IN ('issued', 'partial', 'overdue')
ORDER BY i.due_date ASC
LIMIT :limit;
```

**렌더링**

- `grid`
- `summary`

---

### `finance.payment_summary`

**질문 예시**

- 이번 달 입금 내역 요약
- 결제수단별 입금액 보여줘

**SQL 초안**

```sql
SELECT
  method,
  SUM(amount) AS paid_amount,
  COUNT(*) AS payment_count
FROM payments
WHERE company_id = :company_id
  AND paid_at BETWEEN :date_from AND :date_to
GROUP BY method
ORDER BY paid_amount DESC;
```

**렌더링**

- `chart_pie`
- `grid`
- `summary`

---

### `finance.expense_by_category`

**질문 예시**

- 비용 항목별 합계
- 이번 달 지출 어디에 많이 썼어?

**SQL 초안**

```sql
SELECT
  category,
  SUM(amount) AS total_expense,
  COUNT(*) AS expense_count
FROM expenses
WHERE company_id = :company_id
  AND expense_date BETWEEN :date_from AND :date_to
GROUP BY category
ORDER BY total_expense DESC;
```

**렌더링**

- `chart_pie`
- `grid`

---

## Customer / CRM

### `crm.new_customers`

**질문 예시**

- 이번 달 신규 고객 수
- 최근 가입한 거래처 보여줘

**SQL 초안**

```sql
SELECT
  id AS customer_id,
  name AS customer_name,
  customer_type,
  status,
  created_at::date AS created_date
FROM customers
WHERE company_id = :company_id
  AND created_at::date BETWEEN :date_from AND :date_to
ORDER BY created_at DESC
LIMIT :limit;
```

**렌더링**

- `metric_cards`: 신규 고객 수
- `grid`

---

### `crm.customer_detail_summary`

**질문 예시**

- 이 거래처 요약해줘
- ABC상사 최근 거래/상담 이력 보여줘

**필수 파라미터**

- `customer_id`

**SQL 초안**

```sql
SELECT
  c.id,
  c.name,
  c.status,
  c.grade,
  c.phone,
  c.email,
  COALESCE(SUM(i.total_amount), 0) AS lifetime_sales,
  COALESCE(SUM(i.remaining_amount), 0) AS receivable_amount,
  MAX(i.issue_date) AS last_invoice_date
FROM customers c
LEFT JOIN invoices i ON i.customer_id = c.id AND i.status NOT IN ('cancelled')
WHERE c.company_id = :company_id
  AND c.id = :customer_id
GROUP BY c.id, c.name, c.status, c.grade, c.phone, c.email;
```

**렌더링**

- `summary`
- `metric_cards`
- `suggestions`: `["상담 이력", "미수 내역", "매출 추이"]`

---

### `crm.consultation_count`

**질문 예시**

- 이번 달 상담 건수
- 상담 유형별로 보여줘

**SQL 초안**

```sql
SELECT
  type,
  status,
  COUNT(*) AS consultation_count
FROM consultations
WHERE company_id = :company_id
  AND created_at::date BETWEEN :date_from AND :date_to
GROUP BY type, status
ORDER BY consultation_count DESC;
```

**렌더링**

- `chart_bar`
- `grid`

---

### `crm.delayed_consultations`

**질문 예시**

- 지연된 상담 건 있어?
- 아직 처리 안 된 문의 보여줘

**SQL 초안**

```sql
SELECT
  cs.id,
  c.name AS customer_name,
  cs.type,
  cs.status,
  cs.content,
  cs.created_at,
  EXTRACT(day FROM CURRENT_TIMESTAMP - cs.created_at) AS open_days
FROM consultations cs
LEFT JOIN customers c ON c.id = cs.customer_id
WHERE cs.company_id = :company_id
  AND cs.status IN ('open', 'pending')
ORDER BY cs.created_at ASC
LIMIT :limit;
```

**렌더링**

- `grid`
- `summary`

---

## Inventory / Product

### `inventory.low_stock_items`

**질문 예시**

- 재고 부족한 품목 보여줘
- 안전재고 이하 상품 뭐야?

**SQL 초안**

```sql
SELECT
  p.id AS product_id,
  p.name AS product_name,
  w.name AS warehouse_name,
  ib.quantity,
  ib.safety_quantity,
  (ib.safety_quantity - ib.quantity) AS shortage_quantity
FROM inventory_balances ib
JOIN products p ON p.id = ib.product_id
JOIN warehouses w ON w.id = ib.warehouse_id
WHERE ib.company_id = :company_id
  AND ib.quantity <= ib.safety_quantity
ORDER BY shortage_quantity DESC
LIMIT :limit;
```

**렌더링**

- `grid`
- `metric_cards`: 부족 품목 수
- `suggestions`: `["발주안 만들기", "입출고 이력", "많이 팔린 품목과 비교"]`

**주의**

- MVP에서 “발주안 만들기”는 제안만 한다. 실제 발주/외부전송은 approval 필요.

---

### `inventory.movement_summary`

**질문 예시**

- 이번 달 입출고 요약
- 재고 변동 큰 품목

**SQL 초안**

```sql
SELECT
  p.id AS product_id,
  p.name AS product_name,
  im.movement_type,
  SUM(im.quantity) AS total_quantity,
  COUNT(*) AS movement_count
FROM inventory_movements im
JOIN products p ON p.id = im.product_id
WHERE im.company_id = :company_id
  AND im.movement_at::date BETWEEN :date_from AND :date_to
GROUP BY p.id, p.name, im.movement_type
ORDER BY ABS(SUM(im.quantity)) DESC
LIMIT :limit;
```

**렌더링**

- `chart_bar`
- `grid`

---

### `inventory.product_stock_detail`

**질문 예시**

- 이 상품 재고 상세 보여줘
- A제품 창고별 재고

**필수 파라미터**

- `product_id`

**SQL 초안**

```sql
SELECT
  p.name AS product_name,
  w.name AS warehouse_name,
  ib.quantity,
  ib.safety_quantity,
  ib.updated_at
FROM inventory_balances ib
JOIN products p ON p.id = ib.product_id
JOIN warehouses w ON w.id = ib.warehouse_id
WHERE ib.company_id = :company_id
  AND ib.product_id = :product_id
ORDER BY w.name;
```

**렌더링**

- `grid`
- `summary`

---

## HR / Operations

### `hr.employee_count`

**질문 예시**

- 현재 직원 수
- 부서별 인원 보여줘

**SQL 초안**

```sql
SELECT
  department,
  COUNT(*) AS employee_count
FROM employees
WHERE company_id = :company_id
  AND active = true
GROUP BY department
ORDER BY employee_count DESC;
```

**렌더링**

- `metric_cards`
- `chart_bar`
- `grid`

---

### `ops.service_cases_delayed`

**질문 예시**

- AS 지연 건 보여줘
- 처리 안 끝난 서비스 건 뭐 있어?

**SQL 초안**

```sql
SELECT
  sc.id,
  c.name AS customer_name,
  p.name AS product_name,
  sc.status,
  sc.symptom,
  sc.received_at,
  sc.due_at,
  EXTRACT(day FROM CURRENT_TIMESTAMP - sc.received_at) AS open_days
FROM service_cases sc
LEFT JOIN customers c ON c.id = sc.customer_id
LEFT JOIN products p ON p.id = sc.product_id
WHERE sc.company_id = :company_id
  AND sc.status IN ('received', 'in_progress', 'delayed')
  AND (sc.due_at IS NULL OR sc.due_at < CURRENT_TIMESTAMP OR sc.status = 'delayed')
ORDER BY sc.due_at ASC NULLS FIRST, sc.received_at ASC
LIMIT :limit;
```

**렌더링**

- `grid`
- `summary`

---

### `ops.task_due_soon`

**질문 예시**

- 오늘 해야 할 일
- 마감 임박 업무 보여줘

**SQL 초안**

```sql
SELECT
  t.id,
  t.title,
  e.name AS assignee_name,
  c.name AS customer_name,
  t.status,
  t.priority,
  t.due_at
FROM tasks t
LEFT JOIN employees e ON e.id = t.assigned_employee_id
LEFT JOIN customers c ON c.id = t.customer_id
WHERE t.company_id = :company_id
  AND t.status NOT IN ('done')
  AND t.due_at <= :date_to::date + INTERVAL '1 day'
ORDER BY t.due_at ASC, t.priority DESC
LIMIT :limit;
```

**렌더링**

- `grid`
- `summary`

---

## Dashboard

### `dashboard.today_summary`

**질문 예시**

- 오늘 사업 현황 요약해줘
- 지금 회사 상태 한 번 정리해줘
- 대시보드 요약

**구성 템플릿**

이 템플릿은 단일 SQL보다 여러 템플릿 결과를 조합한다.

1. `sales.monthly_summary`
2. `sales.daily_trend` with today
3. `finance.receivables_top` limit 5
4. `inventory.low_stock_items` limit 5
5. `crm.delayed_consultations` limit 5
6. `ops.service_cases_delayed` limit 5
7. `ops.task_due_soon` limit 5

**렌더링**

- `metric_cards`
  - 오늘 매출
  - 이번 달 매출
  - 총 미수금
  - 재고 부족 품목 수
  - 지연 상담/AS 수
- `summary`
- `grid sections`
- `suggestions`

---

## 5. Intent 매핑 초안

| 키워드/표현 | 후보 템플릿 |
|---|---|
| 매출, 판매, 수익 | `sales.monthly_summary`, `sales.monthly_trend`, `sales.customer_ranking`, `sales.product_ranking` |
| 추이, 그래프, 흐름 | `sales.monthly_trend`, `sales.daily_trend` |
| 거래처별, 고객별 | `sales.customer_ranking`, `crm.customer_detail_summary` |
| 상품별, 품목별, 제품별 | `sales.product_ranking`, `inventory.product_stock_detail` |
| 미수, 못 받은 돈, 연체 | `finance.receivables_top`, `finance.overdue_invoices` |
| 입금, 결제 | `finance.payment_summary` |
| 비용, 지출 | `finance.expense_by_category` |
| 신규 고객, 새 거래처 | `crm.new_customers` |
| 상담, 문의 | `crm.consultation_count`, `crm.delayed_consultations` |
| 재고, 부족, 입출고 | `inventory.low_stock_items`, `inventory.movement_summary`, `inventory.product_stock_detail` |
| 직원, 부서, 인원 | `hr.employee_count` |
| AS, 서비스, 수리 | `ops.service_cases_delayed` |
| 할 일, 업무, 마감 | `ops.task_due_soon` |
| 오늘 현황, 대시보드, 전체 요약 | `dashboard.today_summary` |

## 6. 안전 정책

### 허용

- SELECT only
- 정해진 view/table/template만 조회
- 현재 `company_id` 범위 내 조회
- 권한별 컬럼 마스킹
- aggregate/summary 중심 응답

### 금지

- LLM 자유 SQL 직접 실행
- `INSERT`, `UPDATE`, `DELETE`, `DROP`, `ALTER`
- 다른 회사 `company_id` 조회
- 주민번호, 계좌번호, 비밀번호, 토큰 등 민감정보 노출
- 외부 메시지/이메일/발주 자동 전송

### 승인 필요

- 발주안 생성 후 실제 발송
- 거래처에 메시지 전송
- 청구서/세금계산서 발행
- 데이터 수정/삭제
- 외부 API 연동 실행

## 7. 다음 구현 순서

1. 이 문서의 템플릿 ID를 JSON/YAML 스펙으로 변환
2. demo seed data 작성
3. read-only query runner 작성
4. `/api/chat`에서 intent → template → result pipeline 구현
5. UI에서 summary/card/grid/chart 렌더링
