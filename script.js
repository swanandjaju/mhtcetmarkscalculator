/**
 * script.js — ExamAnalyzer Pro
 * All application logic extracted from cet_artdeco.html
 */

'use strict';

/* ═══════════════════════════════════════════════════════
   PDF.js WORKER SETUP
═══════════════════════════════════════════════════════ */
pdfjsLib.GlobalWorkerOptions.workerSrc =
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.worker.min.js';

/* ═══════════════════════════════════════════════════════
   STATE
═══════════════════════════════════════════════════════ */
let questions        = [];
let filteredQs       = [];
let currentQ         = 0;
let examMode         = 'PCM';
let donutChartInst   = null;
let subjectChartInsts = [];
let pdfPageImages    = {};
let questionImages   = {};
let questionPageMap  = {};
let _pendingQs       = null;
let _pendingFile     = '';

/* ═══════════════════════════════════════════════════════
   THEME MANAGEMENT
═══════════════════════════════════════════════════════ */
function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'dark';
  const next    = current === 'dark' ? 'light' : 'dark';
  applyTheme(next);
  localStorage.setItem('examTheme', next);
  if (questions.length) renderDashboard(questions);
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  const icon  = theme === 'dark' ? '◈ MTX' : '◈ GHO';
  const title = theme === 'dark' ? 'Switch to Ghost Mode' : 'Switch to Matrix Mode';
  ['uploadThemeBtn', 'dashThemeBtn'].forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.textContent = icon; el.title = title; }
  });
}

// Init theme from localStorage immediately
(function initTheme() {
  const saved = localStorage.getItem('examTheme') || 'dark';
  applyTheme(saved);
})();

/* ═══════════════════════════════════════════════════════
   MOBILE SIDEBAR DRAWER
═══════════════════════════════════════════════════════ */
function toggleSidebar() {
  document.getElementById('mainSidebar').classList.toggle('open');
  document.getElementById('sidebarOverlay').classList.toggle('open');
}
function closeSidebar() {
  document.getElementById('mainSidebar').classList.remove('open');
  document.getElementById('sidebarOverlay').classList.remove('open');
}

/* ═══════════════════════════════════════════════════════
   LIGHTBOX
═══════════════════════════════════════════════════════ */
function openLightbox(src) {
  document.getElementById('lightboxImg').src = src;
  document.getElementById('lightbox').classList.add('open');
  document.body.style.overflow = 'hidden';
}
function closeLightbox() {
  document.getElementById('lightbox').classList.remove('open');
  document.body.style.overflow = '';
  document.getElementById('lightboxImg').src = '';
}

/* ═══════════════════════════════════════════════════════
   CONFETTI (score ≥ 150)
═══════════════════════════════════════════════════════ */
function fireConfetti() {
  if (!window.confetti) return;
  const colors = ['#00ff88', '#ff00ff', '#00d4ff', '#ffffff', '#00ff8880'];
  confetti({ particleCount: 120, spread: 80,  origin: { y: 0.55 }, colors });
  setTimeout(() => confetti({ particleCount: 80, angle: 60,  spread: 60, origin: { x: 0 }, colors }), 350);
  setTimeout(() => confetti({ particleCount: 80, angle: 120, spread: 60, origin: { x: 1 }, colors }), 700);
}

/* ═══════════════════════════════════════════════════════
   LOCAL STORAGE — session persistence
═══════════════════════════════════════════════════════ */
function saveSession(filename, qs) {
  try {
    localStorage.setItem('examSession', JSON.stringify({
      questions: qs, examMode, filename, timestamp: Date.now()
    }));
  } catch (e) { /* quota exceeded — silently ignore */ }
}

function checkStoredSession() {
  try {
    const raw = localStorage.getItem('examSession');
    if (!raw) return;
    const data = JSON.parse(raw);
    // Expire after 7 days
    if (Date.now() - data.timestamp > 7 * 24 * 3600 * 1000) {
      localStorage.removeItem('examSession');
      return;
    }
    window._storedSession = data;
    const d    = new Date(data.timestamp);
    const info = `${data.filename}  ·  ${d.toLocaleDateString('en-IN')}  ·  ${data.examMode}  ·  ${data.questions.length} questions`;
    document.getElementById('restoreBannerInfo').textContent = info;
    document.getElementById('restoreBanner').style.display  = 'flex';
  } catch (e) {
    localStorage.removeItem('examSession');
  }
}

function restoreStoredSession() {
  if (!window._storedSession) return;
  const { questions: qs, examMode: em, filename } = window._storedSession;
  setMode(em);
  document.getElementById('restoreBanner').style.display = 'none';
  loadDash(filename, qs);
}

function dismissRestoreBanner() {
  document.getElementById('restoreBanner').style.display = 'none';
  localStorage.removeItem('examSession');
  window._storedSession = null;
}

/* ═══════════════════════════════════════════════════════
   CSV EXPORT
═══════════════════════════════════════════════════════ */
function exportCSV() {
  if (!questions.length) { alert('No data to export. Please upload a response sheet first.'); return; }
  const header = ['Q#', 'Section', 'Section Q#', 'Status', 'Correct Option ID', 'Candidate Option ID', 'Marks'];
  const rows   = questions.map(q => [
    q.id, q.section, q.sectionNum, q.status,
    q.correctOptId  || '',
    q.candidateOptId || '',
    q.marks
  ]);
  const csv   = [header, ...rows].map(r => r.map(v => `"${v}"`).join(',')).join('\n');
  const fname = document.getElementById('topbarFile').textContent.replace(/\.[^.]+$/, '') || 'exam';
  triggerDownload(`${fname}_analysis.csv`, 'text/csv;charset=utf-8;', '\uFEFF' + csv);
}

