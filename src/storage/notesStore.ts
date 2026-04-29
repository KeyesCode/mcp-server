// A deliberately tiny "database": a JSON file on disk.
//
// Why a JSON file? It keeps the prototype dependency-free and makes it easy
// to inspect what the server saved. Real MCP servers commonly back tools with
// SQLite, Postgres, an in-memory cache, or an external API — the storage layer
// is just an implementation detail behind the tool handler.

import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Note } from "../types/note.js";

// Resolve the default storage path relative to this source file. Using
// `import.meta.url` keeps things working whether we run via `tsx` (src) or
// `node` (dist) — both end up pointing at <repo>/data/notes.json.
const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..");
const DEFAULT_NOTES_PATH = path.join(repoRoot, "data", "notes.json");

// Allow overriding via env var so the README can show off configurability.
const NOTES_FILE = process.env.NOTES_FILE_PATH?.trim() || DEFAULT_NOTES_PATH;

/** Make sure the data directory and file exist before we touch them. */
async function ensureFile(): Promise<void> {
  await fs.mkdir(path.dirname(NOTES_FILE), { recursive: true });
  try {
    await fs.access(NOTES_FILE);
  } catch {
    // File does not exist yet — start with an empty array.
    await fs.writeFile(NOTES_FILE, "[]", "utf8");
  }
}

/** Load all notes. Treats unreadable / invalid JSON as "empty" rather than crashing. */
export async function loadNotes(): Promise<Note[]> {
  await ensureFile();
  const raw = await fs.readFile(NOTES_FILE, "utf8");
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Note[]) : [];
  } catch {
    // Corrupt JSON — log and recover. A real server might rotate the bad file
    // for forensic purposes; for a learning prototype we just reset.
    console.error(`[notesStore] notes.json was invalid JSON, resetting.`);
    await fs.writeFile(NOTES_FILE, "[]", "utf8");
    return [];
  }
}

/** Append a new note and return the saved record. */
export async function addNote(input: { title: string; body: string }): Promise<Note> {
  const notes = await loadNotes();
  const now = new Date();
  const note: Note = {
    id: `${slugify(input.title)}-${now.getTime()}`,
    title: input.title,
    body: input.body,
    createdAt: now.toISOString(),
  };
  notes.push(note);
  await fs.writeFile(NOTES_FILE, JSON.stringify(notes, null, 2), "utf8");
  return note;
}

/** Find the most recent note matching the given title (case-insensitive). */
export async function findNoteByTitle(title: string): Promise<Note | undefined> {
  const notes = await loadNotes();
  const target = title.trim().toLowerCase();
  // Search newest-first so "summarize the latest version" works naturally.
  for (let i = notes.length - 1; i >= 0; i--) {
    if (notes[i].title.toLowerCase() === target) return notes[i];
  }
  return undefined;
}

/** Where the notes file lives — exposed so the README/status can show it. */
export function getNotesFilePath(): string {
  return NOTES_FILE;
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "note";
}
