const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models', { headers: { 'x-goog-api-key': process.env.GEMINI_API_KEY } });
const data = await response.json();
console.log({ status: response.status, error: data.error?.message, models: data.models?.filter((model) => model.supportedGenerationMethods?.includes('generateContent')).map((model) => model.name) });
const model = process.env.GEMINI_MODEL || 'gemini-3.8-flash';
const test = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY }, body: JSON.stringify({ contents: [{ parts: [{ text: 'Retorne JSON {"ok":true}.' }] }], generationConfig: { responseMimeType: 'application/json', temperature: 0.2, maxOutputTokens: 8000 } }) });
const value = await test.json();
console.log({ model, status: test.status, error: value.error?.message, result: value.candidates?.[0]?.content?.parts?.map((part) => part.text).join('') });
