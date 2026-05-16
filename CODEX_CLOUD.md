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

`npm install` runs `postinstall`, which creates the ignored local `.env`, points
Prisma at SQLite, creates or updates the demo database, and seeds the data used
by `/api/chat`. It avoids
`prisma db push --force-reset` because Codex Cloud/Prisma safety checks block
destructive database reset commands.

Manual equivalent:

```bash
npm run setup:cloud
```

## Runtime

Local development:

```bash
npm run db:use:sqlite
npm run db:reset
npm run dev
```

PostgreSQL prep:

```bash
npm run db:use:postgres
docker compose -f docker-compose.postgres.yml up -d
npm run db:reset
```

## Security

Do not commit:

- API keys or tokens
- `.env`
- private customer data
- raw database dumps
- generated archive bundles
- Prisma local SQLite DB files

The AI query path must remain template-based and read-only for the MVP.
