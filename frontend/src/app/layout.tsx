import type { Metadata } from "next";
import { M_PLUS_Rounded_1c } from "next/font/google";
import "./globals.css";
import Link from "next/link";

const mPlusRounded = M_PLUS_Rounded_1c({
  weight: ["400", "700"],
  subsets: ["latin"],
  variable: "--font-mplus-rounded",
  display: "swap",
});

export const metadata: Metadata = {
  title: "犬用車椅子採寸プラットフォーム",
  description: "専用採寸マットと画像解析による犬の採寸・車椅子適合評価",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja" className={`${mPlusRounded.variable} h-full`}>
      <body className="min-h-full flex flex-col bg-warm-sub text-ink-primary">
        <header className="sticky top-0 z-50 bg-warm-main border-b border-border-light">
          <div className="max-w-5xl mx-auto px-5 py-2.5 flex items-center gap-3">
            <Link href="/" className="text-lg font-bold text-ink-dark tracking-tight">
              🐾 採寸プラットフォーム
            </Link>
            <span className="text-xs font-bold text-ink-muted tracking-widest">
              Dog Wheelchair Fitting
            </span>
          </div>
        </header>
        <main className="flex-1">
          {children}
        </main>
      </body>
    </html>
  );
}
