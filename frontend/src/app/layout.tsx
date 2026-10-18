import type { Metadata } from "next";
import { M_PLUS_Rounded_1c } from "next/font/google";
import "./globals.css";
import Link from "next/link";
import { MobileNav, Sidebar } from "@/components/layout/Sidebar";
import { TopBarSearch } from "@/components/layout/TopBarSearch";
import { SplashScreen } from "@/components/layout/SplashScreen";
import { SPLASH_STORAGE_KEY } from "@/components/layout/splash-key";

const mPlusRounded = M_PLUS_Rounded_1c({
  weight: ["400", "700"],
  subsets: ["latin"],
  variable: "--font-mplus-rounded",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Own Feet Platform",
  description: "基準物と画像解析による犬の採寸・車椅子適合評価",
};

const SPLASH_CHECK =
  `try{if(sessionStorage.getItem("${SPLASH_STORAGE_KEY}")==="1")document.documentElement.setAttribute("data-splash-done","")}catch(e){}`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja" suppressHydrationWarning className={`${mPlusRounded.variable} h-full`}>
      <head>
        {/* スタート画面をこのタブで見せ済みなら、描画前に隠す（ちらつき防止） */}
        <script dangerouslySetInnerHTML={{ __html: SPLASH_CHECK }} />
      </head>
      <body className="min-h-full flex flex-col bg-warm-sub text-ink-primary print:bg-white">
        <SplashScreen />
        <header className="print:hidden sticky top-0 z-50 bg-warm-main border-b border-border-light">
          <div className="px-3 md:px-5 py-2.5 flex items-center gap-3 md:gap-5">
            <Link href="/" className="shrink-0" aria-label="Own Feet Platform ホーム">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/OwnFeetPlatform_logo+.png" alt="Own Feet Platform" className="h-9 md:h-11 w-auto" />
            </Link>
            <TopBarSearch />
          </div>
        </header>
        <div className="flex-1 flex">
          <Sidebar />
          {/* スマホでは下部タブバーの分だけ余白を空ける */}
          <main className="flex-1 min-w-0 pb-20 md:pb-0 print:pb-0">{children}</main>
        </div>
        <MobileNav />
      </body>
    </html>
  );
}
