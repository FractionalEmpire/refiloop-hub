import { NextResponse } from "next/server";
import { TRACKED_DOCS, getFileContent, getDirectoryListing } from "@/lib/github";

export async function GET() {
  // Static tracked docs
  const staticDocs = await Promise.all(
    TRACKED_DOCS.map(async (doc) => {
      const file = await getFileContent(doc.path);
      return {
        ...doc,
        exists: !!file,
        sha: file?.sha,
      };
    })
  );

  // Dynamic memory files — auto-discovers any .md in memory/
  const memoryFiles = await getDirectoryListing("memory");
  // Sort: MEMORY.md index first, then alphabetical
  memoryFiles.sort((a, b) => {
    if (a.path.endsWith("MEMORY.md")) return -1;
    if (b.path.endsWith("MEMORY.md")) return 1;
    return a.label.localeCompare(b.label);
  });

  return NextResponse.json([...staticDocs, ...memoryFiles]);
}
