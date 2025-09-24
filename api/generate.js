// /api/generate.js  — 3プリセット版（画像編集なし／新規生成のみ）
export const config = { api: { bodyParser: true } };

function cleanseKey(raw) {
  return (raw || "")
    .replace(/^export\s+/i, "")
    .replace(/^OPENAI_API_KEY\s*=\s*/i, "")
    .trim();
}

// 3プリセット本文（日本語＋英語）
// UI側の options.preset は "chibi" | "mature" | "street" を送ってください
const PRESET_TEXT = {
  chibi: `2Dのちびキャラクタースタイルのイラスト。
頭が大きめでデフォルメ、かわいく親しみやすい雰囲気。
アニメ調の太めの線、明るい色使い、フラットな彩色。
背景は白。
人物は写真の特徴（髪型・服装・雰囲気）を反映。
孫とおじいちゃん、夫婦、親子、友達など、どんな組み合わせでも可能。

English:
A 2D digital illustration in cute chibi style.
Characters have large heads, small bodies, rounded features, and a friendly cartoonish look.
Anime-style bold outlines, flat bright coloring, cheerful atmosphere.
Simple white background.
Reflect the photo’s features (hairstyle, clothing, vibe).
Works for any combination: grandparents and grandchildren, couples, friends, parents and kids, etc.`,

  mature: `2Dのアニメ風イラスト。
リアル寄りのアニメ調、自然な頭身で落ち着いた大人の雰囲気。
柔らかい陰影、シンプルで清潔感ある彩色。
背景は白。
人物は写真の特徴を反映、家族・夫婦・友人など幅広く対応。

English:
A 2D anime-style digital illustration.
Semi-realistic anime look with natural proportions and a mature, clean atmosphere.
Soft shading, simple and neat coloring.
White background.
Reflects the photo’s features, suitable for couples, family members, friends, or any age group.`,

  street: `2Dのアニメ／マンガ風イラスト。
カジュアルでポップ、ヒップホップやストリート感のある雰囲気。
標準的な頭身（ちびキャラではない）。
男性はキャップやTシャツ、女性は明るい表情など、元気で楽しい印象。
太めでクリーンな線、コントラスト強めの彩色。
背景は白。

English:
A 2D anime/manga style illustration.
Casual and pop atmosphere with a slight hip-hop/street vibe.
Standard proportions (not chibi).
Male character can wear a cap and T-shirt, female character has a bright cheerful expression.
Bold clean outlines, vivid and high-contrast colors for a fun energetic look.
Simple white background.
Works for any combination: friends, couples, grandparents and grandchildren, or parent and child.`,
};

// プロンプト組み立て
function buildPrompt(userPrompt = "", options = {}) {
  const lines = [];

  // プリセット（必須想定。無指定なら userPrompt のみで実行）
  const p = (options.preset || "").toLowerCase();
  if (PRESET_TEXT[p]) lines.push(PRESET_TEXT[p]);

  // 追記テキスト（任意）— UIの自由入力欄をそのまま足したいとき用
  if (userPrompt && typeof userPrompt === "string") lines.push(userPrompt.trim());

  // 補助オプション
  if (options.bgTransparent) lines.push("background: transparent (PNG alpha)");
  if (options.bgPreset) lines.push(`background: ${options.bgPreset}`);
  if (options.brightnessUp) lines.push("slightly brighten the overall exposure");
  if (options.moodBoost) lines.push("enhance mood by about 20%, keep it natural");

  return lines.join("\n");
}

export default async function handler(req, res) {
  if (req.method !== "POST")
    return res.status(405).json({ error: "POST だけ受け付けます" });

  try {
    const { prompt = "", options = {} } = req.body || {};

    // プリセットも自由入力も空ならエラー
    if (!options?.preset && !prompt)
      return res.status(400).json({ error: "preset か prompt のどちらかを入れてください" });

    const apiKey = cleanseKey(process.env.OPENAI_API_KEY);
    if (!apiKey || !apiKey.startsWith("sk-"))
      return res.status(500).json({ error: "OPENAI_API_KEY が未設定または不正です" });

    const finalPrompt = buildPrompt(prompt, options);

    // 新規生成（1024固定／low固定）
    const r = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-image-1",
        prompt: finalPrompt,
        size: "1024x1024",
        quality: "low",
        n: 1,
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
