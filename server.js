import http from 'node:http';

const port = process.env.PORT || 10000;
const apiKey = process.env.GEMINI_API_KEY;
const model = process.env.GEMINI_MODEL || 'gemini-2.0-flash-preview-image-generation';

function json(res, status, payload) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end(JSON.stringify(payload));
}

async function readBody(req) {
  let body = '';
  for await (const chunk of req) body += chunk;
  return body ? JSON.parse(body) : {};
}

async function generateImage(prompt) {
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseModalities: ['TEXT', 'IMAGE'] },
    }),
  });

  const text = await response.text();
  if (!response.ok) throw new Error(`Gemini ${response.status}: ${text}`);

  const parsed = JSON.parse(text);
  const parts = parsed.candidates?.[0]?.content?.parts || [];
  const imagePart = parts.find(part => part.inlineData?.data);
  if (!imagePart) throw new Error(`No image returned: ${text}`);

  return {
    mimeType: imagePart.inlineData.mimeType || 'image/png',
    data: imagePart.inlineData.data,
  };
}

async function listModels() {
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`);
  const text = await response.text();
  if (!response.ok) throw new Error(`Gemini ${response.status}: ${text}`);
  return JSON.parse(text);
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === 'OPTIONS') return json(res, 204, {});
    if (req.url === '/health') return json(res, 200, { ok: true, model });
    if (req.url === '/models') return json(res, 200, await listModels());
    if (req.url !== '/generate' || req.method !== 'POST') return json(res, 404, { error: 'Not found' });
    if (!apiKey) return json(res, 500, { error: 'Missing GEMINI_API_KEY' });

    const body = await readBody(req);
    if (!body.prompt) return json(res, 400, { error: 'Missing prompt' });

    const image = await generateImage(body.prompt);
    return json(res, 200, image);
  } catch (error) {
    return json(res, 500, { error: error.message });
  }
});

server.listen(port, () => {
  console.log(`Gemini proxy listening on ${port}`);
});
