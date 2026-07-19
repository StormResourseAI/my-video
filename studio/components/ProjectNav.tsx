"use client";

import { useEffect } from "react";
import { useStudioStore } from "@/state/studioStore";
import { Chip } from "./ui";

export default function ProjectNav() {
  const realProjects = useStudioStore((s) => s.realProjects);
  const realProjectsStatus = useStudioStore((s) => s.realProjectsStatus);
  const realProjectsError = useStudioStore((s) => s.realProjectsError);
  const activeRealProjectId = useStudioStore((s) => s.activeRealProjectId);
  const loadRealProjects = useStudioStore((s) => s.loadRealProjects);
  const selectRealProject = useStudioStore((s) => s.selectRealProject);
  const draftActive = useStudioStore((s) => s.draftWorking) !== null;
  const draftDirty = useStudioStore((s) => s.draftDirty);
  const exitDraft = useStudioStore((s) => s.exitDraft);

  // Leaving an active draft is explicit: confirm before discarding unsaved
  // in-memory changes, and always clear draft mode before switching.
  const switchProject = (projectId: string) => {
    if (draftActive) {
      if (draftDirty && !window.confirm("Discard unsaved draft changes?")) return;
      exitDraft();
    }
    void selectRealProject(projectId);
  };

  useEffect(() => {
    if (realProjectsStatus === "idle") void loadRealProjects();
  }, [realProjectsStatus, loadRealProjects]);

  return (
    <aside
      aria-label="Project navigation"
      className="flex h-full flex-col overflow-y-auto border-r border-edge bg-panel"
    >
      <div className="flex items-center justify-between border-b border-edge px-3 py-2">
        <h2 className="text-[11px] font-bold tracking-widest text-muted uppercase">
          Local projects
        </h2>
        <Chip tone="warn">Read-only</Chip>
      </div>

      {realProjectsStatus === "loading" || realProjectsStatus === "idle" ? (
        <div role="status" aria-label="Loading projects" className="flex flex-col gap-2 p-3">
          <div className="skeleton h-10" />
          <div className="skeleton h-10" />
          <span className="sr-only">Loading projects</span>
        </div>
      ) : realProjectsStatus === "error" ? (
        <div role="alert" className="m-3 rounded-md border border-danger/40 bg-danger/10 p-3">
          <p className="font-semibold text-danger">Projects unavailable</p>
          <p className="mt-1 text-muted">{realProjectsError}</p>
          <button
            type="button"
            onClick={() => void loadRealProjects()}
            className="mt-2 rounded border border-edge bg-raised px-2 py-1 text-muted hover:text-text"
          >
            Retry
          </button>
        </div>
      ) : realProjects.length === 0 ? (
        <div className="m-3 rounded-md border border-dashed border-edge p-4 text-center text-muted">
          <p className="font-semibold text-text">No materialized projects available</p>
          <p className="mt-1">Studio did not find materialized project data. Your source files are safe; prepare a project outside Studio, then retry.</p>
          <button type="button" onClick={() => void loadRealProjects()} className="mt-3 rounded bg-raised px-2 py-1 hover:text-text">Retry</button>
        </div>
      ) : !realProjects.some((project) => project.previewReady) ? (
        <div className="m-3 rounded-md border border-dashed border-edge p-4 text-center text-muted">
          <p className="font-semibold text-text">No preview-ready project is available</p>
          <p className="mt-1">Materialize a project outside Studio, then retry. Source files remain safe.</p>
          <button type="button" onClick={() => void loadRealProjects()} className="mt-3 rounded bg-raised px-2 py-1 hover:text-text">Retry</button>
        </div>
      ) : (
        <ul className="flex flex-col gap-1 p-2">
          {realProjects.map((p) => {
            const isActive = p.projectId === activeRealProjectId;
            return (
              <li key={p.projectId}>
                <button
                  type="button"
                  aria-current={isActive ? "true" : undefined}
                  onClick={() => switchProject(p.projectId)}
                  className={`w-full rounded-md border px-2.5 py-2 text-left transition-colors ${
                    isActive
                      ? "border-accent/50 bg-accent-soft"
                      : "border-transparent hover:bg-raised"
                  }`}
                >
                  <span className="block truncate font-semibold">{p.projectName}</span>
                  <span className="mt-0.5 block text-[11px] text-muted">
                    {p.clientSlug ?? p.projectId}
                    {p.previewReady ? "" : " · no preview cache"}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

    </aside>
  );
}
