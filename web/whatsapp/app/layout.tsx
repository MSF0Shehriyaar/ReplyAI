import type { Metadata } from 'next';
import './globals.css';
import '../../shared/product-theme.css';

export const metadata: Metadata = {
  title: 'WhatsApp Business Workspace',
  description: 'Premium WhatsApp automation and customer support control center',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
