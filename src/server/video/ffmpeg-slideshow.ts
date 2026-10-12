import { execFileSync, execSync } from "child_process";
import { randomUUID } from "crypto";
import fs from "fs";
import os from "os";
import path from "path";

export function assertFfmpegAvailable() {
  try {
    execSync("ffmpeg -version", { stdio: "ignore" });
    execSync("ffprobe -version", { stdio: "ignore" });
  } catch {
    throw new Error(
      "FFmpeg/ffprobe not found on PATH. Install FFmpeg (e.g. winget install Gyan.FFmpeg) and restart the server.",
    );
  }
}

function probeDurationSec(filePath: string): number {
  const out = execFileSync(
    "ffprobe",
    [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      filePath,
    ],
    { encoding: "utf8" },
  );
  const n = parseFloat(out.trim());
  if (!n || Number.isNaN(n)) {
    throw new Error(`Could not probe duration for ${filePath}`);
  }
  return n;
}

function writeScaledStill(src: string, dest: string) {
  // Cover 9:16 (1080x1920): scale up to fill, then center-crop.
  // OpenAI portrait stills are typically 1024x1536 (2:3), which is wider
  // than 9:16 — decrease+pad left black bars; increase+crop fills the frame.
  execFileSync(
    "ffmpeg",
    [
      "-y",
      "-i",
      src,
      "-vf",
      "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1",
      "-frames:v",
      "1",
      dest,
    ],
    { stdio: "pipe" },
  );
}

export async function composeSlideshowMp4(params: {
  imageBuffers: Buffer[];
  audioBuffer: Buffer;
  sceneDurationsSec: number[];
  assContent?: string | null;
}): Promise<{ mp4: Buffer; durationSec: number }> {
  assertFfmpegAvailable();

  if (
    params.imageBuffers.length === 0 ||
    params.imageBuffers.length !== params.sceneDurationsSec.length
  ) {
    throw new Error("imageBuffers and sceneDurationsSec length mismatch");
  }

  const workDir = path.join(os.tmpdir(), `slideshow-${randomUUID()}`);
  fs.mkdirSync(workDir, { recursive: true });

  try {
    const audioPath = path.join(workDir, "audio.mp3");
    fs.writeFileSync(audioPath, params.audioBuffer);
    const audioDuration = probeDurationSec(audioPath);

    const stillPaths: string[] = [];
    for (let i = 0; i < params.imageBuffers.length; i++) {
      const raw = path.join(workDir, `raw-${i}.png`);
      const still = path.join(workDir, `still-${i}.png`);
      fs.writeFileSync(raw, params.imageBuffers[i]);
      writeScaledStill(raw, still);
      stillPaths.push(still);
    }

    // Normalize durations to exact audio length
    const weights = params.sceneDurationsSec.map((d) => Math.max(0.1, d));
    const sum = weights.reduce((a, b) => a + b, 0);
    const durations = weights.map((w) => (w / sum) * audioDuration);

    const segmentPaths: string[] = [];
    for (let i = 0; i < stillPaths.length; i++) {
      const seg = path.join(workDir, `seg-${i}.mp4`);
      execFileSync(
        "ffmpeg",
        [
          "-y",
          "-loop",
          "1",
          "-i",
          stillPaths[i],
          "-f",
          "lavfi",
          "-i",
          "anullsrc=channel_layout=stereo:sample_rate=44100",
          "-t",
          durations[i].toFixed(3),
          "-c:v",
          "libx264",
          "-tune",
          "stillimage",
          "-pix_fmt",
          "yuv420p",
          "-c:a",
          "aac",
          "-shortest",
          seg,
        ],
        { stdio: "pipe" },
      );
      segmentPaths.push(seg);
    }

    const listPath = path.join(workDir, "concat.txt");
    fs.writeFileSync(
      listPath,
      segmentPaths.map((p) => `file '${p.replace(/\\/g, "/")}'`).join("\n"),
    );

    const silentVideo = path.join(workDir, "silent.mp4");
    execFileSync(
      "ffmpeg",
      ["-y", "-f", "concat", "-safe", "0", "-i", listPath, "-c", "copy", silentVideo],
      { stdio: "pipe" },
    );

    const assPath = params.assContent
      ? path.join(workDir, "subs.ass")
      : null;
    if (assPath && params.assContent) {
      fs.writeFileSync(assPath, params.assContent, "utf8");
    }

    const outputPath = path.join(workDir, "output.mp4");
    // Escape for ffmpeg filter graphs on Windows (C:\… → C\:/…)
    const vf = assPath
      ? `ass='${assPath.replace(/\\/g, "/").replace(/:/g, "\\:")}'`
      : null;

    const args = [
      "-y",
      "-i",
      silentVideo,
      "-i",
      audioPath,
      ...(vf ? ["-vf", vf] : []),
      "-c:v",
      "libx264",
      "-preset",
      "medium",
      "-crf",
      "23",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-ar",
      "44100",
      "-ac",
      "2",
      "-b:a",
      "192k",
      "-map",
      "0:v:0",
      "-map",
      "1:a:0",
      "-t",
      audioDuration.toFixed(3),
      "-movflags",
      "+faststart",
      outputPath,
    ];

    execFileSync("ffmpeg", args, { stdio: "pipe", timeout: 300_000 });

    return {
      mp4: fs.readFileSync(outputPath),
      durationSec: audioDuration,
    };
  } finally {
    try {
      fs.rmSync(workDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  }
}
