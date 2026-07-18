"use client";

import { useStudioStore } from "@/state/studioStore";

const NAV_ITEMS: { name: string; glyph: string }[] = [
  { name: "Studio", glyph: "◧" },
  { name: "Projects", glyph: "▤" },
  { name: "Media Library", glyph: "▣" },
  { name: "Transcripts", glyph: "≡" },
  { name: "AI Editor", glyph: "✦" },
  { name: "Templates", glyph: "▦" },
  { name: "Brand Kits", glyph: "◈" },
  { name: "Exports", glyph: "⇪" },
  { name: "Notifications", glyph: "◔" },
  { name: "Settings", glyph: "⚙" },
];

export default function AppRail() {
  const active = useStudioStore((s) => s.activeNavItem);
  const setActive = useStudioStore((s) => s.setActiveNavItem);

  return (
    <nav
      aria-label="Application rail"
      className="flex h-full flex-col items-center gap-1 border-r border-edge bg-panel py-2"
    >
      {NAV_ITEMS.map((item) => {
        const isActive = active === item.name;
        return (
          <button
            key={item.name}
            type="button"
            aria-label={item.name}
            aria-current={isActive ? "page" : undefined}
            title={`${item.name} — mock navigation, not wired in Phase 1`}
            onClick={() => setActive(item.name)}
            className={`flex h-10 w-10 items-center justify-center rounded-lg text-lg transition-colors ${
              isActive
                ? "bg-accent-soft text-accent"
                : "text-muted hover:bg-raised hover:text-text"
            }`}
          >
            <span aria-hidden>{item.glyph}</span>
          </button>
        );
      })}
    </nav>
  );
}
