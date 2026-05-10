# UNIPLAN MVP

## 1. Product Definition

**UNIPLAN** is an AI-first business operation platform.

The first MVP starts as an **AI ERP analyst**: users ask business questions in chat, and UNIPLAN safely queries business data, summarizes results, and shows charts/tables.

Long-term, UNIPLAN should become a modular business OS that can expand into ERP, MES, shopping mall/e-commerce, video meetings, electronic classrooms, QR/POS ordering, store operations, messaging, reports, and agent-based workflow automation.

## 2. Core Idea

Traditional ERP makes users find menus.

UNIPLAN lets users ask:

- “이번 달 매출 어때?”
- “미수금 많은 거래처 TOP 10 보여줘.”
- “재고 부족한 품목 발주안 만들어줘.”
- “오늘 매장별 QR 주문량 비교해줘.”
- “이번 주 상담/AS 지연 건 요약해줘.”

The AI should respond with:

- short natural-language summary
- table/grid
- chart
- drill-down suggestions
- safe next actions requiring approval when needed

## 3. MVP Scope

### MVP Name

**UNIPLAN AI ERP**

### Goal

Build a working prototype where a user can chat with AI to analyze ERP-like business data and view results as charts/tables.

### Included in MVP

- Chat UI
- AI intent classification
- Safe query-template execution
- Read-only data access
- Chart/table result rendering
- Basic dashboard cards
- User/session history
- Permission-aware response structure
- Mock or restored local ERP data

### Not Included Yet

- Free-form unrestricted SQL execution
- Write/delete/update automation
- Real payment actions
- External message sending without approval
- Full POS/MES/e-commerce production modules
- App Store / Play Store deployment

## 4. Reference Projects

UNIPLAN should reference two existing recovered projects:

### easierp / homeEasisoft2020v2

Use as reference for:

- ERP/homepage mixed structure
- user/domain/menu/role concepts
- Spring MVC + JSP legacy ERP patterns
- local dummy seed strategy
- public ERP feature concepts

### gootzERP / erpGootz

Use as reference for:

- DevExpress chart/grid UI
- data grid wrapper pattern
- dashboard cards
- ERP domain examples: sales, finance, product, customer, HR, welfare, billing
- Spring MVC + MyBatis data access pattern

Important reusable pieces from gootzERP:

- `WEB-INF/views/include/default/include.jsp`
- `resources/css/devexpress/`
- `resources/js/devexpress/`
- `resources/js/common/common.js` — especially `$.fn.dataGrid` and `g_ajax` concepts
- `sales/sales_chart.jsp` chart pattern
- `account/account_list.jsp` grid CRUD pattern

## 5. High-Level Architecture

```text
[User]
  ↓ chat
[UNIPLAN Web/App UI]
  ↓
[AI Orchestrator]
  ↓ intent / policy / query selection
[Analysis Template Engine]
  ↓ safe read-only query
[Business Data Layer]
  ↓
[ERP / POS / MES / Shop DB or APIs]
  ↓
[Result Renderer]
  → summary
  → DevExpress grid
  → DevExpress chart
  → report/export
```

## 6. Recommended MVP Tech Stack

### Backend

Recommended for MVP:

- Spring Boot 3 or Node.js/NestJS
- PostgreSQL or MySQL
- Read-only analytics DB user
- REST API first

If reusing legacy assets quickly:

- Spring MVC/JSP is possible
- But avoid deeply coupling new product to old legacy structure

Recommendation:

> Build UNIPLAN as a new service, and use easierp/gootzERP as reference/data/domain sources.

### Frontend

Options:

1. Web first
   - React / Next.js
   - DevExpress React components or embedded DevExtreme widgets

2. Legacy-compatible fast prototype
   - JSP + jQuery + DevExpress, using gootzERP style

3. Companion app
   - Flutter for mobile control/approval app

Recommendation:

- MVP web: React or simple server-rendered prototype
- Data grid/chart: DevExtreme/DevExpress-style UI
- Companion app later: Flutter

## 7. AI Layer

### Initial AI Role

The AI should not directly modify data.

For MVP, AI should:

- understand user question
- map it to a known analysis template
- ask a follow-up question if required
- execute safe read-only query
- summarize result
- suggest next actions

### Unsafe for MVP

- arbitrary SQL generation directly against production DB
- data writes without approval
- sending emails/messages automatically
- exposing raw PII or credentials

### Safe Pattern

```text
User question
  → classify intent
  → select approved template
  → fill parameters
  → validate permission
  → run read-only query/view
  → summarize/render
```

## 8. Initial Analysis Templates

Start with 10–20 fixed templates.

### Sales

