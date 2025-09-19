// /api/generate.js
export const config = { api: { bodyParser: true } }; // JSON受け取り用

function cleanseKey(raw) {
  return (raw || "")
    .replace(/^export\s+/i, "")
    .replace(/^OPENAI_API_KEY\s*=\s*/i, "")
    .trim();
}

function buildPrompt(basePrompt, options = {}, isEdit) {
  const lines = [];
  lines.push(basePrompt); // ベースはそのまま

  // --- 作風プリセット（選ばれた時だけ足す） ---
  const preset = options.preset || "";
  const presets = {
    watercolor: "watercolor painting style, delicate washes, paper texture, soft edges, pastel tones",
    disney: "Disney-like friendly illustration, soft lighting, expressive but natural facial features (not exaggerated)",
    ghibli: "Ghibli-inspired warm tone, hand-painted background, gentle colors, cinematic yet natural",
    anime: "anime line-art style with clean outlines and light cel shading, natural proportions",
    simple: "simple character style, rounded shapes, limited clean colors, flat shading",
  };
  if (preset && presets[preset]) lines.push(presets[preset]);

  // --- 補助オプション（チェックされた時だけ足す） ---
  if (options.bgTransparent) lines.push("background: transparent (PNG alpha)");
  if (options.bgPreset) lines.push(`background: ${options.bgPreset}`);
  if (options.brightnessUp) lines.push("slightly brighten the overall exposure");
  if (options.moodBoost) lines.push("enhance mood by about 20%, keep it natural");

  // 編集モード時は“本人らしさ”を守る
  if (isEdit) {
    lines.push(
      "STRICT: preserve the subject's identity and likeness (>95%).",
      "Do not change face shape, age, gender, skin tone, eye/eyebrow/nose shape, or hairstyle length.",
      "No gender-swap, no age-shift, no turning into a different person."
    );
  }

  return lines.join("\n");
}

// data:image/png;base64,... → Blob（Node18+）
function dataUrlToBlob(dataUrl) {
  const m = /^data:(.*?);base64,(.*)$/i.exec(dataUrl || "");
  if (!m) throw new Error("invalid data URL");
  const mime = m[1] || "image/png";
  const buf = Buffer.from(m[2], "base64");
  return new Blob([buf], { type: mime });
}

export default async function handler(req, res) {
  if (req.method !== "POST")
    return res.status(405).json({ error: "POST だけ受け付けます" });

  try {
    const { prompt, imageDataUrl, options } = req.body || {};
    if (!prompt || typeof prompt !== "string")
      return res.status(400).json({ error: "prompt を入れてください" });

    const apiKey = cleanseKey(process.env.OPENAI_API_KEY);
    if (!apiKey || !apiKey.startsWith("sk-"))
      return res
        .status(500)
        .json({ error: "OPENAI_API_KEY が未設定または不正です" });

    const isEdit = !!imageDataUrl;
    const finalPrompt = buildPrompt(prompt, options, isEdit);

    // 画像編集（画像あり）
    if (isEdit) {
      const fileBlob = dataUrlToBlob(imageDataUrl);
      const form = new FormData();
      form.append("model", "gpt-image-1");
      form.append("prompt", finalPrompt);
      form.append("image[]", fileBlob, "image.png");
      form.append("size", "1024x1024");   // ← ここを 1024 固定
      form.append("quality", "low");      // ← ここを low 固定

      const r = await fetch("https://api.openai.com/v1/images/edits", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}` },
        body: form,
      });

      const data = await r.json().catch(() => ({}));
      if (!r.ok)
        return res
          .status(r.status)
          .json({ error: data?.error?.message || "OpenAI 編集APIエラー" });

      const item = data?.data?.[0] || {};
      const image =
        item.url ||
        (item.b64_json ? `data:image/png;base64,${item.b64_json}` : null);
      if (!image) return res.status(500).json({ error: "画像データがありません" });
      return res.status(200).json({ image });
    }

    // 新規生成（画像なし）
    const r = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-image-1",
        prompt: finalPrompt,
        size: "1024x1024",   // ← ここを 1024 固定
        quality: "low",      // ← ここを low 固定
      }),
    });

    const data = await r.json().catch(() => ({}));
    if (!r.ok)
      return res
        .status(r.status)
        .json({ error: data?.error?.message || "OpenAI 生成APIエラー" });

    const item = data?.data?.[0] || {};
    const image =
      item.url ||
      (item.b64_json ? `data:image/png;base64,${item.b64_json}` : null);
    if (!image) return res.status(500).json({ error: "画像データがありません" });
    return res.status(200).json({ image });
  } catch (err) {
    return res.status(500).json({ error: String(err?.message || err) });
  }
}
