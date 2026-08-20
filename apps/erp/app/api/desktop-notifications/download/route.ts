import { readFile, stat } from "node:fs/promises";
import { isAbsolute } from "node:path";

import { getCurrentStaff } from "../../../../lib/session";

export const dynamic = "force-dynamic";

export async function GET() {
  const staff = await getCurrentStaff();
  if (!staff?.roles.includes("admin")) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const artifactPath =
    process.env.LAWAND_DESKTOP_NOTIFIER_ARTIFACT_PATH?.trim();
  if (
    !artifactPath ||
    !isAbsolute(artifactPath) ||
    !/Lawand\.DesktopNotifier[^/\\]*\.zip$/i.test(artifactPath)
  ) {
    return Response.json({ error: "artifact_unavailable" }, { status: 404 });
  }
  try {
    const artifactStat = await stat(artifactPath);
    if (!artifactStat.isFile() || artifactStat.size > 20 * 1024 * 1024) {
      return Response.json({ error: "artifact_unavailable" }, { status: 404 });
    }
    const artifact = await readFile(artifactPath);
    return new Response(artifact, {
      headers: {
        "cache-control": "private, no-store",
        "content-disposition":
          'attachment; filename="Lawand.DesktopNotifier-win-x64.zip"',
        "content-length": String(artifact.byteLength),
        "content-type": "application/zip",
        "x-content-type-options": "nosniff",
      },
    });
  } catch {
    return Response.json({ error: "artifact_unavailable" }, { status: 404 });
  }
}