1. Monthly sales summary
2. Monthly sales trend
3. Region sales ranking
4. Product/category sales ranking
5. Sales by 담당자/부서

### Finance

6. Outstanding receivables TOP 10
7. Settlement pending list
8. Expense summary by category
9. Cash/account movement summary

### Customer / CRM

10. New customers this month
11. Customer consultation count
12. AS delayed cases
13. High-value customers

### Inventory / Product

14. Low-stock items
15. Inventory movement summary
16. Product delivery status

### HR / Operations

17. Attendance summary
18. Vacation usage summary
19. Work report summary

### Dashboard

20. “오늘 사업 현황 요약해줘” — daily executive summary

## 9. UX Concept

### Main Screen

- Left: chat history / workspace
- Center: conversation
- Right or below: result panel
  - grid
  - chart
  - key metrics
  - suggested follow-ups

### Example Conversation

```text
User: 이번 달 매출 어때?
AI: 이번 달 매출은 4,120만원입니다. 지난달 대비 8.4% 증가했습니다.

[Chart: daily/monthly sales trend]
[Grid: top products]

AI: 지역별로도 나눠볼까요?
```

### Result Types

- `summary`
- `metric_cards`
- `grid`
- `chart`
- `report`
- `approval_request`

## 10. Security Principles

### Data Access

- Use read-only DB account for AI analysis
- Prefer views/materialized views over raw tables
- Restrict tables by role
- Mask PII by default
- Log query template ID, not sensitive raw values where possible

### API Keys

- Do not store user keys on a central server by default
- Store keys in user machine secure storage where possible
  - macOS Keychain
  - Windows Credential Manager
  - Linux Secret Service
- App should show only redacted values
- Provide key revoke/delete/test buttons

### AI Safety

- No destructive action without explicit approval
- No external message sending without approval
- No production DB write in MVP
- Every generated query should pass allowlist/template validation

## 11. Companion App Vision

UNIPLAN likely needs a companion app for user-agent communication and control.

### Purpose

- chat with personal AI agent
- approve/deny sensitive actions
- monitor RAM/CPU/token/cost usage
- manage connected keys/skills
- check task history
- onboard non-developers

### App Role

The app should not remotely grant OS-level computer permissions.

Correct model:

```text
Computer agent requests action
  → mobile app shows approval card
  → user approves/denies
  → computer agent executes within already-granted permissions
```

### Possible Names

- UNIPLAN Control
- UNIPLAN Companion
- UNIPLAN Agent

## 12. Modular Roadmap

### Phase 1 — AI ERP MVP

- chat-based ERP analysis
- query templates
- dashboard charts/grids
- local demo data
- safer read-only architecture

### Phase 2 — Companion App

- Flutter mobile app
- QR pairing with user computer/agent
- approvals
- monitoring
- key/skill management

### Phase 3 — Business Modules

- POS / QR ordering
- shopping mall/e-commerce
- MES
- video meeting
- electronic classroom
- messaging/notification
- report builder

### Phase 4 — Automation

- scheduled reports
- anomaly detection
- agent workflows
- approval-based write actions
- external integrations

## 13. First Implementation Plan

### Step 1. Define Demo Data Model

Create minimal tables/views for:

- sales
- customers
- products
- inventory
- receivables
- consultations/AS
- employees/attendance

### Step 2. Build Query Templates

Each template should define:

- template ID
- natural language examples
- required parameters
- SQL/view/API endpoint
- result schema
- allowed roles
- chart/grid render hints

### Step 3. Build Chat API

Endpoint example:

```http
POST /api/chat
```

Response example:

```json
{
  "message": "이번 달 매출은 4,120만원입니다.",
  "resultType": "chart_grid",
  "chart": {...},
  "grid": {...},
  "suggestions": ["지역별로 보기", "상품별로 보기", "지난달과 비교"]
}
```

### Step 4. Build UI Prototype

- chat panel
- chart panel
- grid panel
- suggestion buttons

### Step 5. Connect AI

- first: rule/template matching
- next: LLM intent classification
- later: natural language query planning with policy gate

## 14. Key Product Principle

UNIPLAN should not become another complicated ERP menu maze.

It should feel like:

> “사업 상황을 말로 물어보고, 바로 이해하고, 필요한 행동까지 이어주는 AI 운영실.”

## 15. Immediate Next Artifacts

Recommended next documents/files:

1. `UNIPLAN_ARCHITECTURE.md`
2. `UNIPLAN_DATA_MODEL.md`
3. `UNIPLAN_QUERY_TEMPLATES.md`
4. `UNIPLAN_COMPANION_APP.md`
5. `UNIPLAN_SECURITY.md`
