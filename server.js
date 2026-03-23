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
const DB_FILE = path.join(__dirname, 'data', 'meddecode_db.xlsx');

// Ensure data directory exists
if (!fs.existsSync(path.join(__dirname, 'data'))) {
  fs.mkdirSync(path.join(__dirname, 'data'), { recursive: true });
}

app.use(express.json());
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});
app.use(express.static(path.join(__dirname, 'public')));

// Multer — memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'audio/webm', 'audio/mp4', 'audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/x-m4a', 'audio/mp3'];
    if (allowed.includes(file.mimetype) || file.mimetype.startsWith('audio/')) cb(null, true);
    else cb(new Error('Only PDF and image files are allowed'));
  }
});

// ─── XLSX DB ──────────────────────────────────────────────────────────────────

async function initDB() {
  if (fs.existsSync(DB_FILE)) return;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Analyses');
  ws.columns = [
    { header: 'ID',         key: 'id',        width: 38 },
    { header: 'Filename',   key: 'filename',  width: 30 },
    { header: 'InputType',  key: 'inputType', width: 12 },
    { header: 'Language',   key: 'language',  width: 10 },
    { header: 'Age',        key: 'age',       width: 6  },
    { header: 'Result',     key: 'result',    width: 60 },
    { header: 'CreatedAt',  key: 'createdAt', width: 24 },
  ];
  ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF006DC6' } };
  await wb.xlsx.writeFile(DB_FILE);
}

async function saveToDB(record) {
  const wb = new ExcelJS.Workbook();
  if (fs.existsSync(DB_FILE)) await wb.xlsx.readFile(DB_FILE);
  else await initDB();
  const ws = wb.getWorksheet('Analyses') || wb.addWorksheet('Analyses');
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
    if (rowNumber === 1) return;
    rows.push({
      id:        row.getCell('ID').value,
      filename:  row.getCell('Filename').value,
      inputType: row.getCell('InputType').value,
      language:  row.getCell('Language').value,
      age:       row.getCell('Age').value,
      result:    row.getCell('Result').value,
      createdAt: row.getCell('CreatedAt').value,
    });
  });
  return rows.reverse();
}

// ─── AI MODELS ────────────────────────────────────────────────────────────────

// Vision-capable models (for image + PDF inputs)
const VISION_MODELS = [
  'google/gemini-2.0-flash-exp:free',
  'google/gemini-flash-1.5-8b',
  'google/gemini-flash-1.5',
  'openai/gpt-4o-mini',
  'anthropic/claude-3-haiku',
];

// Text-only models (for plain text inputs — cheaper/faster)
const TEXT_MODELS = [
  'google/gemini-2.0-flash-exp:free',
  'meta-llama/llama-3.1-8b-instruct:free',
  'mistralai/mistral-7b-instruct:free',
  'google/gemini-flash-1.5',
  'openai/gpt-4o-mini',
];

function buildPrompt(lang, age) {
  const langMap = {
    hi: 'Respond ENTIRELY in Hindi (Devanagari script). Keep JSON keys in English.',
    gu: 'Respond ENTIRELY in Gujarati (Gujarati script). Keep JSON keys in English.',
    en: 'Respond in clear, simple English that anyone can understand.'
  };
  const langInstruction = langMap[lang] || langMap.en;
  const ageNote = age ? `The patient is ${age} years old. Adjust language complexity accordingly.` : '';

  return `You are MedDecode, an expert AI medical report analyzer for Indian patients. You can analyze ANY kind of medical document including:
- Prescriptions and discharge summaries
- Blood test reports (CBC, LFT, KFT, lipid profile, thyroid, HbA1c, blood sugar, etc.)
- MRI, CT scan, X-ray, Ultrasound and Sonography reports
- ECG and Echo cardiac reports
- Urine analysis reports
- Pathology and biopsy reports
- Any other medical or lab report

${langInstruction}
${ageNote}

RULES:
- ONLY explain what is written in the document. Do NOT add outside advice or invent information.
- For lab reports: explain what each abnormal value means in simple language.
- For imaging reports (MRI/CT/USG/X-ray): explain all findings in simple terms a patient understands.
- Extract EVERY medical jargon term and explain it simply.
- Medications: match EXACTLY what is written. Wrong dosage = critical failure.

Analyze the provided medical document and return ONLY a valid JSON object. No markdown, no explanation, just raw JSON:

{
  "reportType": "Type of report e.g. Blood Test Report / MRI Report / Prescription / Sonography Report / ECG Report",
  "familySummary": "One simple sentence a family member can instantly understand about this report",
  "diagnosis": "Plain-language explanation of the main finding or condition and what it means for the patient",
  "keyFindings": [
    {
      "parameter": "e.g. Hemoglobin or Blood Sugar or Impression",
      "value": "Actual value from report e.g. 9.2 g/dL",
      "normalRange": "Normal range if applicable e.g. 12-16 g/dL",
      "status": "Normal or High or Low or Abnormal",
      "meaning": "What this value means in simple language for the patient"
    }
  ],
  "medications": [
    {
      "name": "Medicine name exactly as written",
      "dosage": "e.g. 500mg",
      "timing": "e.g. Twice a day after meals",
      "duration": "e.g. 5 days",
      "instructions": "e.g. Take with water"
    }
  ],
  "sideEffects": ["Side effect 1", "Side effect 2", "Side effect 3"],
  "doctorAlert": "When to urgently call doctor based on this report, 1 sentence, or null if nothing urgent",
  "checklist": ["Follow-up test or action 1", "Diet restriction 1", "Activity limit 1"],
  "comparisons": [
    { "original": "Exact medical jargon term or abbreviation from the document", "plain": "Simple plain-language explanation of what this term means" }
  ]
}

CRITICAL RULES:
1. comparisons array must include EVERY medical jargon term, abbreviation, and technical phrase from the document. Minimum 6-10 items.
2. keyFindings must list ALL test values and imaging findings. Empty array only if pure prescription with no lab values.
3. If medications are not present in the report, return an empty medications array.
4. Return ONLY the JSON object. Nothing else whatsoever.`;
}


