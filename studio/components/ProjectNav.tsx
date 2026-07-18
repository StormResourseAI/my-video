"use client";

import { PROJECTS, PROJECT_SECTIONS } from "@/fixtures";
import { useStudioStore } from "@/state/studioStore";
import { PanelStateView, StateSwitcher } from "./ui";

export default function ProjectNav() {
  const activeProjectId = useStudioStore((s) => s.activeProjectId);
  const activeSection = useStudioStore((s) => s.activeSection);
  const panelState = useStudioStore((s) => s.projectPanelState);
  const selectProject = useStudioStore((s) => s.selectProject);
  const selectSection = useStudioStore((s) => s.selectSection);
  const setPanelState = useStudioStore((s) => s.setProjectPanelState);

  return (
    <aside
      aria-label="Project navigation"
      className="flex h-full flex-col overflow-y-auto border-r border-edge bg-panel"
    >
      <div className="flex items-center justify-between border-b border-edge px-3 py-2">
        <h2 className="text-[11px] font-bold tracking-widest text-muted uppercase">Projects</h2>
        <StateSwitcher label="Projects demo state" value={panelState} onChange={setPanelState} />
      </div>

      {panelState !== "normal" ? (
        <PanelStateView
          state={panelState}
          emptyMessage="No projects yet. New projects will appear here."
          errorMessage="Projects could not be loaded."
        />
      ) : (
        <>
          <ul className="flex flex-col gap-1 p-2">
            {PROJECTS.map((p) => {
              const isActive = p.id === activeProjectId;
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    aria-current={isActive ? "true" : undefined}
                    onClick={() => selectProject(p.id)}
                    className={`w-full rounded-md border px-2.5 py-2 text-left transition-colors ${
                      isActive
                        ? "border-accent/50 bg-accent-soft"
                        : "border-transparent hover:bg-raised"
                    }`}
                  >
                    <span className="block truncate font-semibold">{p.name}</span>
                    <span className="mt-0.5 block text-[11px] text-muted">
                      {p.client} · {p.updated}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>

          <div className="mt-1 border-t border-edge px-3 py-2">
            <h3 className="text-[11px] font-bold tracking-widest text-muted uppercase">Sections</h3>
          </div>
          <ul className="flex flex-col px-2 pb-2">
            {PROJECT_SECTIONS.map((section) => {
              const isActive = section === activeSection;
              return (
                <li key={section}>
                  <button
                    type="button"
                    aria-current={isActive ? "true" : undefined}
                    title={`${section} — mock navigation, not wired in Phase 1`}
                    onClick={() => selectSection(section)}
                    className={`w-full rounded px-2.5 py-1.5 text-left transition-colors ${
                      isActive ? "bg-raised font-semibold text-accent" : "text-muted hover:text-text"
                    }`}
                  >
                    {section}
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </aside>
  );
}
