"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

export default function ApplyFiltersButton() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function applyFilters(event: React.MouseEvent<HTMLButtonElement>) {
    event.preventDefault();

    const sourceForm = event.currentTarget.closest("form");
    const formData = new FormData(sourceForm ?? undefined);
    const params = new URLSearchParams();

    Array.from(formData.entries()).forEach(([key, value]) => {
      const text = String(value);
      if (text) params.set(key, text);
    });
    params.set("page", "1");

    startTransition(() => {
      router.push(`/mojo-stats?${params.toString()}`, { scroll: false });
    });
  }

  return (
    <button
      type="button"
      onClick={applyFilters}
      disabled={isPending}
      className="w-full rounded-md px-3 py-2 text-sm font-semibold"
      style={{ background: isPending ? "#23863699" : "#238636", color: "#fff" }}
    >
      {isPending ? "Applying..." : "Apply"}
    </button>
  );
}
