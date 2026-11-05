// Company knowledge ("the brain"): runbooks, policies, account notes, postmortems.
// Small corpus → loaded whole into a cached system prompt so every answer can cite sources.
import fs from "fs";
import path from "path";

export interface KbDoc {
  id: string;
  title: string;
  owner: string;
  updated: string;
  body: string;
}

let cache: KbDoc[] | null = null;

export function loadKb(): KbDoc[] {
  if (cache && process.env.NODE_ENV === "production") return cache;
  const dir = path.join(process.cwd(), "knowledge");
  cache = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .sort()
    .map((f) => {
      const raw = fs.readFileSync(path.join(dir, f), "utf8");
      const m = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
      const meta: Record<string, string> = {};
      (m?.[1] || "").split("\n").forEach((l) => {
        const i = l.indexOf(":");
        if (i > 0) meta[l.slice(0, i).trim()] = l.slice(i + 1).trim();
      });
      return {
        id: f.replace(/\.md$/, ""),
        title: meta.title || f,
        owner: meta.owner || "",
        updated: meta.updated || "",
        body: (m?.[2] || raw).trim(),
      };
    });
  return cache;
}

export function kbPrompt(): string {
  return loadKb()
    .map((d) => `<doc id="${d.id}" title="${d.title}" owner="${d.owner}" updated="${d.updated}">\n${d.body}\n</doc>`)
    .join("\n\n");
}

export function kbIndex() {
  return loadKb().map(({ id, title, owner, updated }) => ({ id, title, owner, updated }));
}
