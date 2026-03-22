const express = require('express');
const multer = require('multer');
const axios = require('axios');
const ExcelJS = require('exceljs');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3000;
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const DB_FILE = path.join(__dirname, 'data', 'medbuddy_db.xlsx');

// Ensure data directory exists
if (!fs.existsSync(path.join(__dirname, 'data'))) {
  fs.mkdirSync(path.join(__dirname, 'data'), { recursive: true });
}

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Multer config: store files in memory
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    const allowed = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Only PDF and image files are allowed'));
  }
});

// ─── XLSX DB HELPERS ──────────────────────────────────────────────────────────

async function initDB() {
  const wb = new ExcelJS.Workbook();
  if (!fs.existsSync(DB_FILE)) {
    const ws = wb.addWorksheet('Analyses');
    ws.columns = [
      { header: 'ID', key: 'id', width: 38 },
      { header: 'Filename', key: 'filename', width: 30 },
      { header: 'InputType', key: 'inputType', width: 12 },
      { header: 'Language', key: 'language', width: 10 },
      { header: 'Age', key: 'age', width: 6 },
      { header: 'Result', key: 'result', width: 60 },
      { header: 'CreatedAt', key: 'createdAt', width: 24 },
    ];
    // Style header row
    ws.getRow(1).font = { bold: true };
    ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF006DC6' } };
    ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    await wb.xlsx.writeFile(DB_FILE);
  }
  return wb;
}

async function saveToDB(record) {
  const wb = new ExcelJS.Workbook();
  if (fs.existsSync(DB_FILE)) {
    await wb.xlsx.readFile(DB_FILE);
  } else {
    await initDB();
    await wb.xlsx.readFile(DB_FILE);
  }
  const ws = wb.getWorksheet('Analyses');
  ws.addRow({
    id: record.id,
    filename: record.filename || '',
    inputType: record.inputType,
    language: record.language,
    age: record.age || '',
    result: JSON.stringify(record.result),
    createdAt: record.createdAt,
  });
  await wb.xlsx.writeFile(DB_FILE);
}

async function getHistory() {
  if (!fs.existsSync(DB_FILE)) return [];
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(DB_FILE);
  const ws = wb.getWorksheet('Analyses');
  const rows = [];
  ws.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return; // skip header
    rows.push({
      id: row.getCell('ID').value,
      filename: row.getCell('Filename').value,
      inputType: row.getCell('InputType').value,
      language: row.getCell('Language').value,
      age: row.getCell('Age').value,
      result: row.getCell('Result').value,
      createdAt: row.getCell('CreatedAt').value,
    });
  });
  return rows.reverse(); // newest first
}

// ─── OPENROUTER AI ────────────────────────────────────────────────────────────

const MODELS_TO_TRY = [
  'google/gemini-2.0-flash-exp:free',
  'google/gemini-flash-1.5',
  'meta-llama/llama-3.1-8b-instruct:free',
  'mistralai/mistral-7b-instruct:free',
  'openai/gpt-4o-mini',
];

function buildPrompt(text, lang, age) {
  const langInstruction = lang === 'hi'
    ? 'Respond ENTIRELY in Hindi (Devanagari script). All text including keys must be in Hindi where appropriate, but keep JSON keys in English.'
    : 'Respond in clear, simple English.';

  const ageNote = age ? `The patient is ${age} years old. Adjust language complexity accordingly.` : '';

  return `You are MedBuddy, a medical document simplifier. Your job is ONLY to simplify what is written in the document — do NOT add medical advice, suggest alternative medicines, or include outside information.

${langInstruction}
${ageNote}

Analyze the following medical prescription or discharge summary and return ONLY a valid JSON object with this exact structure (no markdown, no explanation, just JSON):

{
  "familySummary": "One-line summary a family member can instantly understand",
  "diagnosis": "Plain-language explanation of the condition (what it is, explained like talking to a friend)",
  "medications": [
    {
      "name": "Medicine name",
      "dosage": "e.g. 500mg",
      "timing": "e.g. Twice a day after meals",
      "duration": "e.g. 5 days",
      "instructions": "e.g. Take with water"
    }
  ],
  "sideEffects": [
    "Side effect 1",
    "Side effect 2",
    "Side effect 3"
  ],
  "doctorAlert": "When to call the doctor immediately (1 sentence, or null if not mentioned)",
  "checklist": [
    "Follow-up test or action item 1",
    "Diet restriction 1",
    "Activity limit 1"
  ],
  "comparisons": [
    {
      "original": "Medical jargon phrase from document",
      "plain": "Plain-language explanation"
    }
  ]
}

CRITICAL RULES:
- medications array must exactly match what is written in the document — wrong dosage = failure
- Do not invent or add anything not in the document
- sideEffects should be top 2-3 things to watch for based on the medicines listed
- comparisons should include 2-4 key jargon terms from the document

Medical Document:
---
${text}
---`;
}

