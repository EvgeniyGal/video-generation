import { execFileSync, execSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { randomUUID } from "crypto";

const OUT_W = 1080;
const OUT_H = 1350; // 4:5 photo carousel

export function assertFfmpegAvailable() {
  try {
    execSync("ffmpeg -version", { stdio: "ignore" });
  } catch {
    throw new Error(
      "FFmpeg not found on PATH. Install FFmpeg and restart the server.",
    );
  }
}

function escapeDrawtext(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/:/g, "\\:")
    .replace(/'/g, "\\'")
    .replace(/%/g, "%%")
    .replace(/\n/g, "\\n");
}

function findFontFile(): string | null {
  const candidates = [
    // Docker / Debian
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
    // Windows
    "C:/Windows/Fonts/arialbd.ttf",
    "C:/Windows/Fonts/arial.ttf",
    "C:/Windows/Fonts/segoeui.ttf",
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p.replace(/\\/g, "/");
  }
  return null;
}

/**
 * Scale/crop background to 1080×1350 and burn headline (+ optional body) as overlay text.
 */
export function composeCarouselSlide(params: {
  backgroundBytes: Buffer;
  headline: string;
  body?: string;
}): Buffer {
  assertFfmpegAvailable();
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "carousel-slide-"));
  const inPath = path.join(workDir, "in.png");
  const outPath = path.join(workDir, `out-${randomUUID()}.jpg`);

  try {
    fs.writeFileSync(inPath, params.backgroundBytes);

    const font = findFontFile();
    const fontOpt = font ? `:fontfile='${font.replace(/:/g, "\\:")}'` : "";

    const headline = escapeDrawtext(params.headline.slice(0, 120));
    const body = params.body?.trim()
      ? escapeDrawtext(params.body.trim().slice(0, 220))
      : "";

    const filters = [
      `scale=${OUT_W}:${OUT_H}:force_original_aspect_ratio=increase`,
      `crop=${OUT_W}:${OUT_H}`,
      // Dark gradient band for readability
      `drawbox=x=0:y=ih*0.55:w=iw:h=ih*0.45:color=black@0.55:t=fill`,
      `drawtext=text='${headline}'${fontOpt}:fontsize=52:fontcolor=white:borderw=2:bordercolor=black@0.4:x=(w-text_w)/2:y=h*0.62:line_spacing=8`,
    ];
    if (body) {
      filters.push(
        `drawtext=text='${body}'${fontOpt}:fontsize=32:fontcolor=white@0.92:borderw=1:bordercolor=black@0.35:x=(w-text_w)/2:y=h*0.78:line_spacing=6`,
      );
    }

    execFileSync(
      "ffmpeg",
      [
        "-y",
        "-i",
        inPath,
        "-vf",
        filters.join(","),
        "-frames:v",
        "1",
        "-q:v",
        "3",
        outPath,
      ],
      { stdio: "pipe", timeout: 120_000 },
    );

    return fs.readFileSync(outPath);
  } finally {
    try {
      fs.rmSync(workDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
}
