// /api/generate.js
export const config = { api: { bodyParser: false } };

function cleanseKey(raw) {
  return (raw||"").replace(/^export\s+/i,"").replace(/^OPENAI_API_KEY\s*=\s*/i,"").trim();
}

function buildPrompt(basePrompt, options, isEdit){
  const lines = [];
  lines.push(basePrompt);

  const p = options?.preset || "";
  const presets = {
    "anime-soft":"gentle anime style, soft lines, clean colors, subtle cel shading",
    "watercolor":"delicate watercolor style, soft edges, paper texture, light pastel tones",
    "pixar-soft":"pixar-like friendly vibe, soft lighting, round shapes, but subtle",
    "ghibli-soft":"ghibli-inspired warm tone, hand-painted feeling, but subtle"
  };
  if (p && presets[p]) lines.push(presets[p]);

  if (options?.lite)  lines.push("enhance aesthetics only by ~20%, keep it natural");
  if (options?.smile) lines.push("make expression a natural slight smile, not exaggerated");
  if (options?.clean) lines.push("gently improve skin and hair, avoid over-smoothing");

  if (isEdit && options?.lockFace !== false) {
    lines.push(
      "STRICT: preserve the subject's identity and likeness (>95%).",
      "Do not change face shape, age, gender, skin tone, eye shape, nose, or hairstyle length.",
      "No gender-swap, no age-shift, no different person."
    );
  }

  if (options?.strongStyle) {
    lines.push("You may push style slightly stronger, but still keep identity recognizable.");
  }

  return lines.join("\n");
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "POST だけ受け付けます" });
  }

  try {
    const form = await req.formData();
    const prompt = form.get("prompt") || "";
    const options = JSON.parse(form.get("options") || "{}");
    const file = form.get("image");

    if (!prompt) return res.status(400).json({ error: "prompt を入れてください" });

    const apiKey = cleanseKey(process.env.OPENAI_API_KEY);
    if (!apiKey || !apiKey.startsWith("sk-")) {
      return res.status(500).json({ error: "OPENAI_API_KEY が未設定または不正です" });
    }

    const isEdit = !!file;
    const finalPrompt = buildPrompt(prompt, options, isEdit);

    if (isEdit) {
      const formData = new FormData();
      formData.append("model","gpt-image-1");
      formData.append("prompt", finalPrompt);
      formData.append("image[]", file, file.name || "image.jpg");
      formData.append("size","512x512");   // ← 固定
      formData.append("quality","standard");

      const r = await fetch("https://api.openai.com/v1/images/edits", {
        method: "POST",
        headers: { "Authorization": `Bearer ${apiKey}` },
        body: formData
      });
      const data = await r.json().catch(()=> ({}));
      if (!r.ok) return res.status(r.status).json({ error: data?.error?.message || "OpenAI 編集APIエラー" });

      const item = data?.data?.[0] || {};
      const image = item.url || (item.b64_json ? `data:image/png;base64,${item.b64_json}` : null);
      if (!image) return res.status(500).json({ error: "画像データがありません" });
      return res.status(200).json({ image });
    } else {
      const r = await fetch("https://api.openai.com/v1/images/generations", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: "gpt-image-1",
          prompt: finalPrompt,
          size: "512x512",   // ← 固定
          quality: "standard"
        })
      });
      const data = await r.json().catch(()=> ({}));
      if (!r.ok) return res.status(r.status).json({ error: data?.error?.message || "OpenAI 生成APIエラー" });

      const item = data?.data?.[0] || {};
      const image = item.url || (item.b64_json ? `data:image/png;base64,${item.b64_json}` : null);
      if (!image) return res.status(500).json({ error: "画像データがありません" });
      return res.status(200).json({ image });
    }
  } catch (err) {
    return res.status(500).json({ error: String(err?.message || err) });
  }
}
