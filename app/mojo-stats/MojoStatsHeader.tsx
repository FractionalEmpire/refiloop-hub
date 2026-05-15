"use client";

import { useEffect, useState } from "react";

const COLORS = [
  "#58a6ff", // blue
  "#3fb950", // green
  "#f78166", // red-orange
  "#d29922", // yellow
  "#a371f7", // purple
  "#39d353", // bright green
  "#ff7b72", // coral
  "#79c0ff", // light blue
  "#ffa657", // orange
  "#ff6b9d", // pink
  "#56d364", // mint
  "#e3b341", // gold
];

export default function MojoStatsHeader() {
  const [color, setColor] = useState("#e6edf3");

  useEffect(() => {
    const random = COLORS[Math.floor(Math.random() * COLORS.length)];
    setColor(random);
  }, []);

  return (
    <div>
      <h1 className="text-2xl font-semibold" style={{ color }}>
        Mojo Stats
      </h1>
      <p className="mt-1 text-sm" style={{ color: "#8b949e" }}>
        Session results, call outcomes, and recording review from Supabase.
      </p>
    </div>
  );
}