/* ═══════════════════════════════════════════════════════
   PDF EXPORT (jsPDF)
═══════════════════════════════════════════════════════ */
function exportPDF() {
  if (!questions.length) { alert('No data to export. Please upload a response sheet first.'); return; }
  if (!window.jspdf)     { alert('PDF library not loaded. Check your internet connection.');  return; }

  const { jsPDF } = window.jspdf;
  const doc   = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const st    = computeStats(questions);
  const fname = document.getElementById('topbarFile').textContent || 'Unknown File';
  const mode  = examMode;
  const date  = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' });

  const W = 210;
  const G = [0,255,136], D = [10,10,15], C = [224,224,224], P = [107,114,128];

  // Background
  doc.setFillColor(...D); doc.rect(0, 0, W, 297, 'F');

  // Top neon rule
  doc.setFillColor(...G); doc.rect(0, 0, W, 2.5, 'F');

  // Corner brackets
  doc.setDrawColor(...G); doc.setLineWidth(0.45);
  doc.line(10,10,10,18); doc.line(10,10,18,10);
  doc.line(200,10,192,10); doc.line(200,10,200,18);
  doc.line(10,287,10,279); doc.line(10,287,18,287);
  doc.line(200,287,200,279); doc.line(200,287,192,287);

  // Title
  doc.setTextColor(...G); doc.setFontSize(22); doc.setFont('times', 'normal');
  doc.text('EXAMANALYZER PRO', W / 2, 27, { align: 'center' });

  // Sub-title
  doc.setFontSize(8); doc.setTextColor(...P); doc.setFont('helvetica', 'normal');
  doc.text('MHT-CET PERFORMANCE ANALYSIS REPORT', W / 2, 34, { align: 'center' });

  // Horizontal rule
  doc.setDrawColor(...G); doc.setLineWidth(0.25); doc.line(20, 39, 190, 39);

  // File metadata
  doc.setTextColor(...C); doc.setFontSize(9);
  doc.text(`File:       ${fname}`, 22, 48);
  doc.text(`Mode:      ${mode}`,   22, 55);
  doc.text(`Date:       ${date}`,  22, 62);
  doc.text(`Questions:  ${questions.length}`, 120, 48);

  // Score box
  doc.setFillColor(28, 28, 28); doc.rect(20, 70, 170, 38, 'F');
  doc.setDrawColor(...G); doc.setLineWidth(0.3); doc.rect(20, 70, 170, 38, 'S');

  // Big score number
  doc.setTextColor(...G); doc.setFontSize(30); doc.setFont('times', 'normal');
  doc.text(`${st.earned}`, W / 2 - 10, 94, { align: 'center' });
  doc.setFontSize(15); doc.setTextColor(120, 110, 80);
  doc.text(`/ ${st.maxM}`, W / 2 + 14, 94);
  doc.setFontSize(7); doc.setTextColor(...P); doc.setFont('helvetica', 'normal');
  doc.text('TOTAL SCORE', W / 2, 103, { align: 'center' });

  // Stats row
  const stats = [
    { lbl: 'CORRECT',     val: `${st.correct}`,     col: [0,255,136]   },
    { lbl: 'INCORRECT',   val: `${st.incorrect}`,   col: [255,51,102]  },
    { lbl: 'UNATTEMPTED', val: `${st.unattempted}`, col: [107,114,128] },
    { lbl: 'ACCURACY',    val: `${st.accuracy}%`,   col: [...G]        },
  ];
  stats.forEach((s, i) => {
    const x = 20 + i * 42.5;
    doc.setFillColor(28, 28, 28); doc.rect(x, 118, 40, 20, 'F');
    doc.setDrawColor(55, 50, 35); doc.setLineWidth(0.15); doc.rect(x, 118, 40, 20, 'S');
    doc.setTextColor(...s.col); doc.setFontSize(13); doc.setFont('times', 'normal');
    doc.text(s.val, x + 20, 128, { align: 'center' });
    doc.setFontSize(6.5); doc.setTextColor(...P); doc.setFont('helvetica', 'normal');
    doc.text(s.lbl, x + 20, 134, { align: 'center' });
  });

  // Section divider
  doc.setDrawColor(...G); doc.setLineWidth(0.25); doc.line(20, 148, 190, 148);
  doc.setTextColor(...G); doc.setFontSize(9); doc.setFont('helvetica', 'bold');
  doc.text('SECTIONAL BREAKDOWN', 22, 157);
  doc.line(20, 162, 190, 162);

  // Table header
  doc.setTextColor(...P); doc.setFontSize(7.5); doc.setFont('helvetica', 'normal');
  doc.text('SUBJECT',   22, 169); doc.text('TOTAL',     90, 169);
  doc.text('CORRECT',  115, 169); doc.text('INCORRECT', 142, 169); doc.text('SCORE', 178, 169);
  doc.setDrawColor(50, 46, 35); doc.setLineWidth(0.2); doc.line(20, 172, 190, 172);

  const SC = { Physics: [0,212,255], Chemistry: [255,0,255], Mathematics: [...G], Biology: [0,212,255] };
  let ry = 180;
  st.subStats.forEach(s => {
    const total = questions.filter(q => q.section === s.s).length;
    const wrong = questions.filter(q => q.section === s.s && q.status === 'incorrect').length;
    const col   = SC[s.s] || [...G];
    doc.setTextColor(...col); doc.setFontSize(9); doc.setFont('helvetica', 'bold');
    doc.text(s.s, 22, ry);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...C);    doc.text(String(total), 93, ry);
    doc.setTextColor(0,255,136);   doc.text(String(s.c),  120, ry);
    doc.setTextColor(255,51,102);  doc.text(String(wrong), 148, ry);
    doc.setTextColor(...G);    doc.text(`${s.e}/${s.mx}`, 178, ry);
    ry += 9;
    doc.setDrawColor(38, 35, 26); doc.setLineWidth(0.12); doc.line(20, ry - 3, 190, ry - 3);
  });

  // Footer
  doc.setDrawColor(...G); doc.setLineWidth(0.25); doc.line(20, 276, 190, 276);
  doc.setTextColor(80, 72, 55); doc.setFontSize(7);
  doc.text('Generated by ExamAnalyzer Pro · Built by Swanand Jaju · WCE Sangli', W / 2, 282, { align: 'center' });
  doc.text('All processing is done locally. No personal data is uploaded or stored.',   W / 2, 287, { align: 'center' });

  doc.save(`ExamReport_${mode}_${Date.now()}.pdf`);
}

