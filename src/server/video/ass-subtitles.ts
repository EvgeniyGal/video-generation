import type { ElevenLabsWord } from "@/server/integrations/elevenlabs";

const WINDOW_SIZE = 3;

function toASS(t: number): string {
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = t % 60;
  const ss = s.toFixed(2).padStart(5, "0");
  return `${h}:${String(m).padStart(2, "0")}:${ss}`;
}

/** Build karaoke ASS (n8n script1 style): yellow highlight, 3-word windows. */
export function buildKaraokeAss(wordsInput: ElevenLabsWord[]): string {
  const words = wordsInput.filter((w) => w.type === "word" && w.text?.trim());

  const header = `[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920

[V4+ Styles]
Format: Name,Fontname,Fontsize,PrimaryColour,SecondaryColour,OutlineColour,BackColour,Bold,Italic,Underline,Strikeout,ScaleX,ScaleY,Spacing,Angle,BorderStyle,Outline,Shadow,Alignment,MarginL,MarginR,MarginV,Encoding
Style: Default,Arial,90,&H0000FFFF,&H00FFFFFF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,4,2,2,60,60,150,1

[Events]
Format: Layer,Start,End,Style,Name,MarginL,MarginR,MarginV,Effect,Text
`;

  let events = "";
  for (let i = 0; i < words.length; i += WINDOW_SIZE) {
    const chunk = words.slice(i, i + WINDOW_SIZE);
    const lineStart = chunk[0].start;
    const lineEnd = chunk[chunk.length - 1].end;

    let lineText = "";
    chunk.forEach((w, index) => {
      const duration = Math.max(1, Math.round((w.end - w.start) * 100));
      if (index > 0) {
        const gap = Math.round((w.start - chunk[index - 1].end) * 100);
        if (gap > 0) {
          lineText += `{\\k${gap}} `;
        } else {
          lineText += " ";
        }
      }
      lineText += `{\\k${duration}}${w.text}`;
    });

    events += `Dialogue: 0,${toASS(lineStart)},${toASS(lineEnd)},Default,,0,0,0,,${lineText.trim()}\n`;
  }

  return header + events;
}
