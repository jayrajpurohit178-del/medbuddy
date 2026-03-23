const express = require('express');
const multer  = require('multer');
const axios   = require('axios');
const ExcelJS = require('exceljs');
const fs      = require('fs');
const path    = require('path');
const { v4: uuidv4 } = require('uuid');

const app  = express();
const PORT = process.env.PORT || 3000;
const KEY  = process.env.OPENROUTER_API_KEY;
const DB   = path.join(__dirname, 'data', 'analyses.xlsx');
const USERS= path.join(__dirname, 'data', 'users.xlsx');

if (!fs.existsSync(path.join(__dirname,'data')))
  fs.mkdirSync(path.join(__dirname,'data'),{recursive:true});

app.use(express.json());
app.use((req,res,next)=>{
  res.header('Access-Control-Allow-Origin','*');
  res.header('Access-Control-Allow-Headers','Content-Type,Authorization');
  res.header('Access-Control-Allow-Methods','GET,POST,OPTIONS');
  if(req.method==='OPTIONS') return res.sendStatus(200);
  next();
});
app.use(express.static(path.join(__dirname,'public')));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15*1024*1024 },
  fileFilter: (_req,file,cb) => cb(null,true)
});

async function initDB() {
  if (fs.existsSync(DB)) return;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Analyses');
  ws.columns = [
    {header:'ID',key:'id',width:38},
    {header:'Filename',key:'filename',width:30},
    {header:'InputType',key:'inputType',width:12},
    {header:'Language',key:'language',width:10},
    {header:'Age',key:'age',width:6},
    {header:'Result',key:'result',width:80},
    {header:'CreatedAt',key:'createdAt',width:24},
  ];
  ws.getRow(1).font={bold:true,color:{argb:'FFFFFFFF'}};
  ws.getRow(1).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF006DC6'}};
  await wb.xlsx.writeFile(DB);
}

async function saveToDB(rec) {
  const wb = new ExcelJS.Workbook();
  if (fs.existsSync(DB)) await wb.xlsx.readFile(DB);
  else { await initDB(); await wb.xlsx.readFile(DB); }
  const ws = wb.getWorksheet('Analyses');
  ws.addRow({
    id:rec.id, filename:rec.filename||'',
    inputType:rec.inputType, language:rec.language,
    age:rec.age||'', result:JSON.stringify(rec.result),
    createdAt:rec.createdAt
  });
  await wb.xlsx.writeFile(DB);
}

async function getHistory() {
  if (!fs.existsSync(DB)) return [];
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(DB);
  const ws = wb.getWorksheet('Analyses');
  const rows = [];
  ws.eachRow((row,i) => {
    if(i===1) return;
    rows.push({
      id:       row.getCell('ID').value,
      filename: row.getCell('Filename').value,
      inputType:row.getCell('InputType').value,
      language: row.getCell('Language').value,
      age:      row.getCell('Age').value,
      result:   row.getCell('Result').value,
      createdAt:row.getCell('CreatedAt').value,
    });
  });
  return rows.reverse();
}

const VISION_MODELS = [
  'google/gemini-2.0-flash-exp:free',
  'google/gemini-flash-1.5',
  'openai/gpt-4o-mini',
];
const TEXT_MODELS = [
  'google/gemini-2.0-flash-exp:free',
  'meta-llama/llama-3.1-8b-instruct:free',
  'mistralai/mistral-7b-instruct:free',
  'google/gemini-flash-1.5',
  'openai/gpt-4o-mini',
];