/* ═══════════════════════════════════════════════════════
   SHARE CARD (html2canvas → PNG download)
═══════════════════════════════════════════════════════ */
async function generateShareCard() {
  if (!questions.length)    { alert('No data to share. Upload a response sheet first.'); return; }
  if (!window.html2canvas)  { alert('html2canvas not loaded. Check your connection.');  return; }

  const st   = computeStats(questions);
  const card = document.getElementById('shareCardEl');

  document.getElementById('scScore').textContent     = st.earned;
  document.getElementById('scMax').textContent       = st.maxM;
  document.getElementById('scMode').textContent      = examMode;
  document.getElementById('scCorrect').textContent   = st.correct;
  document.getElementById('scIncorrect').textContent = st.incorrect;
  document.getElementById('scAccuracy').textContent  = st.accuracy + '%';
  document.getElementById('scDate').textContent      = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  document.getElementById('scSubjects').textContent  = st.subStats.map(s => `${s.s.substring(0, 5)}: ${s.e}/${s.mx}`).join('  ·  ');

  card.style.display = 'block';
  try {
    const canvas = await html2canvas(card, {
      scale: 2, width: 600, height: 330,
      backgroundColor: '#0a0a0f', logging: false, useCORS: true, allowTaint: true
    });
    const link = document.createElement('a');
    link.download = `score_card_${examMode}_${st.earned}_${Date.now()}.png`;
    link.href     = canvas.toDataURL('image/png');
    link.click();
  } catch (e) {
    alert('Could not generate share card: ' + e.message);
  } finally {
    card.style.display = 'none';
  }
}

