// Root layout. The stylesheet is imported here rather than in the page so it loads once
// for the whole app; it is the same `styles/dashboard.css` the mock (D-93) and the static
// snapshot (D-119) render, not a copy.
import type { Metadata } from 'next';
import '../styles/dashboard.css';

export const metadata: Metadata = {
  title: 'job·scout',
  description: 'Remote, India-eligible PM roles — discovered, enriched, and ranked.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // The stylesheet already handles both colour schemes: `prefers-color-scheme` for the
  // system default plus `[data-theme]` overrides. Nothing sets `data-theme` today, so the
  // page follows the viewer's OS setting.
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
