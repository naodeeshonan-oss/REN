// /api/generate.js  — txt2img / img2img 両対応、n自動上限、1024固定・low固定
export const config = { api: { bodyParser: true } };

function cleanseKey(raw) {
  return (raw || "").replace(/^export\s+/i, "").replace(/^OPENAI_API_KEY\s*=\s*/i, "").trim();
}

const PRESET_TEXT = {
  chibi: `2Dのちびキャラクタースタイルのイラスト。
頭が大きめでデフォルメ、かわいく親しみやすい雰囲気。
アニメ調の太めの線、明るい色使い、フラットな彩色。背景は白。
English: cute chibi style, big head small body, bold outlines, flat bright colors, white background.`,
  mature: `2Dのアニメ風イラスト。自然な頭身で落ち着いた雰囲気。柔らかい陰影、清潔感ある彩色、白背景。
English: semi-realistic anime, natural proportions, soft shading, clean coloring, white background.`,
  street: `2Dのアニメ／マンガ風。カジュアルでポップ、ストリート感。太めの線、コントラスト強め、白背景。
English: anime/manga with casual street vibe, bold clean outlines, vivid high-contrast colors, white background.`
};

function buildPrompt(userPrompt = "", options = {}) {
  const lines = [];
  const p = (options.preset || "").toLowerCase();
  if (PRESET_TEXT[p]) lines.push(PRESET_TEXT[p]);

  if (userPrompt) lines.push(String(userPrompt).trim());

  if (options.bgTransparent) lines.push("background: transparent (PNG alpha)");
  if (options.bgPreset) lines.push(`background: ${options.bgPreset}`);
  if (options.brightnessUp) lines.push("slightly brighten the overall exposure");
  if (options.moodBoost) lines.push("enhance mood by about 20%, keep it natural");

  return lines.join("\n");
}

function dataUrlToBlob(dataUrl) {
  const m = /^data:(.*?);base64,(.*)$/i.exec(dataUrl || "");
  if (!m) throw new Error("invalid data URL");
  const mime = m[1] || "image/png";
  const buf = Buffer.from(m[2], "base64");
  return new Blob([buf], { type: mime });
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POSTのみ" });

  try {
    const { prompt = "", imageDataUrl, options = {} } = req.body || {};

    const apiKey = cleanseKey(process.env.OPENAI_API_KEY);
    if (!apiKey?.startsWith("sk-")) return res.status(500).json({ error: "OPENAI_API_KEY 未設定" });

    const finalPrompt = buildPrompt(prompt, options);
    const requestedN = Number(options.n || 1);
    const maxN = imageDataUrl ? 5 : 8; // img2imgは「入力画像/分=5」制限
    const n = Math.min(Math.max(requestedN, 1), maxN);

    // 画像あり -> edits (img2img)
    if (imageDataUrl) {
      const form = new FormData();
      form.append("model", "gpt-image-1");
      form.append("prompt", finalPrompt);
      form.append("image[]", dataUrlToBlob(imageDataUrl), "image.png");
      form.append("size", "1024x1024");
      form.append("quality", "low");
      form.append("n", String(n));

      const r = await fetch("https://api.openai.com/v1/images/edits", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}` },
        body: form,
      });

      const data = await r.json().catch(() => ({}));
      if (!r.ok) return res.status(r.status).json({ error: data?.error?.message || "OpenAI 編集APIエラー" });

      const images = (data?.data || [])
        .map(it => it.url || (it.b64_json ? `data:image/png;base64,${it.b64_json}` : null))
        .filter(Boolean);

      return res.status(200).json({ images });
    }

    // 画像なし -> generations (txt2img)
    const r = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "gpt-image-1", prompt: finalPrompt, size: "1024x1024", quality: "low", n })
    });

    const data = await r.json().catch(() => ({}));
    if (!r.ok) return res.status(r.status).json({ error: data?.error?.message || "OpenAI 生成APIエラー" });

    const images = (data?.data || [])
      .map(it => it.url || (it.b64_json ? `data:image/png;base64,${it.b64_json}` : null))
      .filter(Boolean);

    return res.status(200).json({ images });
  } catch (e) {
    return res.status(500).json({ error: String(e?.message || e) });
  }
}