/* ═══════════════════════════════════════════════════════
   DOWNLOAD HELPER
═══════════════════════════════════════════════════════ */
function triggerDownload(filename, mime, content) {
  const blob = new Blob([content], { type: mime });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/* ═══════════════════════════════════════════════════════
   DRAG & DROP with filename preview
═══════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', function () {
  const dz = document.getElementById('dropZone');

  dz.addEventListener('dragover', e => {
    e.preventDefault();
    dz.classList.add('drag');
  });

  dz.addEventListener('dragleave', () => {
    dz.classList.remove('drag');
    document.getElementById('dragPreview').textContent = '';
  });

  dz.addEventListener('dragenter', e => {
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      const item = e.dataTransfer.items[0];
      if (item.kind === 'file') {
        const f = item.getAsFile ? item.getAsFile() : null;
        document.getElementById('dragPreview').textContent = f ? '📄 ' + f.name : '📄 Drop to analyze';
      }
    }
  });

  dz.addEventListener('drop', e => {
    e.preventDefault();
    dz.classList.remove('drag');
    document.getElementById('dragPreview').textContent = '';
    const f = e.dataTransfer.files[0];
    if (f) processFile(f);
  });

  // Image area click → lightbox
  document.getElementById('qImgArea').addEventListener('click', function (e) {
    if (e.target.tagName === 'IMG') openLightbox(e.target.src);
  });

  // Check for a stored session
  checkStoredSession();
});

function handleFile(inp) {
  if (inp.files[0]) processFile(inp.files[0]);
}

function setMode(m) {
  examMode = m;
  document.getElementById('btnPCM').classList.toggle('active', m === 'PCM');
  document.getElementById('btnPCB').classList.toggle('active', m === 'PCB');
}

/* ═══════════════════════════════════════════════════════
   CORE PARSER (HTML / text)
═══════════════════════════════════════════════════════ */
function parsePortalText(text) {
  const CORR_RE = /Correct\s+Option\s*[:\s]\s*(\d{5,6})/gi;

  const corrMatches = [...text.matchAll(CORR_RE)];
  if (corrMatches.length === 0) return [];

  const qs = [];
  let physN = 0, chemN = 0, mathN = 0, bioN = 0;
  let prevQEndIdx = 0;

  for (let i = 0; i < corrMatches.length; i++) {
    const corrM        = corrMatches[i];
    const correctOptId = corrM[1];

    const afterCorr    = text.substring(corrM.index, corrM.index + 200);
    const candInLine   = afterCorr.match(/Candidate\s+Res\w*\s*[:\s]\s*(\d+)/i);
    const rawCand      = candInLine ? candInLine[1] : '0';
    const candidateOptId = (rawCand === '0' || rawCand === '') ? null : rawCand;

    const block = text.substring(prevQEndIdx, corrM.index);

    prevQEndIdx = candInLine
      ? corrM.index + candInLine.index + candInLine[0].length
      : corrM.index + corrM[0].length;

    const qidMatches = [...block.matchAll(/\b(2\d{5})\b/g)];
    const qid = qidMatches.length > 0
      ? qidMatches[qidMatches.length - 1][1]
      : String(i + 1);

    const sectM   = block.match(/\b(Physics|Chemistry|Mathematics|Biology)\b/i);
    const section = sectM ? sectM[1]
      : (qs.length < 50 ? 'Physics' : qs.length < 100 ? 'Chemistry'
        : examMode === 'PCB' ? 'Biology' : 'Mathematics');

    const optIds = [...new Set(
      [...block.matchAll(/\b(3\d{5})\b/g)].map(m => m[1])
    )].sort((a, b) => parseInt(a) - parseInt(b));

    const idToLabel = {};
    optIds.forEach((id, idx) => { idToLabel[id] = ['A', 'B', 'C', 'D'][idx] || String(idx + 1); });

    const correctLabel   = idToLabel[correctOptId]   || null;
    const candidateLabel = candidateOptId ? (idToLabel[candidateOptId] || null) : null;

    let status;
    if (!candidateOptId)                      status = 'unattempted';
    else if (candidateOptId === correctOptId) status = 'correct';
    else                                      status = 'incorrect';

    const marks = status === 'correct'
      ? (examMode === 'PCM' && section === 'Mathematics' ? 2 : 1)
      : 0;

    if      (section === 'Physics')   physN++;
    else if (section === 'Chemistry') chemN++;
    else if (section === 'Biology')   bioN++;
    else                              mathN++;

    const sectionNum = section === 'Physics'   ? physN
      : section === 'Chemistry' ? chemN
      : section === 'Biology'   ? bioN : mathN;

    qs.push({
      id: qs.length + 1, qid, section, sectionNum,
      text: `Q${qs.length + 1}`, correctLabel, candidateLabel,
      correctOptId, candidateOptId, status, marks
    });
  }
  return qs;
}

/* ═══════════════════════════════════════════════════════
   PIPE-DELIMITED PARSER (.txt)
═══════════════════════════════════════════════════════ */
function parseRawData(raw) {
  const lines = raw.trim().split('\n');
  const qs = [];
  let physN = 0, chemN = 0, mathN = 0, bioN = 0;

  lines.forEach(line => {
    const parts = line.split('|');
    if (parts.length < 8) return;
    const [qid, section, text, ...rest] = parts;
    const correctOptId   = rest[rest.length - 2];
    const candidateOptId = rest[rest.length - 1].trim();
    const optionParts    = rest.slice(0, rest.length - 2);
    const options = optionParts.map((op, i) => {
      const ci = op.indexOf(':');
      return { id: op.substring(0, ci), text: op.substring(ci + 1), label: ['A','B','C','D'][i] };
    });

    let sectionNum;
    if      (section === 'Physics')   { physN++; sectionNum = physN; }
    else if (section === 'Chemistry') { chemN++; sectionNum = chemN; }
    else if (section === 'Biology')   { bioN++;  sectionNum = bioN;  }
    else                              { mathN++; sectionNum = mathN; }

    const correctOpt   = options.find(o => o.id === correctOptId);
    const candidateOpt = candidateOptId === 'null' ? null : options.find(o => o.id === candidateOptId);

    let status;
    if (!candidateOpt)                                           status = 'unattempted';
    else if (candidateOpt && correctOpt && candidateOpt.id === correctOpt.id) status = 'correct';
    else                                                         status = 'incorrect';

    const marks = status === 'correct' ? (examMode === 'PCM' && section === 'Mathematics' ? 2 : 1) : 0;

    qs.push({
      id: qs.length + 1, qid: qid.trim(), section, sectionNum, text,
      correctLabel:   correctOpt   ? correctOpt.label   : null,
      candidateLabel: candidateOpt ? candidateOpt.label : null,
      correctOptId,
      candidateOptId: candidateOptId === 'null' ? null : candidateOptId,
      status, marks
    });
  });
  return qs;
}

/* ═══════════════════════════════════════════════════════
   IMPROVED ERROR MESSAGES
═══════════════════════════════════════════════════════ */
function classifyUploadError(file, err) {
  const name = file.name.toLowerCase();
  if (!name.match(/\.(html?|pdf|txt)$/)) {
    return `Unsupported file type: "${file.name}".\n\nPlease upload one of:\n• .html / .htm — MHT-CET portal response sheet\n• .pdf — PDF version of the portal sheet\n• .txt — Pipe-delimited export`;
  }
  if (name.endsWith('.pdf') && err.message.includes('No questions')) {
    return `No questions found in your PDF.\n\nPossible reasons:\n• The PDF may be scanned (image-only), try the HTML version instead\n• This doesn't appear to be an MHT-CET Objection Portal response sheet\n• The PDF may be password-protected`;
  }
  if ((name.endsWith('.html') || name.endsWith('.htm')) && err.message.includes('No questions')) {
    return `No questions found in your HTML file.\n\nPossible reasons:\n• Make sure you saved the full page from the MHT-CET Objection Tracker Portal\n• The page may have been saved incorrectly — try "Save As > Webpage, Complete"`;
  }
  if (name.endsWith('.txt') && err.message.includes('pipe')) {
    return `Could not read the .txt file.\n\nExpected pipe-delimited format:\nqid|section|text|optId:text|...|correctOptId|candidateOptId`;
  }
  return '❌ ' + (err.message || 'An unknown error occurred.');
}

/* ═══════════════════════════════════════════════════════
   PROCESS FILE
═══════════════════════════════════════════════════════ */
async function processFile(file) {
  showLoading();
  pdfPageImages   = {};
  questionPageMap = {};

  const isPDF = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
  const isTXT = file.name.toLowerCase().endsWith('.txt');

  try {
    if (isPDF) {
      await processPDF(file);
    } else if (isTXT) {
      setStep('Reading file…', '');
      const text = await file.text();
      const qs   = parseRawData(text);
      if (!qs.length) throw new Error('No pipe-delimited rows found in the .txt file.');
      finish(file.name, qs);
    } else {
      setStep('Reading HTML…', '');
      const raw  = await file.text();
      extractHTMLImages(raw);
      const div  = document.createElement('div');
      div.innerHTML = raw;
      const text = div.textContent || div.innerText || '';
      setStep('Parsing questions…', 'Scanning for Correct Option / Candidate Response pairs');
      const qs   = parsePortalText(text);
      if (!qs.length) throw new Error('No questions found.\n\nMake sure you uploaded the MHT-CET Objection Tracker Portal response sheet.');
      finish(file.name, qs);
    }
  } catch (err) {
    console.error(err);
    alert(classifyUploadError(file, err));
    resetApp();
  }
}

function extractHTMLImages(htmlText) {
  // Placeholder — portal images are relative paths that won't resolve externally
}

/* ═══════════════════════════════════════════════════════
   PDF PROCESSING
═══════════════════════════════════════════════════════ */
async function processPDF(file) {
  setStep('Loading PDF…', 'Reading file');
  const buf = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
  const N   = pdf.numPages;
  const SCALE = 1.8;

  setStep('Extracting text…', `0 / ${N} pages`);
  let fullText  = '';
  const pageOffsets    = [];
  const corrOptYByPage = {};

  for (let p = 1; p <= N; p++) {
    setStep('Extracting text…', `${p} / ${N} pages`);
    const page  = await pdf.getPage(p);
    const tc    = await page.getTextContent();
    const vp1   = page.getViewport({ scale: 1 });
    const pageH = vp1.height;
    const byY   = {};

    for (const it of tc.items) {
      if (!it.str.trim()) continue;
      const y = Math.round(it.transform[5]);
      if (!byY[y]) byY[y] = { text: '', y_pdf: it.transform[5] };
      byY[y].text += it.str;
    }

    corrOptYByPage[p] = [];
    for (const row of Object.values(byY)) {
      if (/Correct\s+Option/i.test(row.text)) {
        corrOptYByPage[p].push({ y_pdf: row.y_pdf, pageH_pdf: pageH });
      }
    }
    corrOptYByPage[p].sort((a, b) => b.y_pdf - a.y_pdf);

    const items = tc.items.filter(i => i.str.trim());
    items.sort((a, b) => {
      const dy = Math.round(b.transform[5]) - Math.round(a.transform[5]);
      return dy !== 0 ? dy : a.transform[4] - b.transform[4];
    });
    pageOffsets[p] = fullText.length;
    fullText += items.map(i => i.str).join(' ') + '\n';
  }

  setStep('Parsing questions…', 'Scanning for Correct Option / Candidate Response pairs');
  const qs = parsePortalText(fullText);
  if (!qs.length) throw new Error('No questions found in PDF.\n\nMake sure you uploaded the MHT-CET Objection Tracker Portal response sheet.');

  const CORR_RE    = /Correct\s+Option\s*[:\s]\s*(\d{5,6})/gi;
  const corrMatches = [...fullText.matchAll(CORR_RE)];
  corrMatches.forEach((match, idx) => {
    if (!qs[idx]) return;
    let page = 1;
    for (let p = 1; p <= N; p++) {
      if (pageOffsets[p] <= match.index) page = p;
      else break;
    }
    questionPageMap[qs[idx].id] = page;
  });

  const boundaryPositions = new Array(qs.length).fill(null);
  const pageQIdx = {};
  for (let qi = 0; qi < qs.length; qi++) {
    const p = questionPageMap[qs[qi].id];
    if (!p) continue;
    if (pageQIdx[p] === undefined) pageQIdx[p] = 0;
    const corrYs = corrOptYByPage[p] || [];
    const j = pageQIdx[p];
    if (j < corrYs.length) boundaryPositions[qi] = { page: p, ...corrYs[j] };
    pageQIdx[p]++;
  }

  const LINE_H          = Math.round(18 * SCALE);
  const renderedCanvases = {};
  setStep('Rendering pages…', `0 / ${N}`);

  for (let p = 1; p <= N; p++) {
    setStep('Rendering pages…', `${p} / ${N}`);
    const page = await pdf.getPage(p);
    const vp   = page.getViewport({ scale: SCALE });
    const c    = document.createElement('canvas');
    c.width = vp.width; c.height = vp.height;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
    await page.render({ canvasContext: ctx, viewport: vp }).promise;
    renderedCanvases[p] = c;
  }

  setStep('Cropping questions…', '');
  for (let qi = 0; qi < qs.length; qi++) {
    const endBound   = boundaryPositions[qi];
    const startBound = qi > 0 ? boundaryPositions[qi - 1] : null;
    if (!endBound) continue;

    const boundY       = b => Math.round((b.pageH_pdf - b.y_pdf) * SCALE) + LINE_H;
    const endPage      = endBound.page;
    const endCanvasY   = boundY(endBound);
    const startPage    = startBound ? startBound.page : 1;
    const startCanvasY = startBound ? boundY(startBound) : 0;
    const strips = [];

    if (startPage === endPage) {
      const c = renderedCanvases[startPage];
      if (c) strips.push({ canvas: c, sy: Math.max(0, startCanvasY), ey: Math.min(c.height, endCanvasY) });
    } else {
      const cs = renderedCanvases[startPage];
      if (cs) strips.push({ canvas: cs, sy: Math.max(0, startCanvasY), ey: cs.height });
      for (let p = startPage + 1; p < endPage; p++) {
        const ci = renderedCanvases[p];
        if (ci) strips.push({ canvas: ci, sy: 0, ey: ci.height });
      }
      const ce = renderedCanvases[endPage];
      if (ce) strips.push({ canvas: ce, sy: 0, ey: Math.min(ce.height, endCanvasY) });
    }

    let totalH = 0, maxW = 0;
    for (const s of strips) { totalH += Math.max(0, s.ey - s.sy); maxW = Math.max(maxW, s.canvas.width); }
    if (totalH <= 0 || maxW <= 0) continue;

    const out  = document.createElement('canvas');
    out.width  = maxW; out.height = totalH;
    const octx = out.getContext('2d');
    octx.fillStyle = '#fff'; octx.fillRect(0, 0, maxW, totalH);
    let yy = 0;
    for (const s of strips) {
      const h = Math.max(0, s.ey - s.sy);
      if (h > 0) { octx.drawImage(s.canvas, 0, s.sy, s.canvas.width, h, 0, yy, s.canvas.width, h); yy += h; }
    }
    questionImages[qs[qi].id] = out.toDataURL('image/jpeg', 0.87);
  }

  for (const c of Object.values(renderedCanvases)) { c.width = 0; c.height = 0; }
  finish(file.name, qs);
}

/* ═══════════════════════════════════════════════════════
   FINISH / MISMATCH GUARD
═══════════════════════════════════════════════════════ */
function finish(filename, qs) {
  const oppositeMode  = examMode === 'PCM' ? 'PCB' : 'PCM';
  const oppositeCount = examMode === 'PCM' ? 200   : 150;
  if (qs.length === oppositeCount) { showMismatchPopup(filename, qs, oppositeMode); return; }
  loadDash(filename, qs);
}

function loadDash(filename, qs) {
  document.getElementById('topbarFile').textContent = filename;
  document.getElementById('topbarMode').textContent = examMode;
  setStep('Done!', `${qs.length} questions loaded`);
  setTimeout(() => showDash(qs), 200);
}

function showMismatchPopup(filename, qs, correctMode) {
  _pendingQs   = qs;
  _pendingFile = filename;
  const wrongMode    = examMode;
  const correctCount = correctMode === 'PCM' ? 150 : 200;
  document.getElementById('mismatchMsg').textContent =
    `You selected ${wrongMode} but this response sheet contains ${qs.length} questions, which matches a ${correctMode} sheet. Scoring rules are different — please use the correct stream.`;
  document.getElementById('mismatchBadge').textContent =
    `${qs.length} questions detected · ${correctMode} sheets have ${correctCount} questions`;
  document.getElementById('mismatchSwitchBtn').textContent  = `Switch to ${correctMode} & Continue →`;
  document.getElementById('mismatchSwitchBtn').dataset.mode = correctMode;
  document.getElementById('loadingScreen').style.display = 'none';
  document.getElementById('mismatchOverlay').classList.add('open');
}

function mismatchSwitchAndContinue() {
  const correctMode = document.getElementById('mismatchSwitchBtn').dataset.mode;
  document.getElementById('mismatchOverlay').classList.remove('open');
  setMode(correctMode);
  _pendingQs.forEach(q => {
    q.marks = q.status === 'correct'
      ? (correctMode === 'PCM' && q.section === 'Mathematics' ? 2 : 1)
      : 0;
  });
  loadDash(_pendingFile, _pendingQs);
}

function mismatchReupload() {
  document.getElementById('mismatchOverlay').classList.remove('open');
  _pendingQs   = null;
  _pendingFile = '';
  resetApp();
}

/* ═══════════════════════════════════════════════════════
   STATS COMPUTATION
═══════════════════════════════════════════════════════ */
function computeStats(qs) {
  const correct     = qs.filter(q => q.status === 'correct').length;
  const incorrect   = qs.filter(q => q.status === 'incorrect').length;
  const unattempted = qs.filter(q => q.status === 'unattempted').length;
  const earned      = qs.reduce((s, q) => s + q.marks, 0);
  const maxM        = qs.reduce((s, q) => s + (q.section === 'Mathematics' ? 2 : 1), 0) || 200;
  const accuracy    = Math.round(correct / (correct + incorrect || 1) * 100);
  const secs        = [...new Set(qs.map(q => q.section))];
  const subStats    = secs.map(s => {
    const sq = qs.filter(q => q.section === s);
    const e  = sq.reduce((sm, q) => sm + q.marks, 0);
    const mx = sq.reduce((sm, q) => sm + (q.section === 'Mathematics' && examMode === 'PCM' ? 2 : 1), 0);
    return { s, c: sq.filter(q => q.status === 'correct').length, e, mx, pct: mx ? Math.round(e / mx * 100) : 0 };
  });
  return { correct, incorrect, unattempted, earned, maxM, accuracy, subStats };
}

/* ═══════════════════════════════════════════════════════
   RENDER DASHBOARD
═══════════════════════════════════════════════════════ */
function renderDashboard(qs) {
  questions  = qs;
  filteredQs = [...qs];
  const st         = computeStats(qs);
  const unatColor  = getComputedStyle(document.documentElement).getPropertyValue('--unat-chart').trim() || '#1c1c2e';

  // Metric cards with tooltips
  document.getElementById('metricsGrid').innerHTML = `
    <div class="metric-card" data-tooltip="out of ${st.maxM} total marks">
      <div class="metric-val mv-blue">${st.earned}<span style="font-size:15px;font-weight:400;color:var(--text3);font-family:var(--font-body)">/${st.maxM}</span></div>
      <div class="metric-lbl">Total Score</div>
    </div>
    <div class="metric-card" data-tooltip="out of ${qs.length} questions">
      <div class="metric-val mv-green">${st.correct}</div>
      <div class="metric-lbl">Correct</div>
    </div>
    <div class="metric-card" data-tooltip="out of ${qs.length} questions">
      <div class="metric-val mv-red">${st.incorrect}</div>
      <div class="metric-lbl">Incorrect</div>
    </div>
    <div class="metric-card" data-tooltip="based on attempted questions only">
      <div class="metric-val mv-amber">${st.accuracy}%</div>
      <div class="metric-lbl">Accuracy</div>
    </div>`;

  // Main donut chart
  if (donutChartInst) donutChartInst.destroy();
  const ctx = document.getElementById('donutChart').getContext('2d');
  donutChartInst = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['Correct', 'Incorrect', 'Unattempted'],
      datasets: [{ data: [st.correct, st.incorrect, st.unattempted], backgroundColor: ['#00ff88', '#ff3366', unatColor], borderWidth: 0, hoverOffset: 6 }]
    },
    options: {
      responsive: true, maintainAspectRatio: false, cutout: '74%',
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => `${c.label}: ${c.parsed}` } } }
    }
  });
  document.getElementById('donutPct').textContent = st.accuracy + '%';
  document.getElementById('donutLegend').innerHTML = `
    <span style="display:flex;align-items:center;gap:5px"><span style="width:7px;height:7px;background:#00ff88;display:inline-block"></span>${st.correct} correct</span>
    <span style="display:flex;align-items:center;gap:5px"><span style="width:7px;height:7px;background:#ff3366;display:inline-block"></span>${st.incorrect} wrong</span>
    <span style="display:flex;align-items:center;gap:5px"><span style="width:7px;height:7px;background:${unatColor};border:1px solid rgba(0,255,136,0.15);display:inline-block"></span>${st.unattempted} skipped</span>`;

  // Sectional bar chart
  const SC = { Physics: '#00d4ff', Chemistry: '#ff00ff', Mathematics: '#00ff88', Biology: '#00d4ff' };
  document.getElementById('subjectBars').innerHTML = st.subStats.map(s => `
    <div class="bar-row">
      <div class="bar-rowlbl">${s.s.substring(0, 5)}</div>
      <div class="bar-track"><div class="bar-fill" style="width:${s.pct}%;background:${SC[s.s] || '#00ff88'}"></div></div>
      <div class="bar-pct">${s.e}/${s.mx}</div>
    </div>`).join('');

  renderSubjectCharts(qs, unatColor);
  renderGrid(qs);
  updateFilterCounts(qs);
  showQuestion(0);
}

