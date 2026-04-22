# ExamAnalyzer Pro ⚡

> MHT-CET response sheet analyzer — instant performance dashboard, in your browser, with zero data uploads.

![HTML](https://img.shields.io/badge/HTML5-E34F26?style=flat&logo=html5&logoColor=white)
![CSS](https://img.shields.io/badge/CSS3-1572B6?style=flat&logo=css3&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=flat&logo=javascript&logoColor=black)
![No Backend](https://img.shields.io/badge/Backend-None-00ff88?style=flat)
![Privacy](https://img.shields.io/badge/Privacy-100%25%20Local-00ff88?style=flat)

---

## What is this?

**ExamAnalyzer Pro** is a fully client-side web tool built for MHT-CET aspirants. Upload your official response sheet from the MHT-CET Objection Tracker Portal (HTML or PDF), and instantly get:

- Your total score and accuracy
- Subject-wise breakdown with charts
- A question-by-question review with correct vs your answer
- A downloadable PDF report
- A shareable score card image
- A CSV export of all your answers

Everything runs **inside your browser**. No server. No backend. No account. Your response sheet never leaves your device.

---

## Live Demo

🔗 **[mhtcetmarkscalculator.netlify.app](https://mhtcetmarkscalculator.netlify.app)**

---

## Features

### 📊 Dashboard & Analytics
- **Total Score** with marks breakdown (e.g. 142 / 200)
- **Accuracy %** based on attempted questions only
- **Correct / Incorrect / Unattempted** counts with tooltips
- **Accuracy Donut Chart** — visual split of your attempt quality
- **Sectional Bar Chart** — subject-wise score bars (Physics, Chemistry, Math/Bio)
- **Per-subject Accuracy Pie Charts** — individual donut charts for each subject

### 🔍 Question Viewer
- Browse every question one by one
- See **your answer vs the correct answer** side by side
- Question images rendered directly from the PDF (when PDF is uploaded)
- Click any image to open it in a **fullscreen lightbox**
- Keyboard navigation: `←` / `→` arrow keys
- Filter questions by: **All / Correct / Incorrect / Unattempted**
- Click any question in the sidebar grid to jump directly to it

### 📤 Export Options
- **PDF Report** — styled A4 report with score box, stats, and sectional table (via jsPDF)
- **CSV Export** — all questions with section, status, correct/candidate option IDs, and marks
- **Share Card** — a 600×330px PNG score card, perfect for sharing on WhatsApp/Instagram (via html2canvas)

### 🎨 UI / Visual
- **Cyberpunk / Glitch** design system — neon green, magenta, cyan on void black
- **CRT scanline overlay** — retro terminal aesthetic
- **Chamfered corners** — 45° cut geometry on all cards and buttons
- **Glitch animation** on the brand title (chromatic aberration effect)
- **MATRIX / GHOST** theme toggle — neon green vs deep cyan palette
- Smooth hover glows, neon box-shadows, HUD corner brackets
- Fully **responsive** — works on mobile and desktop

### 📱 Mobile Support
- Slide-out sidebar drawer (hamburger menu)
- Responsive grid layouts for all screens
- Export buttons hidden on mobile to keep the topbar clean

### 💾 Session Persistence
- Your last session is saved to `localStorage`
- On next visit, a **restore banner** lets you reload your previous results instantly
- Sessions expire after 7 days automatically

### 🎉 Confetti
- If your score is **≥ 150**, a confetti burst fires automatically — because you earned it

---

## Supported File Types

| Format | Description |
|--------|-------------|
| `.html` / `.htm` | Full-page save from the MHT-CET Objection Tracker Portal |
| `.pdf` | PDF version of the portal response sheet |
| `.txt` | Pipe-delimited custom format (for advanced use) |

> **Tip:** The HTML file gives the most reliable parsing. If using PDF, question images are rendered directly from the PDF pages.

---

## How to Use

### Online (Netlify)
1. Visit the live link above
2. Select your stream: **PCM** (Phy · Chem · Math) or **PCB** (Phy · Chem · Bio)
3. Drag & drop or click to upload your response sheet file
4. Wait a few seconds while it parses and renders
5. Explore your dashboard

### Locally (offline)
1. Download / clone this repository
2. Open `index.html` in **Google Chrome**
3. That's it — no server, no install

> ⚠️ Chrome is recommended. Some browsers restrict local file access for PDF.js rendering.

---

## How to Get Your Response Sheet

1. Go to the **MHT-CET Objection Tracker Portal** (official website)
2. Log in with your application number and date of birth
3. Open your response sheet
4. **Save the page:** `Ctrl + S` → Save as **"Webpage, Complete"** (`.html`)
   - Or use the browser's **Print → Save as PDF** option

---

## Stream Mismatch Detection

The tool automatically detects if you upload the wrong stream's sheet:
- **PCM sheets** have 150 questions
- **PCB sheets** have 200 questions

If a mismatch is found, a popup appears letting you **switch stream and continue** or **re-upload** the correct file.

---

## Project Structure

```
project-folder/
├── index.html      # HTML structure (all screens, components, share card)
├── style.css       # Cyberpunk design system (tokens, animations, layout, responsive)
├── script.js       # All application logic (parsing, charts, export, session, UI)
└── README.md       # This file
```

> All three files must stay in the same folder.

---

## Tech Stack

| Library | Purpose | Source |
|---------|---------|--------|
| [Chart.js 4.4.1](https://www.chartjs.org/) | Donut & pie charts | CDN |
| [PDF.js 3.4.120](https://mozilla.github.io/pdf.js/) | PDF text extraction & rendering | CDN |
| [jsPDF 2.5.1](https://github.com/parallax/jsPDF) | PDF report generation | CDN |
| [html2canvas 1.4.1](https://html2canvas.hertzen.com/) | Share card screenshot | CDN |
| [canvas-confetti 1.9.3](https://github.com/catdad/canvas-confetti) | Celebration animation | CDN |
| Google Fonts | Orbitron, JetBrains Mono, Share Tech Mono | CDN |

No npm. No build tools. No framework. Pure HTML + CSS + JS.

---

## Scoring Logic

| Stream | Subject | Marks per Correct |
|--------|---------|-------------------|
| PCM | Physics | +1 |
| PCM | Chemistry | +1 |
| PCM | Mathematics | **+2** |
| PCB | Physics | +1 |
| PCB | Chemistry | +1 |
| PCB | Biology | +1 |

Incorrect and unattempted questions carry **0 marks** (no negative marking).

---

## Privacy

- ✅ 100% client-side — all processing happens in your browser
- ✅ No file is ever uploaded to any server
- ✅ No analytics, no tracking
- ✅ No account required
- ✅ Works fully offline after the page loads

---

## Known Limitations

- **Scanned PDFs** (image-only) cannot be parsed — use the HTML version instead
- Question images require the **PDF version** to be uploaded; HTML uploads show a placeholder
- Password-protected PDFs are not supported
- Works best in **Google Chrome** — Firefox may have issues with local PDF rendering

---

## Built By

**Swanand Jaju**
First Year · AIML
Walchand College of Engineering, Sangli

- GitHub: [@swanandjaju](https://github.com/swanandjaju)
- LinkedIn: [swanand-jaju](https://www.linkedin.com/in/swanand-jaju/)

> Built this tool to help MHT-CET students instantly analyze their response sheet — no third-party uploads, no waiting, fully private.

---

## License

This project is open source and free to use. If you find it helpful, consider giving it a ⭐ on GitHub!
