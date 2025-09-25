// /api/generate.js — likeness-first & no-crop presets (1 image fixed)
export const config = { api: { bodyParser: true } }; // JSON 受け取り

function cleanseKey(raw) {
  return (raw || "")
    .replace(/^export\s+/i, "")
    .replace(/^OPENAI_API_KEY\s*=\s*/i, "")
    .trim();
}

/* ────────────────────────────────────────────────
   options.preset: "chibi" | "mature" | "pop"
   options.extra:  追記テキスト
   options.tone:   { brighten:boolean, mood:boolean }
   出力: 1枚固定 (n:1)
──────────────────────────────────────────────── */

const COMMON_LIKENESS = [
  "STRICT likeness priority: >95% identity match to the photo.",
  "Preserve face shape, eyes, eyebrows, nose (visible nose bridge), mouth, hairstyle length/color, skin tone, and clothing.",
  "No gender swap, no age shift, no changing facial proportions.",
].join(" ");

const COMMON_COMPOSITION = [
  "Full body fully inside the frame; no cropping of head, hands, arms, or feet.",
  "Balanced centered composition, with safe margins around the body.",
].join(" ");

const COMMON_ANTI_REALISM = [
  "Appealing anime rendering with clean shapes and cel shading.",
  "Avoid photorealistic pores, gritty textures, or heavy airbrush gloss.",
  "Natural cheerful expression; avoid exaggerated blush or makeup.",
].join(" ");

const NEGATIVE = [
  "cropped, cut off hands, cut off feet, missing fingers, extra fingers, fused fingers, deformed hands",
  "blurry, lowres, jpeg artifacts, oversharpen, distortion",
  "photorealistic pores, gritty skin, harsh wrinkles, heavy blush, oily shine",
  "text, watermark, signature, logo",
  "overexposed highlights, extreme contrast",
].join(", ");

const PRESET_TEXT = {
  // ① かわいい・ちびキャラ風
  chibi: [
    "A 2D cute chibi illustration. Large head, small body, rounded friendly features.",
    "Anime-style bold outlines, flat bright coloring, cheerful mood.",
    "Simple white background.",
    COMMON_LIKENESS,
    COMMON_COMPOSITION,
    COMMON_ANTI_REALISM,
  ].join(" "),

  // ② 大人っぽいアニメ調
  mature: [
    "A 2D anime-style illustration with semi-realistic proportions and a clean, mature atmosphere.",
    "Soft neat cel shading, simple clean coloring, simple white background.",
    "Draw a clear small nose with a subtle bridge; do not omit the nose.",
    COMMON_LIKENESS,
    COMMON_COMPOSITION,
    COMMON_ANTI_REALISM,
  ].join(" "),

  // ③ カジュアル／ポップ・ストリート風
  pop: [
    "A 2D anime/manga casual pop style with a slight street vibe.",
    "Standard proportions (not chibi), bold clean lines, vivid balanced high-contrast colors.",
    "Simple white background.",
    "Keep an attractive idealized look; avoid over-processed painterly textures.",
    COMMON_LIKENESS,
    COMMON_COMPOSITION,
    COMMON_ANTI_REALISM,
  ].join(" "),
};

function buildPrompt({ preset = "chibi", extra = "", tone = {} } = {}) {
  const base = PRESET_TEXT[preset] || PRESET_TEXT.chibi;
  const lines = [base];

  if (extra && typeof extra === "string") lines.push(extra.trim());
  if (tone?.brighten) lines.push("Slightly brighten overall exposure.");
  if (tone?.mood) lines.push("Slightly enhance mood (+20%), still natural.");

  // ネガティブ
  lines.push(`Negative prompt: ${NEGATIVE}`);

  return lines.join("\n");
}

export default async function handler(req, res) {
  if (req.method !== "POST")
    return res.status(405).json({ error: "POST のみ" });

  try {
    const { options = {}, prompt: extra = "" } = req.body || {};
    if (!options?.preset)
      return res.status(400).json({ error: "preset を指定してください（chibi|mature|pop）" });

    const apiKey = cleanseKey(process.env.OPENAI_API_KEY);
    if (!apiKey || !apiKey.startsWith("sk-"))
      return res.status(500).json({ error: "OPENAI_API_KEY が未設定または不正です" });

    const size = typeof options.size === "string" ? options.size : "1024x1024";
    const finalPrompt = buildPrompt({
      preset: String(options.preset || "chibi"),
      extra: String(extra || ""),
      tone: {
        brighten: !!options.brightnessUp,
        mood: !!options.moodBoost,
      },
    });

    const r = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-image-1",
        prompt: finalPrompt,
        size,
        quality: "low",
        n: 1, // 1枚固定
      }),
    });

    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      if (r.status === 413) {
        return res.status(413).json({
          error:
            "413 Payload Too Large（画像や本文が大きすぎます）。アップロード側で最大辺1024px / 400KB以下に圧縮してください。",
        });
      }
      return res
        .status(r.status)
        .json({ error: data?.error?.message || "OpenAI 生成APIエラー" });
    }

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
