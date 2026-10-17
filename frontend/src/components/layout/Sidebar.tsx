"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode, SVGProps } from "react";

type NavItem = {
  href: string;
  label: string;
  shortLabel: string; // スマホの下部タブバー用
  icon: ReactNode;
};

function Icon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      width={20}
      height={20}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    />
  );
}

const HomeIcon = () => (
  <Icon>
    <path d="M3 11.5 12 4l9 7.5" />
    <path d="M5 10v9a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1v-9" />
  </Icon>
);

const CameraIcon = () => (
  <Icon>
    <path d="M4 8h3l1.5-2h7L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z" />
    <circle cx="12" cy="13" r="3.2" />
  </Icon>
);

const PetListIcon = () => (
  <Icon>
    <rect x="3.5" y="5" width="7" height="7" rx="1.5" />
    <rect x="13.5" y="5" width="7" height="7" rx="1.5" />
    <rect x="3.5" y="14.5" width="7" height="4.5" rx="1.5" />
    <rect x="13.5" y="14.5" width="7" height="4.5" rx="1.5" />
  </Icon>
);

const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "ホーム", shortLabel: "ホーム", icon: <HomeIcon /> },
  { href: "/sessions/new", label: "新しいカルテをつくる", shortLabel: "新しいカルテ", icon: <CameraIcon /> },
  { href: "/dogs", label: "登録済みペット", shortLabel: "ペット", icon: <PetListIcon /> },
];

// PC・タブレット（md 以上）は左のサイドバー、スマホは画面下のタブバー（MobileNav）

export function Sidebar() {
  const pathname = usePathname();

  return (
    <nav className="hidden md:flex print:hidden w-56 shrink-0 border-r border-border-light bg-warm-main px-3 py-4 flex-col gap-1">
      {NAV_ITEMS.map((item) => {
        const active = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-bold transition-colors ${
              active ? "bg-accent-green text-white" : "text-ink-dark hover:bg-warm-bg"
            }`}
          >
            {item.icon}
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function MobileNav() {
  const pathname = usePathname();

  return (
    <nav className="md:hidden print:hidden fixed bottom-0 inset-x-0 z-50 border-t border-border-light bg-warm-main
      pb-[env(safe-area-inset-bottom)] grid grid-cols-3">
      {NAV_ITEMS.map((item) => {
        const active = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`flex flex-col items-center gap-0.5 py-2 text-[11px] font-bold transition-colors ${
              active ? "text-accent-green" : "text-ink-muted"
            }`}
          >
            {item.icon}
            {item.shortLabel}
          </Link>
        );
      })}
    </nav>
  );
}
