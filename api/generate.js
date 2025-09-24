// /api/generate.js
export const config = { api: { bodyParser: true } };

function cleanseKey(raw) {
  return (raw || "")
    .replace(/^export\s+/i, "")
    .replace(/^OPENAI_API_KEY\s*=\s*/i, "")
    .trim();
}

// 3スタイルの「そっくり優先」ベース文 + ネガティブ
const STYLE_PROMPTS = {
  chibi: [
    "A 2D digital illustration in cute chibi style.",
    "Large heads, small bodies, rounded features, friendly cartoon look.",
    "Anime-style bold clean outlines, flat bright coloring, cheerful vibe.",
    "Simple white background.",
    "STRICT LIKENESS: faithfully reflect the photo’s hairstyle, hair color, eyes, eyebrows, nose, mouth shape, skin tone, clothing and general vibe.",
    "Do not change age, gender or ethnicity. Keep the person recognizable (>95%)."
  ].join("\n"),
  mature: [
    "A 2D anime-style illustration with semi-realistic look and natural proportions.",
    "Soft shading, clean neat coloring, calm mature atmosphere.",
    "White background.",
    "STRICT LIKENESS: preserve real facial geometry and hairstyle; keep clothing and accessories consistent with the photo; keep age and gender unchanged; recognizable (>95%)."
  ].join("\n"),
  street: [
    "A 2D anime/manga style illustration with casual pop street vibe.",
    "Standard proportions (not chibi). Bold clean outlines, vivid high-contrast colors.",
    "White background.",
    "If suitable, casual items like cap/T-shirt are OK; keep cheerful expressions.",
    "STRICT LIKENESS: keep the same face, hair, skin tone and outfit mood from the photo; do not turn into a different person; recognizable (>95%)."
  ].join("\n"),
};

// 画づまり防止のネガティブ
const NEGATIVE_PROMPT = [
  "blurry, out of focus, low resolution, jpeg artifacts",
  "deformed, disfigured, extra fingers, missing limbs, bad anatomy, asymmetry",
  "distorted face, off-model, mutated, glitched, watermark, text, logo, nsfw",
  "cropped head, cut-off hands, double head, double face"
].join(", ");

function buildPrompt(style, extra="", opt={}){
  const base = STYLE_PROMPTS[style] || STYLE_PROMPTS.chibi;
  const assists = [];
  if (opt.brightnessUp) assists.push("slightly brighten the overall exposure.");
  if (opt.moodBoost) assists.push("enhance mood by about 20%, keep it natural.");
  return [
    base,
    extra ? `Extra instruction: ${extra}` : "",
    assists.join(" ")
  ].filter(Boolean).join("\n");
}

// dataURL → Blob
function dataUrlToBlob(dataUrl) {
  const m = /^data:(.*?);base64,(.*)$/i.exec(dataUrl || "");
  if (!m) throw new Error("invalid data URL");
  const mime = m[1] || "image/jpeg";
  const buf = Buffer.from(m[2], "base64");
  return new Blob([buf], { type: mime });
}

export default async function handler(req, res){
  if (req.method !== "POST")
    return res.status(405).json({ error: "POST のみ" });

  try{
    const { imageDataUrl, options } = req.body || {};
    if (!imageDataUrl) return res.status(400).json({ error: "imageDataUrl がありません（写真1枚必須）" });

    const apiKey = cleanseKey(process.env.OPENAI_API_KEY);
    if (!apiKey || !apiKey.startsWith("sk-"))
      return res.status(500).json({ error: "OPENAI_API_KEY が未設定または不正です" });

    const style = (options?.style || "chibi").toLowerCase();
    const extra = (options?.extra || "").trim();
    const finalPrompt = [
      buildPrompt(style, extra, options||{}),
      `Negative prompt: ${NEGATIVE_PROMPT}`
    ].join("\n\n");

    // 1枚ずつ・1024固定・quality:low でコスト抑制＆安定
    const fileBlob = dataUrlToBlob(imageDataUrl);
    const form = new FormData();
    form.append("model", "gpt-image-1");
    form.append("prompt", finalPrompt);
    form.append("image[]", fileBlob, "image.jpg");
    form.append("size", "1024x1024");
    form.append("quality", "low");
    form.append("n", "1");

    const r = await fetch("https://api.openai.com/v1/images/edits", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    });

    const data = await r.json().catch(()=> ({}));
    if(!r.ok){
      const msg = data?.error?.message || "OpenAI 画像APIエラー";
      return res.status(r.status).json({ error: msg });
    }

    const item = data?.data?.[0] || {};
    const image = item.url || (item.b64_json ? `data:image/png;base64,${item.b64_json}` : null);
    if(!image) return res.status(500).json({ error: "画像データがありません" });

    return res.status(200).json({ image });
  }catch(err){
    return res.status(500).json({ error: String(err?.message || err) });
  }
}