// ─── ROUTES ───────────────────────────────────────────────────────────────────

app.post('/api/analyze', upload.single('file'), async (req, res) => {
  try {
    if (!OPENROUTER_API_KEY) {
      return res.status(500).json({ error: 'OPENROUTER_API_KEY is not set on the server.' });
    }

    const { inputType, lang = 'en', age, text } = req.body;
    const prompt = buildPrompt(lang, age);
    let messages;
    let filename = null;
    let useVision = false;

    if (inputType === 'text') {
      // Plain text — no vision needed
      if (!text || !text.trim()) return res.status(400).json({ error: 'No text provided.' });
      messages = [{
        role: 'user',
        content: `${prompt}\n\nMedical Document:\n---\n${text.trim()}\n---`
      }];
      useVision = false;

    } else if (inputType === 'pdf') {
      // PDF — send as base64 image to vision model
      if (!req.file) return res.status(400).json({ error: 'No PDF uploaded.' });
      filename = req.file.originalname;
      const base64 = req.file.buffer.toString('base64');

      messages = [{
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          {
            type: 'image_url',
            image_url: {
              url: `data:application/pdf;base64,${base64}`,
              detail: 'high'
            }
          }
        ]
      }];
      useVision = true;

    } else if (inputType === 'image') {
      // Image — send as base64 to vision model
      if (!req.file) return res.status(400).json({ error: 'No image uploaded.' });
      filename = req.file.originalname;
      const base64 = req.file.buffer.toString('base64');
      const mimeType = req.file.mimetype; // e.g. image/jpeg

      messages = [{
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          {
            type: 'image_url',
            image_url: {
              url: `data:${mimeType};base64,${base64}`,
              detail: 'high'
            }
          }
        ]
      }];
      useVision = true;

    } else if (inputType === 'audio') {
      // Audio/voice recording — transcribe via prompt
      if (!req.file) return res.status(400).json({ error: 'No audio file uploaded.' });
      filename = req.file.originalname;
      // Send audio as base64 to vision/audio capable model
      const base64 = req.file.buffer.toString('base64');
      const mimeType = req.file.mimetype || 'audio/webm';
      messages = [{
        role: 'user',
        content: [
          { type: 'text', text: prompt + '\n\nThis is an audio recording of a doctor or patient describing medical information, a prescription, or health condition. Please listen carefully and extract all medical information, then analyze it as a medical document.' },
          {
            type: 'image_url',
            image_url: { url: `data:${mimeType};base64,${base64}` }
          }
        ]
      }];
      useVision = true;

    } else {
      return res.status(400).json({ error: 'Invalid inputType. Use: text, pdf, image, or audio' });
    }

    const rawResponse = await callOpenRouter(messages, useVision);
    const parsed = parseAIResponse(rawResponse);
    parsed.lang = lang;

    // Save to DB
    await saveToDB({
      id: uuidv4(),
      filename,
      inputType,
      language: lang,
      age: age || null,
      result: parsed,
      createdAt: new Date().toISOString(),
    });

    res.json(parsed);

  } catch (err) {
    console.error('❌ Analyze error:', err.message);
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

// History
app.get('/api/history', async (req, res) => {
  try {
    res.json(await getHistory());
  } catch (err) {
    res.status(500).json({ error: 'Could not load history' });
  }
});

// Download DB
app.get('/api/export', (req, res) => {
  if (!fs.existsSync(DB_FILE)) return res.status(404).json({ error: 'No data yet' });
  res.download(DB_FILE, 'meddecode_analyses.xlsx');
});


// Config — exposes API key safely to frontend for nurse chatbot
app.get('/api/config', (req, res) => {
  res.json({ key: OPENROUTER_API_KEY || '' });
});

// Auth — Signup
app.post('/api/signup', async (req, res) => {
  try {
    const { name, email, phone, password } = req.body;
    if (!name || (!email && !phone) || !password)
      return res.status(400).json({ error: 'Missing required fields' });
    if (password.length < 6)
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    // Simple: store in xlsx
    const wb = new ExcelJS.Workbook();
    const userFile = path.join(__dirname, 'data', 'users.xlsx');
    if (require('fs').existsSync(userFile)) await wb.xlsx.readFile(userFile);
    let ws = wb.getWorksheet('Users');
    if (!ws) {
      ws = wb.addWorksheet('Users');
      ws.columns = [
        {header:'ID',key:'id',width:38},{header:'Name',key:'name',width:24},
        {header:'Email',key:'email',width:30},{header:'Phone',key:'phone',width:16},
        {header:'Password',key:'password',width:20},{header:'CreatedAt',key:'createdAt',width:24}
      ];
    }
    // Check duplicate
    let exists = false;
    ws.eachRow((row,i)=>{ if(i===1) return; if(row.getCell('Email').value===email||row.getCell('Phone').value===phone) exists=true; });
    if(exists) return res.status(400).json({error:'Account already exists with this email or phone'});
    ws.addRow({id:require('crypto').randomUUID(),name,email:email||'',phone:phone||'',password,createdAt:new Date().toISOString()});
    await wb.xlsx.writeFile(userFile);
    res.json({ success: true, message: 'Account created' });
  } catch(err) {
    res.status(500).json({ error: err.message });
  }
});

// Auth — Login
app.post('/api/login', async (req, res) => {
  try {
    const { identifier, password } = req.body;
    if (!identifier || !password) return res.status(400).json({ error: 'Missing credentials' });
    const userFile = path.join(__dirname, 'data', 'users.xlsx');
    if (!require('fs').existsSync(userFile)) return res.status(401).json({ error: 'No accounts found. Please sign up.' });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(userFile);
    const ws = wb.getWorksheet('Users');
    let found = false;
    ws.eachRow((row,i)=>{
      if(i===1) return;
      const em = row.getCell('Email').value;
      const ph = row.getCell('Phone').value;
      const pw = row.getCell('Password').value;
      if((em===identifier||ph===identifier) && pw===password) found=true;
    });
    if(!found) return res.status(401).json({error:'Invalid email/phone or password'});
    res.json({ success: true, message: 'Login successful' });
  } catch(err) {
    res.status(500).json({ error: err.message });
  }
});


// ── NURSE MAYA CHAT PROXY ────────────────────────────────────────────────────
app.post('/api/chat', async (req, res) => {
  try {
    if (!OPENROUTER_API_KEY) {
      return res.status(500).json({ error: 'OPENROUTER_API_KEY not set on server.' });
    }

    const { messages } = req.body;
    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'Invalid messages array.' });
    }

    const MODELS = [
      'google/gemini-2.0-flash-exp:free',
      'meta-llama/llama-3.1-8b-instruct:free',
      'mistralai/mistral-7b-instruct:free',
      'google/gemini-flash-1.5',
      'openai/gpt-4o-mini',
    ];

    let reply = null;
    for (const model of MODELS) {
      try {
        console.log(`🤖 Nurse Maya trying: ${model}`);
        const response = await axios.post(
          'https://openrouter.ai/api/v1/chat/completions',
          { model, messages, max_tokens: 500, temperature: 0.75 },
          {
            headers: {
              'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
              'Content-Type': 'application/json',
              'HTTP-Referer': 'https://meddecode.app',
              'X-Title': 'MedDecode Nurse Maya',
            },
            timeout: 30000,
          }
        );
        reply = response.data?.choices?.[0]?.message?.content;
        if (reply) { console.log(`✅ Nurse Maya replied via: ${model}`); break; }
      } catch (err) {
        console.warn(`⚠️  ${model} failed: ${err.response?.status} ${err.message}`);
        if (err.response?.status === 401) {
          return res.status(401).json({ error: 'Invalid API key. Check OPENROUTER_API_KEY on Render.' });
        }
      }
    }

    if (!reply) return res.status(502).json({ error: 'All AI models failed. Try again later.' });
    res.json({ reply });

  } catch (err) {
    console.error('Chat error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Start
initDB().then(() => {
  app.listen(PORT, () => console.log(`🏥 MedDecode server running on port ${PORT}`));
});