/* ═══════════════════════════════════════════════════════
   SUBJECT PIE CHARTS
═══════════════════════════════════════════════════════ */
function renderSubjectCharts(qs, unatColor) {
  subjectChartInsts.forEach(c => c.destroy());
  subjectChartInsts = [];

  const secs    = [...new Set(qs.map(q => q.section))];
  const ordered = ['Physics', 'Chemistry', 'Mathematics', 'Biology'].filter(s => secs.includes(s));
  const SC      = { Physics: '#00d4ff', Chemistry: '#ff00ff', Mathematics: '#00ff88', Biology: '#00d4ff' };
  const grid    = document.getElementById('subjectChartsGrid');

  grid.style.display             = 'grid';
  grid.style.gridTemplateColumns = `repeat(${Math.min(ordered.length, 4)}, 1fr)`;
  grid.innerHTML = '';

  ordered.forEach(section => {
    const sq    = qs.filter(q => q.section === section);
    const c     = sq.filter(q => q.status === 'correct').length;
    const w     = sq.filter(q => q.status === 'incorrect').length;
    const u     = sq.filter(q => q.status === 'unattempted').length;
    const earned = sq.reduce((s, q) => s + q.marks, 0);
    const max    = sq.reduce((s, q) => s + (q.section === 'Mathematics' && examMode === 'PCM' ? 2 : 1), 0);
    const pct    = max ? Math.round(earned / max * 100) : 0;
    const color  = SC[section] || '#00ff88';
    const cid    = `sc_${section.replace(/\s/g, '_')}`;

    const div = document.createElement('div');
    div.className = 'chart-card';
    div.innerHTML = `
      <div class="chart-title">${section} Accuracy</div>
      <div class="donut-wrap">
        <canvas id="${cid}"></canvas>
        <div class="donut-center">
          <div class="donut-pct" style="color:${color};font-size:22px">${pct}%</div>
          <div class="donut-sub">${earned}/${max} marks</div>
        </div>
      </div>
      <div style="display:flex;gap:.6rem;justify-content:center;margin-top:.75rem;font-size:11px;color:var(--text2);font-weight:500;letter-spacing:.05em;flex-wrap:wrap">
        <span style="display:flex;align-items:center;gap:4px"><span style="width:7px;height:7px;background:#00ff88;display:inline-block"></span>${c}</span>
        <span style="display:flex;align-items:center;gap:4px"><span style="width:7px;height:7px;background:#ff3366;display:inline-block"></span>${w}</span>
        <span style="display:flex;align-items:center;gap:4px"><span style="width:7px;height:7px;background:${unatColor || '#1c1c2e'};border:1px solid rgba(0,255,136,.15);display:inline-block"></span>${u}</span>
      </div>`;
    grid.appendChild(div);

    const inst = new Chart(document.getElementById(cid).getContext('2d'), {
      type: 'doughnut',
      data: {
        labels: ['Correct', 'Incorrect', 'Unattempted'],
        datasets: [{ data: [c, w, u], backgroundColor: [color, '#ff3366', unatColor || '#1c1c2e'], borderWidth: 0, hoverOffset: 4 }]
      },
      options: {
        responsive: true, maintainAspectRatio: false, cutout: '72%',
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => `${ctx.label}: ${ctx.parsed}` } } }
      }
    });
    subjectChartInsts.push(inst);
  });
}