async function callOpenRouter(messages, isVision = false) {
  for (const model of MODELS_TO_TRY) {
    try {
      const body = {
        model,
        messages,
        max_tokens: 2000,
        temperature: 0.1,
      };

      const res = await axios.post('https://openrouter.ai/api/v1/chat/completions', body, {
        headers: {
          'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://medbuddy.app',
          'X-Title': 'MedBuddy',
        },
        timeout: 60000,
      });

      const content = res.data.choices?.[0]?.message?.content;
      if (content) {
        console.log(`✅ Used model: ${model}`);
        return content;
      }
    } catch (err) {
      const status = err.response?.status;
      console.warn(`⚠️  Model ${model} failed (${status}): ${err.message}`);
      if (status === 401) throw new Error('Invalid OpenRouter API key');
      // Try next model
    }
  }
  throw new Error('All models failed. Check your OpenRouter API key and quota.');
}

function parseAIResponse(raw) {
  let text = raw.trim();
  // Strip markdown code fences if present
  text = text.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '');
  return JSON.parse(text);
}

// ─── ROUTES ───────────────────────────────────────────────────────────────────

// Analyze endpoint
app.post('/api/analyze', upload.single('file'), async (req, res) => {
  try {
    if (!OPENROUTER_API_KEY) {
      return res.status(500).json({ error: 'OPENROUTER_API_KEY is not configured on the server.' });
    }

    const { inputType, lang = 'en', age, text } = req.body;
    let messages;
    let filename = null;

    if (inputType === 'text') {
      if (!text) return res.status(400).json({ error: 'No text provided.' });
      messages = [{ role: 'user', content: buildPrompt(text, lang, age) }];

    } else if (inputType === 'pdf') {
      if (!req.file) return res.status(400).json({ error: 'No PDF file uploaded.' });
      filename = req.file.originalname;

      // Send PDF as base64 to vision-capable model
      const base64 = req.file.buffer.toString('base64');
      messages = [{
        role: 'user',
        content: [
          {
            type: 'text',
            text: buildPrompt('[See attached PDF document]', lang, age),
          },
          {
            type: 'image_url',
            image_url: {
              url: `data:application/pdf;base64,${base64}`,
            },
          },
        ],
      }];

    } else if (inputType === 'image') {
      if (!req.file) return res.status(400).json({ error: 'No image file uploaded.' });
      filename = req.file.originalname;
      const base64 = req.file.buffer.toString('base64');
      const mimeType = req.file.mimetype;

      messages = [{
        role: 'user',
        content: [
          {
            type: 'text',
            text: buildPrompt('[See attached prescription image]', lang, age),
          },
          {
            type: 'image_url',
            image_url: {
              url: `data:${mimeType};base64,${base64}`,
            },
          },
        ],
      }];

    } else {
      return res.status(400).json({ error: 'Invalid inputType.' });
    }

    const rawResponse = await callOpenRouter(messages);
    const parsed = parseAIResponse(rawResponse);
    parsed.lang = lang;

    // Save to XLSX DB
    const record = {
      id: uuidv4(),
      filename,
      inputType,
      language: lang,
      age: age || null,
      result: parsed,
      createdAt: new Date().toISOString(),
    };
    await saveToDB(record);

    res.json(parsed);

  } catch (err) {
    console.error('Analyze error:', err.message);
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

// History endpoint
app.get('/api/history', async (req, res) => {
  try {
    const history = await getHistory();
    res.json(history);
  } catch (err) {
    console.error('History error:', err.message);
    res.status(500).json({ error: 'Could not load history' });
  }
});

// Download DB as Excel
app.get('/api/export', async (req, res) => {
  try {
    if (!fs.existsSync(DB_FILE)) {
      return res.status(404).json({ error: 'No data yet' });
    }
    res.download(DB_FILE, 'medbuddy_analyses.xlsx');
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Init DB on startup then listen
initDB().then(() => {
  app.listen(PORT, () => {
    console.log(`🏥 MedBuddy server running on port ${PORT}`);
  });
});
