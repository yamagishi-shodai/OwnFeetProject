"use client";

import { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "danger";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: "sm" | "md";
};

const base =
  "inline-flex items-center justify-center font-bold rounded-full cursor-pointer transition-colors disabled:opacity-40 disabled:cursor-not-allowed";

const variants: Record<Variant, string> = {
  primary:  "bg-accent-green text-white shadow-sm hover:opacity-90",
  secondary: "bg-white border border-border-default text-ink-dark hover:bg-warm-bg",
  danger:   "bg-accent-red text-white shadow-sm hover:opacity-90",
};

const sizes = {
  sm: "text-xs px-4 h-8",
  md: "text-sm px-5 h-10",
};

export function Button({ variant = "secondary", size = "md", className = "", ...props }: Props) {
  return (
    <button
      className={`${base} ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    />
  );
}

// ナビゲーション用：Link に button スタイルを当てるためのクラス文字列を返す
export function linkButtonClass(variant: Variant = "secondary", size: "sm" | "md" = "md", extra = "") {
  return `${base} ${variants[variant]} ${sizes[size]} ${extra}`;
}