/* ═══════════════════════════════════════════════════════
   RENDER SIDEBAR GRID
═══════════════════════════════════════════════════════ */
function renderGrid(qs) {
  const secs    = [...new Set(qs.map(q => q.section))];
  const ordered = ['Physics', 'Chemistry', 'Mathematics', 'Biology'].filter(s => secs.includes(s));
  document.getElementById('gridContainer').innerHTML = ordered.map(s => {
    const sq = qs.filter(q => q.section === s);
    return `<div class="subject-group">
      <div class="subject-label">${s}</div>
      <div class="q-grid">${sq.map(q =>
        `<button class="q-btn ${q.status}" id="qbtn-${q.id - 1}"
          onclick="jumpToQ(${q.id - 1});closeSidebar()"
          title="${s} Q${q.sectionNum}: ${q.status}">${q.sectionNum}</button>`
      ).join('')}</div>
    </div>`;
  }).join('');
}

/* ═══════════════════════════════════════════════════════
   SHOW QUESTION
═══════════════════════════════════════════════════════ */
function showQuestion(idx, scroll) {
  if (idx < 0 || idx >= filteredQs.length) return;
  currentQ = idx;
  const q  = filteredQs[idx];

  document.querySelectorAll('.q-btn.active').forEach(b => b.classList.remove('active'));
  const btn = document.getElementById('qbtn-' + (q.id - 1));
  if (btn) { btn.classList.add('active'); btn.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }

  document.getElementById('qNum').textContent = `Q${q.id} · ${q.section} ${q.sectionNum}`;

  const badge = document.getElementById('qBadge');
  badge.className   = 'q-badge ' + (q.status === 'correct' ? 'badge-correct' : q.status === 'incorrect' ? 'badge-incorrect' : 'badge-unattempted');
  badge.textContent = q.status.charAt(0).toUpperCase() + q.status.slice(1);

  const pill = document.getElementById('marksPill');
  pill.textContent = q.marks > 0 ? `+${q.marks}` : String(q.marks);
  pill.className   = 'marks-pill ' + (q.marks > 0 ? 'marks-pos' : 'marks-zero');

  const imgArea = document.getElementById('qImgArea');
  const img     = questionImages[q.id] || null;
  imgArea.innerHTML = img
    ? `<img src="${img}" alt="Q${q.id}" class="zoomable-img" title="Click to zoom">`
    : `<div class="q-img-placeholder">Question image not available<br><small style="font-size:11px;margin-top:4px;display:block">Upload the PDF version for image previews</small></div>`;

  const si = document.getElementById('selIcon'), sv = document.getElementById('badgeSelected');
  const ci = document.getElementById('corIcon'), cv = document.getElementById('badgeCorrect');

  ci.className = 'ans-icon ia'; ci.innerHTML = '<span>✓</span>';
  cv.className = 'ans-val va';  cv.textContent = q.correctOptId || '—';

  if (q.status === 'correct') {
    si.className = 'ans-icon ic'; si.innerHTML = '<span>✓</span>';
    sv.className = 'ans-val vc'; sv.textContent = q.candidateOptId || '—';
    ci.className = 'ans-icon ic'; cv.className = 'ans-val vc';
  } else if (q.status === 'incorrect') {
    si.className = 'ans-icon iw'; si.innerHTML = '<span>✗</span>';
    sv.className = 'ans-val vw'; sv.textContent = q.candidateOptId || '—';
  } else {
    si.className = 'ans-icon is'; si.innerHTML = '<span>—</span>';
    sv.className = 'ans-val vs'; sv.textContent = 'Not Answered';
  }

  document.getElementById('qOf').textContent = `${idx + 1} / ${filteredQs.length}`;

  if (scroll) {
    const contentEl = document.querySelector('.content');
    const qViewerEl = document.getElementById('qViewer');
    const targetTop = qViewerEl.getBoundingClientRect().top - contentEl.getBoundingClientRect().top + contentEl.scrollTop;
    contentEl.scrollTo({ top: targetTop, behavior: 'smooth' });
  }
}

