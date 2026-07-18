import type {
  MediaAsset,
  Project,
  ProjectSection,
  TimelineClip,
  TimelineTrack,
} from "@/lib/types";

export const PROJECTS: Project[] = [
  { id: "p-airbnb", name: "Airbnb Cinematic Edit", client: "Coastal Stays", updated: "Today", resolution: "3840×2160", fps: 30, duration: "00:32" },
  { id: "p-drone", name: "Drone Property Reveal", client: "Ridgeline Realty", updated: "Yesterday", resolution: "5120×2880", fps: 30, duration: "00:32" },
  { id: "p-kitchen", name: "Quiet Kitchen Reels", client: "Maple & Stone", updated: "3 days ago", resolution: "3840×2160", fps: 30, duration: "00:26" },
];

export const PROJECT_SECTIONS: ProjectSection[] = [
  "Overview",
  "Source Media",
  "AI Analysis",
  "Story Plan",
  "Timeline",
  "Deliverables",
];

const g = (a: string, b: string) => `linear-gradient(135deg, ${a}, ${b})`;

export const MEDIA_ASSETS: MediaAsset[] = [
  { id: "m-01", projectId: "p-airbnb", filename: "A001_master_bedroom.mp4", kind: "video", duration: "00:42", resolution: "3840×2160", aiScore: 92, used: true, thumb: g("#1e3a5f", "#0f1d30") },
  { id: "m-02", projectId: "p-airbnb", filename: "A002_kitchen_pan.mp4", kind: "video", duration: "00:31", resolution: "3840×2160", aiScore: 88, used: true, thumb: g("#2d4a3e", "#12211b") },
  { id: "m-03", projectId: "p-airbnb", filename: "A003_pool_sunset.mp4", kind: "video", duration: "01:04", resolution: "3840×2160", aiScore: 95, used: true, thumb: g("#5f3a1e", "#301d0f") },
  { id: "m-04", projectId: "p-airbnb", filename: "stills_patio_01.jpg", kind: "photo", duration: "—", resolution: "6000×4000", aiScore: 81, used: false, thumb: g("#4a2d3e", "#21121b") },
  { id: "m-05", projectId: "p-airbnb", filename: "stills_livingroom_02.jpg", kind: "photo", duration: "—", resolution: "6000×4000", aiScore: 74, used: false, thumb: g("#3e4a2d", "#1b2112") },
  { id: "m-06", projectId: "p-airbnb", filename: "warm_keys_bed_112.mp3", kind: "audio", duration: "02:36", resolution: "48 kHz", aiScore: 89, used: true, thumb: g("#33305c", "#16142b") },
  { id: "m-07", projectId: "p-airbnb", filename: "vo_host_welcome.wav", kind: "audio", duration: "00:48", resolution: "48 kHz", aiScore: 90, used: true, thumb: g("#2d3f4a", "#121c21") },
  { id: "m-08", projectId: "p-airbnb", filename: "gen_title_card_dusk.png", kind: "generated", duration: "—", resolution: "1920×1080", aiScore: 86, used: true, thumb: g("#5c3053", "#2b1426") },
  { id: "m-09", projectId: "p-drone", filename: "D001_ridge_flyover.mp4", kind: "video", duration: "01:22", resolution: "5120×2880", aiScore: 97, used: true, thumb: g("#1e5f5a", "#0f302d") },
  { id: "m-10", projectId: "p-drone", filename: "D002_orbit_backyard.mp4", kind: "video", duration: "00:58", resolution: "5120×2880", aiScore: 91, used: true, thumb: g("#1e3a5f", "#101f33") },
  { id: "m-11", projectId: "p-drone", filename: "D003_reveal_facade.mp4", kind: "video", duration: "00:47", resolution: "5120×2880", aiScore: 94, used: false, thumb: g("#5f4b1e", "#30260f") },
  { id: "m-12", projectId: "p-drone", filename: "cinematic_rise_128.mp3", kind: "audio", duration: "03:02", resolution: "48 kHz", aiScore: 85, used: true, thumb: g("#30475c", "#14222b") },
  { id: "m-13", projectId: "p-kitchen", filename: "K001_pour_over.mp4", kind: "video", duration: "00:26", resolution: "3840×2160", aiScore: 90, used: true, thumb: g("#4a3a2d", "#211a12") },
  { id: "m-14", projectId: "p-kitchen", filename: "K002_knife_prep.mp4", kind: "video", duration: "00:33", resolution: "3840×2160", aiScore: 87, used: true, thumb: g("#2d4a44", "#12211e") },
  { id: "m-15", projectId: "p-kitchen", filename: "gen_steam_loop.mp4", kind: "generated", duration: "00:12", resolution: "1920×1080", aiScore: 78, used: false, thumb: g("#44305c", "#1f142b") },
  { id: "m-16", projectId: "p-kitchen", filename: "soft_morning_90.mp3", kind: "audio", duration: "02:12", resolution: "48 kHz", aiScore: 83, used: true, thumb: g("#305c3d", "#142b1c") },
];

export const TRACKS: TimelineTrack[] = [
  { id: "t-v3", label: "V3", name: "Titles / Overlays", kind: "video" },
  { id: "t-v2", label: "V2", name: "B-roll / Photos", kind: "video" },
  { id: "t-v1", label: "V1", name: "Primary Video", kind: "video" },
  { id: "t-a2", label: "A2", name: "Voiceover", kind: "audio" },
  { id: "t-a1", label: "A1", name: "Music", kind: "audio" },
  { id: "t-cc", label: "CC", name: "Captions", kind: "caption" },
];

export const CLIPS: TimelineClip[] = [
  { id: "c-01", trackId: "t-v3", name: "Title — Coastal Stays", start: 1, duration: 4, badges: [], waveform: false, color: "#553a7d" },
  { id: "c-02", trackId: "t-v3", name: "Lower Third — Host", start: 14, duration: 5, badges: [], waveform: false, color: "#553a7d" },
  { id: "c-03", trackId: "t-v2", name: "stills_patio_01", start: 6, duration: 4, badges: ["AI SELECTED"], waveform: false, color: "#7d5a3a" },
  { id: "c-04", trackId: "t-v2", name: "A002_kitchen_pan", start: 18, duration: 6, badges: ["AI SELECTED", "AUTO REFRAMED"], waveform: false, color: "#7d5a3a" },
  { id: "c-05", trackId: "t-v1", name: "A001_master_bedroom", start: 0, duration: 9, badges: ["AI SELECTED", "AI TRIM"], waveform: false, color: "#2e5d8a" },
  { id: "c-06", trackId: "t-v1", name: "A003_pool_sunset", start: 9, duration: 12, badges: ["BEAT SYNCED"], waveform: false, color: "#2e5d8a" },
  { id: "c-07", trackId: "t-v1", name: "D001_ridge_flyover", start: 21, duration: 10, badges: ["AI SELECTED", "AUTO REFRAMED"], waveform: false, color: "#2e5d8a" },
  { id: "c-08", trackId: "t-a2", name: "vo_host_welcome", start: 2, duration: 11, badges: ["AI TRIM"], waveform: true, color: "#3f7d52" },
  { id: "c-09", trackId: "t-a1", name: "warm_keys_bed_112", start: 0, duration: 31, badges: ["BEAT SYNCED"], waveform: true, color: "#3f6a7d" },
  { id: "c-10", trackId: "t-cc", name: "Captions — auto EN", start: 2, duration: 28, badges: [], waveform: false, color: "#5d5d5d" },
];

/** Total mock timeline length in seconds, for ruler + playhead math. */
export const TIMELINE_LENGTH = 32;
