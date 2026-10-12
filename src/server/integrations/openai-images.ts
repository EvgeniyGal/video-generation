import OpenAI from "openai";
import { toFile } from "openai";

export async function generatePortraitImage(params: {
  apiKey: string;
  model: string;
  prompt: string;
}): Promise<Buffer> {
  const client = new OpenAI({ apiKey: params.apiKey });
  const result = await client.images.generate({
    model: params.model,
    prompt: params.prompt,
    size: "1024x1536",
    n: 1,
  });

  const item = result.data?.[0];
  if (!item) throw new Error("OpenAI image generation returned no data");

  if (item.b64_json) {
    return Buffer.from(item.b64_json, "base64");
  }
  if (item.url) {
    const res = await fetch(item.url);
    if (!res.ok) {
      throw new Error(`Failed to download generated image (${res.status})`);
    }
    return Buffer.from(await res.arrayBuffer());
  }
  throw new Error("OpenAI image generation returned neither b64 nor url");
}

export async function editPortraitImageFromReference(params: {
  apiKey: string;
  model: string;
  prompt: string;
  referencePng: Buffer;
}): Promise<Buffer> {
  const client = new OpenAI({ apiKey: params.apiKey });
  const imageFile = await toFile(params.referencePng, "reference.png", {
    type: "image/png",
  });

  const result = await client.images.edit({
    model: params.model,
    image: imageFile,
    prompt: params.prompt,
    size: "1024x1536",
    n: 1,
  });

  const item = result.data?.[0];
  if (!item) throw new Error("OpenAI image edit returned no data");

  if (item.b64_json) {
    return Buffer.from(item.b64_json, "base64");
  }
  if (item.url) {
    const res = await fetch(item.url);
    if (!res.ok) {
      throw new Error(`Failed to download edited image (${res.status})`);
    }
    return Buffer.from(await res.arrayBuffer());
  }
  throw new Error("OpenAI image edit returned neither b64 nor url");
}