function prevQ()  { if (currentQ > 0)                    showQuestion(currentQ - 1); }
function nextQ()  { if (currentQ < filteredQs.length - 1) showQuestion(currentQ + 1); }

function jumpToQ(gi) {
  const q  = questions[gi];
  const fi = filteredQs.findIndex(fq => fq.id === q.id);
  if (fi >= 0) { showQuestion(fi, true); return; }
  setFilter('all', document.querySelector('[data-filter="all"]'));
  const ni = filteredQs.findIndex(fq => fq.id === q.id);
  if (ni >= 0) showQuestion(ni, true);
}

function updateFilterCounts(qs) {
  const c = qs.filter(q => q.status === 'correct').length;
  const i = qs.filter(q => q.status === 'incorrect').length;
  const u = qs.filter(q => q.status === 'unattempted').length;
  document.querySelector('[data-filter="all"]').textContent         = `All (${qs.length})`;
  document.querySelector('[data-filter="correct"]').textContent     = `Correct (${c})`;
  document.querySelector('[data-filter="incorrect"]').textContent   = `Incorrect (${i})`;
  document.querySelector('[data-filter="unattempted"]').textContent = `Unattempted (${u})`;
}

function setFilter(f, btn) {
  document.querySelectorAll('.filter-bar .btn-ghost').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  filteredQs = f === 'all' ? [...questions] : questions.filter(q => q.status === f);
  showQuestion(0);
}

