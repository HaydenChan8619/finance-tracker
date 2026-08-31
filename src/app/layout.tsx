import type { Metadata, Viewport } from "next";
import PwaRegister from "@/components/pwa-register";
import "./globals.css";

export const metadata: Metadata = {
  title: "Finance Tracker",
  description: "A private, self-hosted ledger for everyday money.",
  applicationName: "Finance Tracker",
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = {
  themeColor: "#142c35",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <div
          hidden
          dangerouslySetInnerHTML={{
            __html:
              "<!-- THESIS: Finance Tracker is a private route map for everyday money, refusing the generic dashboard wall. OWN-WORLD: midnight enamel, porcelain type, disciplined route lines, and signal colors that mark movement. STORY: see the shape of money, take the next useful action, and keep the record yours. FIRST VIEWPORT: a field-ledger landing page or route-aware workspace with the primary action at the start of the line. FORM: route map and ledger, assigned operate direction 7, seed 06b448e4. FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, and DESIGN.md -->",
          }}
        />
        {children}
        <PwaRegister />
      </body>
    </html>
  );
}
