import type { Metadata } from 'next';
import '@fontsource-variable/vazirmatn';
import './globals.css';

export const metadata: Metadata = {
  title: 'سردبیر | میز هوشمند خبر',
  description: 'تولید، بازتولید و آرشیو خبر با کنترل کامل زاویه تحریریه',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fa" dir="rtl">
      <body>{children}</body>
    </html>
  );
}
