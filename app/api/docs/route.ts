import { NextResponse } from "next/server";
import { TRACKED_DOCS, getFileContent } from "@/lib/github";

export async function GET() {
  const docs = await Promise.all(
    TRACKED_DOCS.map(async (doc) => {
      const file = await getFileContent(doc.path);
      return {
        ...doc,
        exists: !!file,
        sha: file?.sha,
      };
    })
  );
  return NextResponse.json(docs);
}
