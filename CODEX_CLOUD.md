# Codex Cloud Setup

Use this GitHub repository as the Codex Cloud project for `uniplan`.

## Setup

```bash
npm install
```

## Verification

Primary check:

```bash
npm run verify:cloud
```

`npm install` runs a non-destructive Prisma client generation step. It does not
create, reset, or seed a database.

Manual equivalent for client generation:

```bash
npm run setup:cloud
```

## Runtime

Local development:

```bash
cp .env.postgres.example .env
docker compose -f docker-compose.postgres.yml up -d
npm run db:reset
npm run dev
```

Non-destructive migration deployment:

```bash
npm run db:migrate
```

## Security

Do not commit:

- API keys or tokens
- `.env`
- private customer data
- raw database dumps
- generated archive bundles
- local database volumes or dumps

The AI query path must remain template-based and read-only for the MVP.
