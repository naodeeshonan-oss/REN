// /api/generate.js  — JSON方式（FormDataは使いません）

function cleanseKey(raw) {
  return (raw||"").replace(/^export\s+/i,"").replace(/^OPENAI_API_KEY\s*=\s*/i,"").trim();
}

function buildPrompt(basePrompt, options, isEdit){
  const lines = [basePrompt];

  const presets = {
    "anime-soft":"gentle anime style, soft lines, clean colors, subtle cel shading",
    "watercolor":"delicate watercolor style, soft edges, paper texture, light pastel tones",
    "pixar-soft":"pixar-like friendly vibe, soft lighting, round shapes, but subtle",
    "ghibli-soft":"ghibli-inspired warm tone, hand-painted feeling, but subtle"
  };
  if (options?.preset && presets[options.preset]) lines.push(presets[options.preset]);

  if (options?.lite)  lines.push("enhance aesthetics only by ~20%, keep it natural");
  if (options?.smile) lines.push("make expression a natural slight smile, not exaggerated");
  if (options?.clean) lines.push("gently improve skin and hair, avoid over-smoothing");

  if (isEdit && options?.lockFace !== false) {
    lines.push(
      "STRICT: preserve the subject's identity and likeness (>95%).",
      "Do not change face shape, age, gender, skin tone, or hairstyle length.",
      "No gender-swap, no age-shift, no different person."
    );
  }

  return lines.join("\n");
}

export default async function handler(req, res){
  if (req.method !== "POST") {
    return res.status(405).json({ error: "POST だけ受け付けます" });
  }

  try{
    // ここは JSON を想定（フロントが base64 で送ってくる）
    const { prompt, options = {}, image } = req.body || {};
    if (!prompt) return res.status(400).json({ error: "prompt を入れてください" });

    const apiKey = cleanseKey(process.env.OPENAI_API_KEY);
    if (!apiKey || !apiKey.startsWith("sk-")) {
      return res.status(500).json({ error: "OPENAI_API_KEY が未設定または不正です" });
    }

    const isEdit = !!image?.b64;
    const finalPrompt = buildPrompt(prompt, options, isEdit);

    if (isEdit) {
      // base64 → Blob
      const buf = Buffer.from(image.b64, "base64");
      const blob = new Blob([buf], { type: image.mime || "image/jpeg" });

      const formData = new FormData();
      formData.append("model","gpt-image-1");
      formData.append("prompt", finalPrompt);
      formData.append("image[]", blob, image.name || "upload.jpg");
      formData.append("size","1024x1024");
      formData.append("quality","high");

      const r = await fetch("https://api.openai.com/v1/images/edits", {
        method: "POST",
        headers: { "Authorization": `Bearer ${apiKey}` },
        body: formData
      });
      const data = await r.json().catch(()=> ({}));
      if (!r.ok) return res.status(r.status).json({ error: data?.error?.message || "OpenAI 編集APIエラー" });

      const item = data?.data?.[0] || {};
      const imageUrl = item.url || (item.b64_json ? `data:image/png;base64,${item.b64_json}` : null);
      if (!imageUrl) return res.status(500).json({ error: "画像データがありません" });

      return res.status(200).json({ image: imageUrl });
    } else {
      const r = await fetch("https://api.openai.com/v1/images/generations", {
        method: "POST",
        headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type":"application/json" },
        body: JSON.stringify({
          model: "gpt-image-1",
          prompt: finalPrompt,
          size: "1024x1024",
          quality: "high"
        })
      });
      const data = await r.json().catch(()=> ({}));
      if (!r.ok) return res.status(r.status).json({ error: data?.error?.message || "OpenAI 生成APIエラー" });

      const item = data?.data?.[0] || {};
      const imageUrl = item.url || (item.b64_json ? `data:image/png;base64,${item.b64_json}` : null);
      if (!imageUrl) return res.status(500).json({ error: "画像データがありません" });

      return res.status(200).json({ image: imageUrl });
    }
  }catch(err){
    return res.status(500).json({ error: String(err?.message || err) });
  }
}
