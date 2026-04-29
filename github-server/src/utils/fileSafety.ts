// Safe file fetching helpers shared by every tool that reads from a repo.
//
// Two kinds of safety here:
//   1. Don't dump huge text blobs into Claude's context — cap at MAX_FILE_BYTES.
//   2. Don't dump binary data into a text channel — detect & skip binaries.
//
// We detect binaries two ways: by extension (cheap, before fetching) and
// by content (look for null bytes in the first 512 bytes, after fetching).

import { getOctokit } from "../github/client.js";

/** Hard cap on inline file content. ~200 KB is enough for source files
 * without flooding the LLM. The contents API also caps at 1 MB on its end. */
export const MAX_FILE_BYTES = 200_000;

/** Extensions we never even try to fetch — if a file ends in one of these
 * we return a stub immediately. Saves an API call per binary. */
const BINARY_EXTENSIONS = new Set([
  // images
  "png", "jpg", "jpeg", "gif", "webp", "ico", "bmp", "tiff", "avif", "heic",
  // video / audio
  "mp4", "mov", "avi", "webm", "mkv", "mp3", "wav", "flac", "ogg", "m4a",
  // archives
  "zip", "tar", "gz", "tgz", "bz2", "xz", "7z", "rar",
  // executables / native libs
  "exe", "dll", "so", "dylib", "a", "o", "class", "jar", "wasm",
  // fonts
  "woff", "woff2", "ttf", "otf", "eot",
  // docs
  "pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx",
  // ML / data
  "pyc", "pyo", "whl", "parquet", "arrow", "feather", "npy", "pkl", "h5",
]);

export function isLikelyBinaryByExtension(path: string): boolean {
  const ext = path.split(".").pop()?.toLowerCase();
  if (!ext) return false;
  return BINARY_EXTENSIONS.has(ext);
}

/** Heuristic: a stretch of null bytes in the first 512 bytes suggests
 * binary content. Works well in practice; misses some edge cases (UTF-16
 * BOM-prefixed text shows null bytes too, but those are rare in repos). */
export function isLikelyBinaryByContent(buf: Buffer): boolean {
  const sampleSize = Math.min(buf.length, 512);
  for (let i = 0; i < sampleSize; i++) {
    if (buf[i] === 0) return true;
  }
  return false;
}

export interface FetchedFile {
  path: string;
  size: number;
  text: string;
  truncated: boolean;
  binary: boolean;
}

/** Read a single file from a repo through the contents API, with safety
 * checks. Returns a typed result rather than throwing for "skipped binary"
 * — handlers usually want to *report* the skip, not error out. */
export async function readRepoFile(params: {
  owner: string;
  repo: string;
  path: string;
  ref?: string;
}): Promise<FetchedFile> {
  // Cheap pre-check: skip the API call entirely for known binary extensions.
  if (isLikelyBinaryByExtension(params.path)) {
    return {
      path: params.path,
      size: 0,
      text: "",
      truncated: false,
      binary: true,
    };
  }

  const { data } = await getOctokit().rest.repos.getContent(params);
  if (Array.isArray(data)) {
    throw new Error(
      `Path "${params.path}" is a directory, not a file. Use get_repo_tree to list its contents.`,
    );
  }
  if (data.type !== "file") {
    throw new Error(
      `Path "${params.path}" is a ${data.type}, not a file.`,
    );
  }

  const size = data.size ?? 0;

  // The contents API omits `content` for files larger than 1 MB. We don't
  // want to chase that with the blobs API in this prototype — just report.
  if (!data.content) {
    return {
      path: params.path,
      size,
      text: "",
      truncated: true,
      binary: false,
    };
  }

  const buf = Buffer.from(data.content, "base64");
  if (isLikelyBinaryByContent(buf)) {
    return { path: params.path, size, text: "", truncated: false, binary: true };
  }

  let text = buf.toString("utf8");
  let truncated = false;
  if (Buffer.byteLength(text, "utf8") > MAX_FILE_BYTES) {
    text = Buffer.from(text, "utf8").subarray(0, MAX_FILE_BYTES).toString("utf8");
    truncated = true;
  }
  return { path: params.path, size, text, truncated, binary: false };
}