function buildPrompt(lang, age) {
  const langLine = lang==='hi'
    ? 'Respond ENTIRELY in Hindi (Devanagari). Keep JSON keys in English.'
    : lang==='gu'
    ? 'Respond ENTIRELY in Gujarati script. Keep JSON keys in English.'
    : 'Respond in clear simple English.';
  const ageLine = age ? `Patient age: ${age}.` : '';
  return `You are MedDecode, an AI that simplifies ALL types of Indian medical documents.
You can analyse: prescriptions, discharge summaries, blood sugar reports, HbA1c, CBC, sonography/ultrasound, X-ray, MRI, thyroid tests, lipid profiles, urine tests, liver/kidney function tests, ECG, glucose tolerance tests, and any other medical report.

${langLine} ${ageLine}

STRICT RULES:
- Only explain what is IN the document. Never add outside advice.
- Do not suggest alternative medicines.
- Wrong dosage = failure.
- For test reports: explain each value, flag abnormal values clearly.

Return ONLY a raw JSON object, no markdown fences, no explanation text:

{
  "reportType": "Type of document (e.g. Blood Sugar Report, Prescription, Sonography Report)",
  "familySummary": "One line a family member can instantly understand",
  "diagnosis": "Plain language explanation of the condition or report findings. If normal say so clearly.",
  "medications": [{"name":"","dosage":"","timing":"","duration":"","instructions":""}],
  "reportValues": [{"test":"","value":"","normalRange":"","status":"Normal/High/Low/Critical","plainExplanation":""}],
  "sideEffects": ["top 2-3 side effects of medicines prescribed, or empty array if no medicines"],
  "doctorAlert": "When to call doctor immediately, or null",
  "checklist": ["follow-up item 1","diet restriction","activity limit"],
  "comparisons": [{"original":"jargon term from document","plain":"plain language meaning"}]
}`;
}

async function callAI(messages, useVision=false) {
  const models = useVision ? VISION_MODELS : TEXT_MODELS;
  if (!KEY) throw new Error('OPENROUTER_API_KEY is not set. Add it in Render → Environment Variables.');
  for (const model of models) {
    try {
      console.log(`🔄 Trying: ${model}`);
      const res = await axios.post(
        'https://openrouter.ai/api/v1/chat/completions',
        {model, messages, max_tokens:2500, temperature:0.1},
        {headers:{
          'Authorization':`Bearer ${KEY}`,
          'Content-Type':'application/json',
          'HTTP-Referer':'https://meddecode.app',
          'X-Title':'MedDecode'
        }, timeout:60000}
      );
      const content = res.data?.choices?.[0]?.message?.content;
      if (content) { console.log(`✅ Used: ${model}`); return content; }
    } catch(e) {
      console.warn(`⚠️  ${model}: ${e.response?.status} ${e.message}`);
      if (e.response?.status===401)
        throw new Error('Invalid API key. Check OPENROUTER_API_KEY on Render.');
    }
  }
  throw new Error('All AI models failed. Check your API key at openrouter.ai');
}

