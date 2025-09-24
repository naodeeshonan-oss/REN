// /api/generate.js — FINAL
export const config = { api: { bodyParser: true } };

function cleanseKey(raw) {
  return (raw || "")
    .replace(/^export\s+/i, "")
    .replace(/^OPENAI_API_KEY\s*=\s*/i, "")
    .trim();
}

// dataURL -> Blob
function dataUrlToBlob(dataUrl) {
  const m = /^data:(.*?);base64,(.*)$/i.exec(dataUrl || "");
  if (!m) throw new Error("invalid data URL");
  const mime = m[1] || "image/png";
  const buf = Buffer.from(m[2], "base64");
  return new Blob([buf], { type: mime });
}

// 作風プリセット
const PRESETS = {
  chibi: `
[STYLE]
- Cute chibi style (大きな頭・小さな体・親しみやすい表情)
- Bold & clean outlines, flat bright colors, limited palette
- Simple white background or very minimal backdrop

[CONTENT]
- Use the uploaded photo as the ground truth
- Reflect hairstyle, clothing, expression, and overall vibe accurately
- Keep a cheerful, friendly atmosphere

[RENDER RULES]
- Clean line art, no messy lines
- Clear silhouettes
`,
  mature: `
[STYLE]
- Semi-realistic anime style, natural proportions, mature & clean mood
- Soft shading, neat & simple coloring, crisp line art
- White background or minimal backdrop

[CONTENT]
- Use the uploaded photo as the ground truth
- Accurately reflect hairstyle, clothing, expression, and vibe
- Calm, warm impression

[RENDER RULES]
- Clean anatomy, natural facial features
- Avoid excessive stylization that changes identity
`,
  street: `
[STYLE]
- Casual anime/manga with a slight hip-hop/street vibe
- Bold sharp outlines, vivid high-contrast colors
- White or minimal background, energetic mood

[CONTENT]
- Use the uploaded photo as the ground truth
- Reflect hairstyle, clothing, expression, and vibe accurately
- Standard proportions (not chibi)

[RENDER RULES]
- Strong contrast but clean
- Fun, lively impression without losing likeness
`,
};
const PRESET_ALIASES = { "1":"chibi","2":"mature","3":"street" };

// ネガティブ（必須）
const NEGATIVE_BLOCK = `
[AVOID / NEGATIVE]
- generic cartoon face, averaged features, off-model
- wrong face, inaccurate likeness, identity change
- wrong hair color/length, wrong clothing, age/gender change
- distorted anatomy, extra/missing fingers/limbs, messy lines
- blurry, low-quality, JPEG artifacts, background clutter
- over-detailed 3D realism; keep 2D clean anime aesthetics
`;

// img2img時の「そっくり優先」
const LIKENESS_STRICT = `
[STRICT LIKENESS]
- Preserve the subject's identity and likeness (>95%)
- Follow the photo closely for facial features, hairstyle, clothing
- Do NOT change face shape, age, gender, skin tone, or hair length
- Do NOT alter eye/eyebrow/nose/mouth shapes
- No gender-swap, no age-shift, no turning into a different person
`;

function buildAux(options = {}) {
  const aux = [];
  if (options.bgTransparent) aux.push("background: transparent (PNG alpha)");
  if (options.bgPreset) aux.push(`background: ${options.bgPreset}`);
  if (options.brightnessUp) aux.push("slightly brighten the overall exposure");
  if (options.moodBoost) aux.push("enhance mood by ~20% but keep natural");
  return aux.join("\n");
}

function buildPrompt({ userPrompt = "", preset = "", isEdit = false, options = {} }) {
  const lines = [];
  const key = PRESET_ALIASES[preset?.toString()] || preset?.toString();
  if (key && PRESETS[key]) lines.push(PRESETS[key].trim());
  if (userPrompt) lines.push(String(userPrompt).trim());
  const aux = buildAux(options); if (aux) lines.push(aux);
  if (isEdit) lines.push(LIKENESS_STRICT.trim());       // 画像あり＝そっくり優先
  lines.push(NEGATIVE_BLOCK.trim());                    // ネガティブは必須
  return lines.join("\n\n");
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST のみ" });

  try {
    const { prompt: userPrompt = "", options = {}, imageDataUrl, preset } = req.body || {};
    if (!preset && !userPrompt)
      return res.status(400).json({ error: "preset か prompt のどちらかを入れてください" });

    const apiKey = cleanseKey(process.env.OPENAI_API_KEY);
    if (!apiKey || !apiKey.startsWith("sk-"))
      return res.status(500).json({ error: "OPENAI_API_KEY が未設定または不正です" });

    const isEdit = !!imageDataUrl;
    const finalPrompt = buildPrompt({ userPrompt, preset, isEdit, options });

    // 安定の 1枚固定
    const n = 1, size = "1024x1024", quality = "low";

    if (isEdit) {
      const form = new FormData();
      form.append("model", "gpt-image-1");
      form.append("prompt", finalPrompt);
      form.append("image[]", dataUrlToBlob(imageDataUrl), "image.jpg");
      form.append("size", size);
      form.append("quality", quality);
      form.append("n", String(n));

      const r = await fetch("https://api.openai.com/v1/images/edits", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}` },
        body: form,
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) return res.status(r.status).json({ error: data?.error?.message || "OpenAI 編集APIエラー" });

      const item = data?.data?.[0];
      const image = item?.url || (item?.b64_json ? `data:image/png;base64,${item.b64_json}` : null);
      if (!image) return res.status(500).json({ error: "画像データがありません" });
      return res.status(200).json({ image });
    }

    // 新規生成
    const r = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "gpt-image-1", prompt: finalPrompt, size, quality, n }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) return res.status(r.status).json({ error: data?.error?.message || "OpenAI 生成APIエラー" });

    const item = data?.data?.[0];
    const image = item?.url || (item?.b64_json ? `data:image/png;base64,${item.b64_json}` : null);
    if (!image) return res.status(500).json({ error: "画像データがありません" });
    return res.status(200).json({ image });
  } catch (err) {
    return res.status(500).json({ error: String(err?.message || err) });
  }
}
