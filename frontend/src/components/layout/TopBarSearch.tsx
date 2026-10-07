"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

export function TopBarSearch() {
  const router = useRouter();
  const [value, setValue] = useState("");

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const q = value.trim();
    router.push(q ? `/dogs?q=${encodeURIComponent(q)}` : "/dogs");
  }

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-sm">
      <input
        type="search"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="ペットの名前・犬種で検索…"
        className="w-full h-10 px-4 rounded-full border border-border-default bg-white text-sm text-ink-primary
          placeholder:text-ink-light focus:outline-none focus:ring-2 focus:ring-accent-green/40"
      />
    </form>
  );
}
