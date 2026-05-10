# PostgreSQL Migration Plan

UniPlan Prototype은 현재 로컬 개발 편의를 위해 SQLite를 사용한다. 운영/사업화 구조에서는 PostgreSQL로 전환한다.

## 1. 현재 상태

- Prisma: v6 고정
- 현재 schema: `prisma/schema.prisma`
- 현재 DB: SQLite
- 현재 env:

```env
DATABASE_URL="file:./dev.db"
```

## 2. PostgreSQL 전환 목표

PostgreSQL 전환 시에도 앱 코드는 대부분 유지한다.

바뀌는 것:

1. Prisma datasource provider
2. `DATABASE_URL`
3. DB 생성/마이그레이션 명령
4. 운영용 숫자 타입/인덱스 세부 조정

## 3. 권장 개발 단계

### A. 지금 유지

SQLite는 빠른 프로토타입/시연용으로 유지한다.

```bash
npm run db:reset
npm run dev
```

### B. PostgreSQL 테스트 전환

PostgreSQL 서버가 준비되면 다음 파일을 사용한다.

- `prisma/schema.postgres.prisma`
- `.env.postgres.example`

전환 테스트:

```bash
cp .env.postgres.example .env
cp prisma/schema.postgres.prisma prisma/schema.prisma
npm run db:reset
npm run dev
```

### C. 다시 SQLite로 복귀

```bash
cp prisma/schema.sqlite.prisma prisma/schema.prisma
printf 'DATABASE_URL="file:./dev.db"\n' > .env
npm run db:reset
```

## 4. PostgreSQL DATABASE_URL 예시

```env
DATABASE_URL="postgresql://uniplan:uniplan_password@localhost:5432/uniplan_dev?schema=public"
```

## 5. 로컬 PostgreSQL 준비 예시

Homebrew PostgreSQL이 있다면:

```bash
createdb uniplan_dev
psql uniplan_dev
```

SQL:

```sql
CREATE USER uniplan WITH PASSWORD 'uniplan_password';
GRANT ALL PRIVILEGES ON DATABASE uniplan_dev TO uniplan;
```

주의: 실제 운영 비밀번호는 절대 문서에 고정하지 않는다.

## 6. Docker Compose 예시

개발용으로는 Docker Compose가 가장 재현성이 좋다.

```yaml
services:
  postgres:
    image: postgres:16
    environment:
      POSTGRES_USER: uniplan
      POSTGRES_PASSWORD: uniplan_password
      POSTGRES_DB: uniplan_dev
    ports:
      - "5432:5432"
    volumes:
      - uniplan_pg_data:/var/lib/postgresql/data

volumes:
  uniplan_pg_data:
```

실행:

```bash
docker compose up -d
npm run db:reset
```

## 7. 운영 전 보완할 점

현재 MVP는 단순화를 위해 금액/수량을 `Int`로 둔다.

운영 전 권장:

- 금액: `Decimal @db.Decimal(15, 2)`
- 수량: `Decimal @db.Decimal(15, 3)`
- 날짜 집계용 인덱스 추가
- `companyId` 포함 복합 인덱스 강화
- audit log 테이블 추가
- read-only DB user 분리
- migration history 관리

## 8. 안전 운영 원칙

AI query runner는 운영 DB에서 별도 read-only 계정을 사용한다.

권장 구조:

```text
App write user
  - 일반 CRUD/API용

AI read-only user
  - SELECT only
  - analytics view만 접근
  - company_id 필터 강제
```

## 9. Prisma 명령

개발 초기:

```bash
npm run db:reset
```

스키마만 반영:

```bash
npm run db:push
```

운영에 가까운 단계:

```bash
npx prisma migrate dev --name init
npx prisma migrate deploy
```

현재는 프로토타입이므로 `db push`를 사용한다.
