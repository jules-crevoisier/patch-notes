function parseGeminiJson(text) {
  const cleaned = String(text || '')
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```$/i, '')
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

const base = $items('Assembler recap')[0].json;
const gemini = $input.first().json;
const post = { ...base.postBase };

if (!post.articles?.length) {
  post.title = base.fallbackTitle;
  post.summary = base.fallbackSummary;
  return [{ json: { secret: base.secret, post } }];
}

const text = gemini?.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join(' ').trim();
const parsed = parseGeminiJson(text);
if (parsed?.title || parsed?.summary) {
  const generatedTitle = String(parsed.title || base.fallbackTitle).trim();
  const withSlot = generatedTitle.startsWith(`${post.slot} - `) ? generatedTitle : `${post.slot} - ${generatedTitle}`;
  post.title = withSlot.includes(base.recapDate) ? withSlot : `${withSlot} - ${base.recapDate}`;
  post.summary = String(parsed.summary || base.fallbackSummary).trim();
} else if (gemini?.error?.message) {
  post.errors = [...(post.errors || []), `Gemini: ${gemini.error.message}`];
}

return [{ json: { secret: base.secret, post } }];