/* ═══════════════════════════════════════════════════════
   KEYBOARD SHORTCUTS
═══════════════════════════════════════════════════════ */
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { closeLightbox(); closeSidebar(); }
  if (document.getElementById('lightbox').classList.contains('open')) return;
  if (e.key === 'ArrowLeft')  prevQ();
  if (e.key === 'ArrowRight') nextQ();
});

/* ═══════════════════════════════════════════════════════
   SCREEN STATE MANAGEMENT
═══════════════════════════════════════════════════════ */
function showLoading() {
  document.getElementById('uploadScreen').style.display  = 'none';
  document.getElementById('loadingScreen').style.display = 'flex';
  document.getElementById('dashboard').style.display     = 'none';
}

function setStep(label, sub) {
  document.getElementById('stepLabel').textContent = label;
  document.getElementById('stepSub').textContent   = sub || '';
}

function showDash(qs) {
  document.getElementById('loadingScreen').style.display = 'none';
  document.getElementById('dashboard').style.display     = 'flex';
  renderDashboard(qs);
  saveSession(document.getElementById('topbarFile').textContent, qs);
  const st = computeStats(qs);
  if (st.earned >= 150) setTimeout(fireConfetti, 600);
}

function resetApp() {
  questions = []; filteredQs = []; currentQ = 0;
  pdfPageImages = {}; questionImages = {}; questionPageMap = {};
  subjectChartInsts.forEach(c => c.destroy()); subjectChartInsts = [];
  if (donutChartInst) { donutChartInst.destroy(); donutChartInst = null; }
  const subGrid = document.getElementById('subjectChartsGrid');
  if (subGrid) { subGrid.innerHTML = ''; subGrid.style.display = 'none'; }
  document.getElementById('dashboard').style.display    = 'none';
  document.getElementById('uploadScreen').style.display = 'flex';
  document.getElementById('fileInput').value = '';
  localStorage.removeItem('examSession');
  window._storedSession = null;
}
