import Link from "next/link";
import { Icon } from "@/components/icon";

const previewRows = [
  { merchant: "Neighborhood market", category: "Groceries", amount: "-$38.20", tone: "expense" },
  { merchant: "The corner table", category: "Dining · Social", amount: "-$24.50", tone: "expense" },
  { merchant: "Monthly pay", category: "Income", amount: "+$2,840.00", tone: "income" },
];

export default function HomePage() {
  return (
    <main className="public-page">
      <nav className="public-nav" aria-label="Public navigation">
        <Link href="/" className="brand" aria-label="Finance Tracker home">
          <span className="brand-mark" aria-hidden="true" />
          <span className="brand-name">
            Finance Tracker
            <small>private ledger</small>
          </span>
        </Link>
        <Link href="/login" className="button button-secondary">
          Open workspace
          <Icon name="arrow-up-right" className="icon-sm" />
        </Link>
      </nav>

      <section className="public-hero" aria-labelledby="home-title">
        <div>
          <p className="eyebrow">A clearer line through your money</p>
          <h1 id="home-title">
            Keep the record <em>yours.</em>
          </h1>
          <p className="public-hero-copy">
            A small, self-hosted finance tracker for adding transactions, honest categories, and the
            spending patterns you actually want to see.
          </p>
          <div className="public-actions">
            <Link href="/login" className="button button-primary">
              Sign in to your ledger
              <Icon name="arrow-up-right" className="icon-sm" />
            </Link>
            <a href="#preview" className="button button-secondary">
              See the shape of it
            </a>
          </div>
          <div className="public-proof" aria-label="Product qualities">
            <span>Private database</span>
            <span>One social toggle</span>
            <span>No bank connection required</span>
          </div>
        </div>

        <div id="preview" className="demo-ledger" aria-label="Illustrative ledger preview">
          <div className="demo-route" aria-hidden="true" />
          <div className="demo-ledger-top">
            <span className="demo-ledger-title">A line you can follow</span>
            <span className="demo-ledger-date">illustrative preview</span>
          </div>
          {previewRows.map((row) => (
            <div className="demo-item" key={row.merchant}>
              <span className="demo-station" aria-hidden="true" />
              <span className="demo-item-copy">
                <strong>{row.merchant}</strong>
                <span>{row.category}</span>
              </span>
              <span className={`demo-item-amount${row.tone === "income" ? " income" : ""}`}>
                {row.amount}
              </span>
            </div>
          ))}
          <div className="demo-item">
            <span className="demo-station" aria-hidden="true" />
            <span className="demo-item-copy">
              <strong>Your next transaction</strong>
              <span>captured from the phone, visible here</span>
            </span>
            <Icon name="plus" className="icon-sm" />
          </div>
        </div>
      </section>

      <p className="public-note">
        The preview uses synthetic rows only. Anonymous visitors never query or write your database.
      </p>
    </main>
  );
}
