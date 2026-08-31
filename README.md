# Finance Tracker

Finance Tracker is a personal finance ledger built with Next.js, Prisma, and PostgreSQL (optimized for Neon / Vercel).

## Setup

```bash
npm install
copy .env.example .env
# Set DATABASE_URL, ADMIN_EMAIL, ADMIN_PASSWORD, SESSION_SECRET in .env
npm run db:push
npm run db:seed
npm run dev
```

Open `http://localhost:3000`. Sign in with your configured `ADMIN_EMAIL` and `ADMIN_PASSWORD`.

## Deploying to Vercel

1. Create a free PostgreSQL database on **[Neon.tech](https://neon.tech)**.
2. Push your code to GitHub and import the repository into **[Vercel](https://vercel.com)**.
3. In the Vercel dashboard, configure the following Environment Variables:
   - `DATABASE_URL`: Your pooled Neon connection string (`postgresql://...sslmode=require`)
   - `ADMIN_EMAIL`: Your login email address
   - `ADMIN_PASSWORD`: Your admin password
   - `SESSION_SECRET`: A 32+ character random secret (e.g. `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`)
4. Deploy! Vercel automatically runs `prisma generate && next build`.

## Features

- Password-protected admin workspace with server-enforced authorization.
- Transaction and category CRUD with cents-based amounts and audit entries.
- Mobile quick capture with a revocable HttpOnly device cookie.
- One-time device enrollment codes generated from Settings.
- Historical merchant, built-in keyword, and user-rule category suggestions.
- Idempotent transaction writes for safe retries and offline queueing.
- Six-month cash-flow, category, merchant, recurring-signal, and social-spend views.
- Optional TD statement staging and human review before canonical import.
- Public preview UI with synthetic rows only. Anonymous API requests cannot read or write real data.

## Checks

```bash
npm run typecheck
npm run lint
npm run build
```
