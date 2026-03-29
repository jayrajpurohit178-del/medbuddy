# 🏥 MedDecode — AI Medical Report Simplifier

> *"Your prescription, finally explained."*

[![Made with Node.js](https://img.shields.io/badge/Made%20with-Node.js-339933?style=flat&logo=node.js)](https://nodejs.org)
[![AI Powered](https://img.shields.io/badge/AI-OpenRouter-FF6B35?style=flat)](https://openrouter.ai)
[![Deployed on Render](https://img.shields.io/badge/Deployed%20on-Render-46E3B7?style=flat)](https://render.com)
[![IAR Udaan Hackathon 2026](https://img.shields.io/badge/IAR%20Udaan-Hackathon%202026-006DC6?style=flat)](/)

---

## 📌 What is MedDecode?

Every day in India, patients leave hospitals clutching a prescription or medical report full of jargon they cannot understand. They go home confused, miss doses, or Google their symptoms at 2AM and panic.

**MedDecode** solves this.

Upload any medical document — prescription, discharge summary, blood sugar report, sonography, CBC, MRI report — and instantly get:

- ✅ Plain-language explanation of your diagnosis
- 💊 Clean medication schedule (name, dose, timing, duration)
- ⚠️ Side effect alerts
- 🔬 Report values explained (normal/high/low/critical)
- 📋 Follow-up checklist
- 💬 One-line summary your family can understand instantly
- 🔊 Read-aloud feature in your language
- 🏥 Nurse Maya — AI health chatbot

**Supports: English · Hindi · Gujarati**

---

## 🌍 Real World Context

- **Apollo Hospitals & Practo** are piloting this exact use case internally
- **Abridge** (US startup on this idea) is valued at **$850 million**
- India's average doctor consultation = **under 2 minutes**
- No tool exists today that bridges this gap for the **common Indian person**

---

## ✨ Features

| Feature | Description |
|---------|-------------|
| 📄 PDF Upload | Upload prescription or medical report as PDF |
| 🖼️ Image Upload | Upload photo of handwritten or printed prescription |
| ✏️ Text Paste | Paste prescription text directly |
| 🩺 Plain Diagnosis | What your condition actually means in simple words |
| 💊 Medication Table | Medicine · Dosage · Timing · Duration · Instructions |
| 🔬 Report Values | Each test value explained with Normal/High/Low/Critical status |
| ⚠️ Side Effect Alerts | Top side effects to watch for |
| ✅ Follow-up Checklist | Tests ordered, diet restrictions, activity limits |
| 🔄 Jargon Decoder | Medical terms from the document → plain language |
| 💬 Family Summary | One line to share with family instantly |
| 🔊 Read Aloud | Speaks the summary in English / Hindi / Gujarati |
| 🏥 Nurse Maya | AI health chatbot — ask anything about your prescription |
| 🌐 3 Languages | Full UI switch: English · हिंदी · ગુજરાતી |
| 🌙 Dark / Light Mode | Comfortable for all lighting conditions |
| 🔐 Login / Signup | Account system with email or phone number |
| 📊 History | All past analyses saved and reloadable |
| 🎨 Bento Grid UI | Modern iOS-style dashboard layout |

---

## 🏥 Supported Medical Documents

- ✅ Prescriptions (printed & handwritten)
- ✅ Hospital Discharge Summaries
- ✅ Blood Sugar / Glucose Reports
- ✅ HbA1c Reports
- ✅ CBC (Complete Blood Count)
- ✅ Sonography / Ultrasound Reports
- ✅ X-Ray Reports
- ✅ MRI / CT Scan Reports
- ✅ Thyroid Tests (TSH / T3 / T4)
- ✅ Lipid Profile
- ✅ Liver Function Tests (LFT)
- ✅ Kidney Function Tests (KFT)
- ✅ Urine / Stool Tests
- ✅ ECG Reports
- ✅ Vitamin Deficiency Reports (Vit D, B12, Iron)
- ✅ Any other Indian medical document

---

## 🛠️ Tech Stack

### Frontend
- **Pure HTML5 / CSS3 / Vanilla JS** — single file, zero build step
- **Fraunces + Instrument Sans** — Google Fonts
- **SVG animations** — Doctor walk-in splash screen, Nurse Maya avatar
- **CSS backdrop-filter** — Frosted glass card design
- **Bento Grid layout** — iOS-style responsive dashboard
- **Web Speech API** — Browser-native text-to-speech (Read Aloud)

### Backend
- **Node.js + Express** — REST API server
- **Multer** — File upload handling (PDF, image — up to 15MB)
- **Axios** — HTTP calls to OpenRouter AI
- **ExcelJS** — Read/write `.xlsx` database files
- **UUID** — Unique IDs for each analysis

### AI / Intelligence
- **OpenRouter API** — Unified gateway to multiple AI models
- **Auto model fallback** — 5 models tried in order, never fails:
  1. `google/gemini-2.0-flash-exp:free`
  2. `meta-llama/llama-3.1-8b-instruct:free`
  3. `mistralai/mistral-7b-instruct:free`
  4. `google/gemini-flash-1.5`
  5. `openai/gpt-4o-mini`
- **Vision models** — Separate list for image/PDF analysis
- **Structured JSON output** — AI returns clean structured data

### Database
- **analyses.xlsx** — Every analysis logged (auto-created at runtime)
- **users.xlsx** — Login/signup credentials (auto-created at runtime)
- **medicines_db.xlsx** — 50 Indian medicines reference database (static)

### Deployment
- **Render** — Cloud hosting
- **GitHub** — Source control + auto-deploy

---

## 📁 Project Structure

```
meddecode/
├── public/
│   └── index.html              ← Entire frontend (single file)
├── data/                       ← Auto-created at runtime
│   ├── analyses.xlsx           ← Analysis history database
│   ├── users.xlsx              ← User accounts
│   └── medicines_db.xlsx       ← Medicine reference (add manually)
├── server.js                   ← Express backend + all API routes
├── package.json                ← Dependencies
├── .env.example                ← Environment variable template
├── .gitignore
└── README.md
```

---

## ⚡ Quick Start (Local)

### 1. Clone the repo
```bash
git clone https://github.com/YOUR_USERNAME/meddecode.git
cd meddecode
```

### 2. Install dependencies
```bash
npm install
```

### 3. Set up environment
```bash
cp .env.example .env
```

Edit `.env`:
```
OPENROUTER_API_KEY=sk-or-v1-xxxxxxxxxxxxxxxx
PORT=3000
```

Get your free API key at → [openrouter.ai/keys](https://openrouter.ai/keys)

### 4. Run
```bash
npm start
```

Open [http://localhost:3000](http://localhost:3000)

For development with auto-reload:
```bash
npm run dev
```

---

## 🚀 Deploy to Render

1. Push your code to GitHub
2. Go to [render.com](https://render.com) → **New** → **Web Service**
3. Connect your GitHub repository
4. Configure:

| Setting | Value |
|---------|-------|
| **Runtime** | Node |
| **Build Command** | `npm install` |
| **Start Command** | `npm start` |
| **Instance Type** | Free |

5. Go to **Environment** tab → **Add Environment Variable**:

```
Key:   OPENROUTER_API_KEY
Value: sk-or-v1-xxxxxxxxxxxxxxxx
```

6. Click **Deploy** — your app is live in ~2 minutes!

### ✅ Verify deployment
Visit `https://your-app.onrender.com/api/health`

You should see:
```json
{
  "status": "ok",
  "keySet": true,
  "timestamp": "2026-03-22T..."
}
```

If `keySet` is `false` → your API key is not set correctly on Render.

---

## 🔌 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/analyze` | Analyse a medical document |
| `GET`  | `/api/history` | Get all past analyses |
| `POST` | `/api/chat` | Nurse Maya AI chatbot |
| `POST` | `/api/signup` | Create user account |
| `POST` | `/api/login` | Login to account |
| `GET`  | `/api/export` | Download analyses as Excel |
| `GET`  | `/api/health` | Server health check |

### POST /api/analyze
```
Content-Type: multipart/form-data

Fields:
  file       → PDF or image file (for pdf/image mode)
  inputType  → "pdf" | "image" | "text"
  text       → plain text (for text mode only)
  lang       → "en" | "hi" | "gu"  (default: "en")
  age        → patient age (optional)
```

### POST /api/chat (Nurse Maya)
```json
{
  "messages": [
    { "role": "system", "content": "..." },
    { "role": "user", "content": "I have fever, what should I do?" }
  ]
}
```

---

## ⚠️ Safety Rules (Built-in)

MedDecode follows strict patient safety rules:

- The AI **only simplifies what is written** in the uploaded document
- It **cannot add outside medical advice** or suggest alternatives
- It **cannot invent or hallucinate** medication details
- **Wrong dosage in output = immediate failure** — enforced by strict prompting
- Nurse Maya always recommends **consulting a real doctor** for serious concerns

---

## 🎨 Design Highlights

- **Bento Grid** — All information visible at once, no scrolling needed
- **Watercolor flower background** — Soft, calming, medical feel
- **Frosted glass cards** — Premium aesthetic, background always visible
- **Doctor walk-in splash** — Memorable opening animation (pure CSS + SVG)
- **Nurse Maya** — Floating AI avatar, prescription-aware chatbot
- **Bottom dock navigation** — iOS-style familiar navigation
- **3-language UI** — Every string translates: English · Hindi · Gujarati

---

## 🔐 Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `OPENROUTER_API_KEY` | ✅ Yes | Your OpenRouter API key |
| `PORT` | ❌ No | Server port (default: 3000) |

---

## 📦 Dependencies

```json
{
  "express": "^4.19.2",
  "multer": "^1.4.5-lts.1",
  "axios": "^1.7.2",
  "exceljs": "^4.4.0",
  "uuid": "^10.0.0"
}
```

Dev:
```json
{
  "nodemon": "^3.1.4"
}
```

---

## 🚧 Roadmap

- [ ] Emergency Alert → WhatsApp message to family
- [ ] Medicine Photo Recognition → scan strip, get details
- [ ] Refill Reminder Calendar → never miss a dose
- [ ] Monthly Expense Tracker → estimated medicine costs
- [ ] Offline Mode → rural India support
- [ ] ABDM Integration → Ayushman Bharat Digital Mission
- [ ] Hospital API Integration → Apollo, Practo

---

## 👨‍💻 Built At

**IAR Udaan Hackathon 2026**
Theme: AI · GenAI · RAG
Category: 1st Year Students — Problem Statement #03

---

## 📄 License

MIT License — free to use, modify and distribute.

---

## 🙏 Acknowledgements

- [OpenRouter](https://openrouter.ai) — AI model gateway
- [Google Fonts](https://fonts.google.com) — Fraunces & Instrument Sans
- [Render](https://render.com) — Free hosting platform
- [ExcelJS](https://github.com/exceljs/exceljs) — Excel database

---

*Made with ❤️ for every Indian patient who deserved a clearer explanation.*
updated by anchalusharmabtce2025-arch
