# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Next.js App Router, Prisma, SQLite, and a progressive web app client.

## Users

The primary user is one person managing their own finances from a trusted PC and an authorized iPhone. Public visitors may inspect the interface without accessing or changing private records.

## Product Purpose

Finance Tracker is a self-hosted personal finance tool for recording expenses quickly, organizing them across category and social dimensions, and understanding cash flow without a bank-sync subscription. Success means a purchase can be captured in seconds and the same canonical record is available for desktop review.

## Positioning

The product combines a central private SQLite source of truth with a low-friction, revocable device credential and an orthogonal social-spending lens.

## Operating Context

The PC is the administrative and analytics surface. The iPhone is a mobile PWA for quick capture. The application is intended for a private network or secure private tunnel, with public access limited to a non-persistent interface shell. TD Bank statements may be imported later through a reviewed staging pipeline.

## Capabilities and Constraints

- Admin password authentication protects real records and management actions.
- An explicitly enrolled device can create transactions and read recent transactions only.
- The server enforces permissions; UI visibility is not a security boundary.
- SQLite is the canonical store. Financial databases, statements, backups, and secrets stay outside version control.
- Expenses and income use positive cent amounts plus a direction, and `isSocial` remains independent of category.
- Offline mobile submissions use idempotency keys so retries cannot create duplicates.
- PDF import is optional and deferred until the core product is useful.

## Brand Commitments

The working product name is Finance Tracker. The voice should be direct, calm, private, and practical; it should make financial records feel understandable rather than judgmental.

## Evidence on Hand

The product architecture and requirements are documented in [design.md](design.md). No real bank statements, transaction records, customer proof, or production assets are available and must not be fabricated.

## Product Principles

1. Keep the capture path smaller than the analysis path.
2. Treat private financial data as server-owned and permissioned.
3. Make derived predictions explainable and correctable.
4. Surface uncertainty before it becomes a financial record.
5. Prefer recoverability and simple self-hosting over hidden dependencies.