function parseAI(raw) {
  let t = raw.trim()
    .replace(/^```json\s*/i,'').replace(/^```\s*/i,'').replace(/\s*```$/i,'').trim();
  const s=t.indexOf('{'), e=t.lastIndexOf('}');
  if(s>-1&&e>-1) t=t.slice(s,e+1);
  return JSON.parse(t);
}

// ── ANALYZE ───────────────────────────────────────────────────────────────────
app.post('/api/analyze', upload.single('file'), async (req,res) => {
  try {
    if (!KEY) return res.status(500).json({error:'OPENROUTER_API_KEY not set on server. Add it in Render → Environment Variables tab.'});
    const {inputType, lang='en', age, text} = req.body;
    const prompt = buildPrompt(lang, age);
    let messages, filename=null, useVision=false;

    if (inputType==='text') {
      if (!text?.trim()) return res.status(400).json({error:'No text provided.'});
      messages = [{role:'user',content:`${prompt}\n\nMedical Document:\n---\n${text.trim()}\n---`}];
    } else if (inputType==='pdf'||inputType==='image') {
      if (!req.file) return res.status(400).json({error:'No file uploaded.'});
      filename = req.file.originalname;
      const b64  = req.file.buffer.toString('base64');
      const mime = req.file.mimetype;
      messages = [{role:'user',content:[
        {type:'text',text:prompt},
        {type:'image_url',image_url:{url:`data:${mime};base64,${b64}`,detail:'high'}}
      ]}];
      useVision = true;
    } else {
      return res.status(400).json({error:'Invalid inputType.'});
    }

    const raw    = await callAI(messages, useVision);
    const parsed = parseAI(raw);
    parsed.lang  = lang;

    await saveToDB({
      id:uuidv4(), filename, inputType,
      language:lang, age:age||null,
      result:parsed, createdAt:new Date().toISOString()
    });
    res.json(parsed);
  } catch(e) {
    console.error('❌ Analyze:', e.message);
    res.status(500).json({error:e.message});
  }
});

// ── HISTORY ───────────────────────────────────────────────────────────────────
app.get('/api/history', async (req,res) => {
  try { res.json(await getHistory()); }
  catch(e) { res.status(500).json({error:'Could not load history'}); }
});

// ── CHAT ──────────────────────────────────────────────────────────────────────
app.post('/api/chat', async (req,res) => {
  try {
    if (!KEY) return res.status(500).json({error:'OPENROUTER_API_KEY not set on server.'});
    const {messages} = req.body;
    if (!messages||!Array.isArray(messages)) return res.status(400).json({error:'Invalid messages.'});
    let reply=null;
    for (const model of TEXT_MODELS) {
      try {
        const r = await axios.post(
          'https://openrouter.ai/api/v1/chat/completions',
          {model, messages, max_tokens:500, temperature:0.75},
          {headers:{
            'Authorization':`Bearer ${KEY}`,
            'Content-Type':'application/json',
            'HTTP-Referer':'https://meddecode.app',
            'X-Title':'MedDecode Chat'
          }, timeout:30000}
        );
        reply = r.data?.choices?.[0]?.message?.content;
        if (reply) break;
      } catch(e) {
        if (e.response?.status===401) return res.status(401).json({error:'Invalid API key.'});
      }
    }
    if (!reply) return res.status(502).json({error:'All models failed.'});
    res.json({reply});
  } catch(e){ res.status(500).json({error:e.message}); }
});

// ── AUTH ──────────────────────────────────────────────────────────────────────
app.post('/api/signup', async (req,res) => {
  try {
    const {name,email,phone,password}=req.body;
    if(!name||(!email&&!phone)||!password) return res.status(400).json({error:'Missing fields.'});
    if(password.length<6) return res.status(400).json({error:'Password too short.'});
    const wb=new ExcelJS.Workbook();
    if(fs.existsSync(USERS)) await wb.xlsx.readFile(USERS);
    let ws=wb.getWorksheet('Users');
    if(!ws){
      ws=wb.addWorksheet('Users');
      ws.columns=[
        {header:'ID',key:'id',width:38},{header:'Name',key:'name',width:24},
        {header:'Email',key:'email',width:30},{header:'Phone',key:'phone',width:16},
        {header:'Password',key:'password',width:20},{header:'CreatedAt',key:'createdAt',width:24}
      ];
    }
    let exists=false;
    ws.eachRow((row,i)=>{
      if(i===1)return;
      if((email&&row.getCell('Email').value===email)||(phone&&row.getCell('Phone').value===phone)) exists=true;
    });
    if(exists) return res.status(400).json({error:'Account already exists.'});
    ws.addRow({id:uuidv4(),name,email:email||'',phone:phone||'',password,createdAt:new Date().toISOString()});
    await wb.xlsx.writeFile(USERS);
    res.json({success:true});
  } catch(e){ res.status(500).json({error:e.message}); }
});

app.post('/api/login', async (req,res) => {
  try {
    const {identifier,password}=req.body;
    if(!identifier||!password) return res.status(400).json({error:'Missing credentials.'});
    if(!fs.existsSync(USERS)) return res.status(401).json({error:'No accounts found. Please sign up.'});
    const wb=new ExcelJS.Workbook();
    await wb.xlsx.readFile(USERS);
    const ws=wb.getWorksheet('Users');
    let found=false;
    ws.eachRow((row,i)=>{
      if(i===1)return;
      if((row.getCell('Email').value===identifier||row.getCell('Phone').value===identifier)&&row.getCell('Password').value===password) found=true;
    });
    if(!found) return res.status(401).json({error:'Invalid credentials.'});
    res.json({success:true});
  } catch(e){ res.status(500).json({error:e.message}); }
});

app.get('/api/export', (req,res)=>{
  if(!fs.existsSync(DB)) return res.status(404).json({error:'No data yet'});
  res.download(DB,'meddecode_analyses.xlsx');
});

app.get('/api/health', (req,res)=>
  res.json({status:'ok', key_set:!!KEY, timestamp:new Date().toISOString()})
);

initDB().then(()=>{
  app.listen(PORT,()=>
    console.log(`🏥 MedDecode on port ${PORT} | API key: ${KEY?'✅ SET':'❌ NOT SET - add OPENROUTER_API_KEY on Render!'}`)
  );
});
