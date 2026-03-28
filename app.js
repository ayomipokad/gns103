// ============================================================
//  KAD. CBE SIMULATOR — GNS 103
//  app.js — Core Application Logic
// ============================================================

// ---- CONFIGURATION ----
const EXAM_Q_COUNT = 60;
const EXAM_DURATION = 20 * 60; // seconds

// ---- STATE ----
let examQuestions = [];
let userAnswers = [];   // null | number (MCQ index) | string (FITG text)
let currentQ = 0;
let timeLeft = EXAM_DURATION;
let timerInterval = null;
let examSubmitted = false;

// Review state
let reviewFilter = 'all';
let reviewCurrentQ = 0;
let reviewFilteredIndices = [];

// ---- DOM SHORTCUTS ----
const $ = id => document.getElementById(id);

const pages = {
  landing: $('page-landing'),
  exam:    $('page-exam'),
  results: $('page-results'),
  review:  $('page-review'),
};


// ---- HALFTONE BACKGROUND ----
(function initHalftone() {
  const canvas = $('halftone-bg');
  const ctx = canvas.getContext('2d');

  const ROYGBIV = [0, 30, 60, 120, 210, 240, 270];
  let hueIndex = 0;
  let currentHue = ROYGBIV[0];

  const GRID = 8;

  let mouseX = window.innerWidth  / 2;
  let mouseY = window.innerHeight / 2;
  let targetX = mouseX, targetY = mouseY;

  let distAccum = 0;
  const DIST_PER_STEP = 80;
  let lastMX = mouseX, lastMY = mouseY;

  function resize() {
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;
  }

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const cols = Math.ceil(canvas.width  / GRID) + 1;
    const rows = Math.ceil(canvas.height / GRID) + 1;
    const isDark = document.documentElement.getAttribute('data-theme') !== 'light';

    const RADIUS = 140;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = c * GRID;
        const y = r * GRID;
        const dx = x - mouseX;
        const dy = y - mouseY;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist > RADIUS) continue;

        const influence = 1 - dist / RADIUS;
        const radius = 0.3 + influence * 1.6;
        const lightness = isDark ? 45 + influence * 35 : 44 + influence * 28;
        const alpha = isDark
          ? 0.10 + influence * 0.70
          : 0.08 + influence * 0.50;

        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fillStyle = `hsla(${currentHue}, 95%, ${lightness}%, ${alpha})`;
        ctx.fill();
      }
    }
  }

  function loop() {
    draw();
    requestAnimationFrame(loop);
  }

  setInterval(() => {
    mouseX += (targetX - mouseX) * 0.12;
    mouseY += (targetY - mouseY) * 0.12;
  }, 16);

  document.addEventListener('mousemove', e => {
    const dx = e.clientX - lastMX;
    const dy = e.clientY - lastMY;
    distAccum += Math.sqrt(dx * dx + dy * dy);
    while (distAccum >= DIST_PER_STEP) {
      distAccum -= DIST_PER_STEP;
      hueIndex = (hueIndex + 1) % ROYGBIV.length;
      currentHue = ROYGBIV[hueIndex];
    }
    lastMX = e.clientX;
    lastMY = e.clientY;
    targetX = e.clientX;
    targetY = e.clientY;
  });

  document.addEventListener('touchmove', e => {
    const t = e.touches[0];
    const dx = t.clientX - lastMX;
    const dy = t.clientY - lastMY;
    distAccum += Math.sqrt(dx * dx + dy * dy);
    while (distAccum >= DIST_PER_STEP) {
      distAccum -= DIST_PER_STEP;
      hueIndex = (hueIndex + 1) % ROYGBIV.length;
      currentHue = ROYGBIV[hueIndex];
    }
    lastMX = t.clientX;
    lastMY = t.clientY;
    targetX = t.clientX;
    targetY = t.clientY;
  });

  window.addEventListener('resize', resize);
  resize();
  loop();
})();

// ---- SHOW PAGE ----
function showPage(name) {
  Object.values(pages).forEach(p => p.classList.add('hidden'));
  pages[name].classList.remove('hidden');
}

// ---- SHUFFLE ARRAY ----
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ---- START EXAM ----
$('startBtn').addEventListener('click', startExam);

function startExam() {
  examQuestions = shuffle(QUESTION_BANK).slice(0, EXAM_Q_COUNT);
  userAnswers = new Array(EXAM_Q_COUNT).fill(null);
  currentQ = 0;
  timeLeft = EXAM_DURATION;
  examSubmitted = false;

  buildGrid();
  renderQuestion(0);
  updateProgress();
  showPage('exam');
  startTimer();
}

// ---- BUILD QUESTION GRID ----
function buildGrid() {
  const grid = $('qGrid');
  grid.innerHTML = '';
  for (let i = 0; i < EXAM_Q_COUNT; i++) {
    const btn = document.createElement('button');
    btn.className = 'grid-btn';
    btn.textContent = String(i + 1).padStart(2, '0');
    btn.dataset.idx = i;
    btn.addEventListener('click', () => goToQuestion(i));
    grid.appendChild(btn);
  }
}

function updateGrid() {
  const btns = $('qGrid').querySelectorAll('.grid-btn');
  btns.forEach((btn, i) => {
    btn.className = 'grid-btn';
    if (userAnswers[i] !== null) btn.classList.add('gb-answered');
    if (i === currentQ) btn.classList.add('gb-current');
  });
  const cur = $('qGrid').querySelector('.gb-current');
  if (cur) cur.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

// ---- RENDER QUESTION ----
function renderQuestion(idx) {
  const q = examQuestions[idx];
  $('qCounter').textContent = `Q ${idx + 1} / ${EXAM_Q_COUNT}`;
  $('qNumber').textContent = `${idx + 1}.`;

  // Show question type badge in the text
  const typeLabel = ''; 
  $('qText').textContent = typeLabel + q.q;

  const opts = $('optionsList');
  opts.innerHTML = '';

  if (q.type === 'mcq') {
    renderMCQ(idx, q, opts);
  } else {
    renderFITG(idx, q, opts);
  }

  $('prevBtn').disabled = idx === 0;
  $('nextBtn').disabled = idx === EXAM_Q_COUNT - 1;
  updateGrid();
}

// Render MCQ options
function renderMCQ(idx, q, container) {
  const letters = ['A', 'B', 'C', 'D'];
  q.opts.forEach((opt, i) => {
    const btn = document.createElement('button');
    btn.className = 'option-btn';
    if (userAnswers[idx] === i) btn.classList.add('selected');
    btn.innerHTML = `<span class="opt-letter">${letters[i]}</span><span class="opt-text">${opt}</span>`;
    btn.addEventListener('click', () => selectMCQAnswer(idx, i));
    container.appendChild(btn);
  });
}

// Render Fill-in-the-Gap input
function renderFITG(idx, q, container) {
  const wrapper = document.createElement('div');
  wrapper.className = 'fitg-wrapper';

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'fitg-input';
  input.placeholder = 'Type your answer here...';
  input.autocomplete = 'off';
  input.autocorrect = 'off';
  input.autocapitalize = 'off';
  input.spellcheck = false;

  // Pre-fill if already answered
  if (userAnswers[idx] !== null && typeof userAnswers[idx] === 'string') {
    input.value = userAnswers[idx];
  }

  // On mobile devices, trigger keyboard focus
  input.addEventListener('focus', () => {
    // Scroll into view for mobile
    setTimeout(() => {
      input.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 300);
  });

  // Save answer on input change
  input.addEventListener('input', () => {
    const val = input.value.trim();
    userAnswers[idx] = val.length > 0 ? val : null;
    updateGrid();
    updateProgress();
  });

  // On enter key: go to next question
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      if (currentQ < EXAM_Q_COUNT - 1) goToQuestion(currentQ + 1);
    }
  });

  const hint = document.createElement('p');
  hint.className = 'fitg-hint';
  hint.textContent = '💡 Spelling must be accurate.';

  // Mobile keyboard trigger button
  const mobileBtn = document.createElement('button');
  mobileBtn.className = 'fitg-keyboard-btn';
  mobileBtn.textContent = '⌨️ Tap to Type';
  mobileBtn.setAttribute('aria-label', 'Open keyboard to type answer');
  mobileBtn.addEventListener('click', () => {
    input.focus();
  });

  wrapper.appendChild(input);
  wrapper.appendChild(hint);
  wrapper.appendChild(mobileBtn);
  container.appendChild(wrapper);

  // Auto-focus the input when question renders
  // Small delay needed so DOM is ready
  setTimeout(() => {
    // Only auto-focus on non-mobile (to avoid forced keyboard pop-up on navigation)
    if (window.innerWidth >= 768) {
      input.focus();
    }
  }, 50);
}

// ---- SELECT MCQ ANSWER ----
function selectMCQAnswer(qIdx, optIdx) {
  if (examSubmitted) return;
  userAnswers[qIdx] = optIdx;

  const btns = $('optionsList').querySelectorAll('.option-btn');
  btns.forEach((b, i) => {
    b.classList.toggle('selected', i === optIdx);
    const letter = b.querySelector('.opt-letter');
    letter.style.background  = i === optIdx ? 'var(--accent)' : '';
    letter.style.color       = i === optIdx ? '#fff' : '';
    letter.style.borderColor = i === optIdx ? 'var(--accent)' : '';
  });

  updateGrid();
  updateProgress();
}

// ---- ANSWER EVALUATION ----
function isAnswerCorrect(q, userAnswer) {
  if (userAnswer === null || userAnswer === undefined) return false;
  if (q.type === 'mcq') {
    return userAnswer === q.ans;
  } else {
    // FITG: case-insensitive, trim, exact spelling
    const userStr = String(userAnswer).trim().toLowerCase();
    const correctStr = String(q.ans).trim().toLowerCase();
    return userStr === correctStr;
  }
}

// ---- NAVIGATION ----
function goToQuestion(idx) {
  // Save FITG answer before navigating away
  if (examQuestions[currentQ] && examQuestions[currentQ].type === 'fitg') {
    const input = $('optionsList').querySelector('.fitg-input');
    if (input) {
      const val = input.value.trim();
      userAnswers[currentQ] = val.length > 0 ? val : null;
    }
  }
  currentQ = idx;
  renderQuestion(idx);
}

$('prevBtn').addEventListener('click', () => { if (currentQ > 0) goToQuestion(currentQ - 1); });
$('nextBtn').addEventListener('click', () => { if (currentQ < EXAM_Q_COUNT - 1) goToQuestion(currentQ + 1); });

// ---- PROGRESS ----
function updateProgress() {
  const answered = userAnswers.filter(a => a !== null).length;
  const pct = (answered / EXAM_Q_COUNT) * 100;
  $('progressFill').style.width = pct + '%';
  $('progressText').textContent = `${answered} / ${EXAM_Q_COUNT} answered`;
}

// ---- TIMER ----
function startTimer() {
  clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    timeLeft--;
    updateTimerDisplay();
    if (timeLeft <= 0) { clearInterval(timerInterval); autoSubmit(); }
  }, 1000);
}

function updateTimerDisplay() {
  const m = Math.floor(timeLeft / 60);
  const s = timeLeft % 60;
  $('timerDisplay').textContent = `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;

  const wrap = $('timerDisplay').closest('.timer-wrap');
  const ring = $('timerRing');
  const pct = (timeLeft / EXAM_DURATION) * 100;
  ring.style.strokeDasharray = `${pct} 100`;

  wrap.classList.remove('timer-warning','timer-danger');
  if (timeLeft <= 60) wrap.classList.add('timer-danger');
  else if (timeLeft <= 5 * 60) wrap.classList.add('timer-warning');
}

// ---- SUBMIT ----
$('submitBtn').addEventListener('click', () => {
  // Save current FITG answer if on a FITG question
  if (examQuestions[currentQ] && examQuestions[currentQ].type === 'fitg') {
    const input = $('optionsList').querySelector('.fitg-input');
    if (input) {
      const val = input.value.trim();
      userAnswers[currentQ] = val.length > 0 ? val : null;
    }
  }
  const unanswered = userAnswers.filter(a => a === null).length;
  $('modalMessage').textContent = unanswered > 0
    ? `You have ${unanswered} unanswered question${unanswered > 1 ? 's' : ''}. Are you sure you want to submit?`
    : 'Are you sure you want to submit your exam?';
  $('submitModal').classList.remove('hidden');
});

$('confirmSubmit').addEventListener('click', () => { $('submitModal').classList.add('hidden'); finalSubmit(); });
$('cancelSubmit').addEventListener('click', () => { $('submitModal').classList.add('hidden'); });

function autoSubmit() { examSubmitted = true; finalSubmit(); }

function finalSubmit() {
  clearInterval(timerInterval);
  examSubmitted = true;
  showResults();
}

// ---- RESULTS ----
function showResults() {
  let correct = 0, wrong = 0, skipped = 0;
  examQuestions.forEach((q, i) => {
    if (userAnswers[i] === null) skipped++;
    else if (isAnswerCorrect(q, userAnswers[i])) correct++;
    else wrong++;
  });

  const pct = Math.round((correct / EXAM_Q_COUNT) * 100);
  $('scorePct').textContent = pct + '%';
  $('statCorrect').textContent = correct;
  $('statWrong').textContent = wrong;
  $('statSkipped').textContent = skipped;

  let title = '';
  if (pct >= 70) title = '🎉 Excellent! You Passed!';
  else if (pct >= 50) title = '📚 Good Effort — Keep Studying';
  else if (pct >= 30) title = '💪 Keep Pushing — You\'ve Got This';
  else title = 'Review & Try Again';
  $('resultTitle').textContent = title;

  const circumference = 314;
  const offset = circumference - (pct / 100) * circumference;
  const ring = $('scoreCircle');
  ring.style.stroke = pct >= 70 ? 'var(--correct)' : pct >= 50 ? 'var(--skip)' : 'var(--wrong)';
  setTimeout(() => { ring.style.strokeDashoffset = offset; }, 100);

  showPage('results');
}

// ---- REVIEW — EXAM-STYLE ----

function getExplanation(q) {
  return q.explanation || '';
}

function buildFilteredIndices(filter) {
  reviewFilteredIndices = [];
  examQuestions.forEach((q, i) => {
    const ua = userAnswers[i];
    const isCorrect = isAnswerCorrect(q, ua);
    const isSkipped = ua === null;
    const isWrong = !isSkipped && !isCorrect;

    if (filter === 'all') reviewFilteredIndices.push(i);
    else if (filter === 'correct' && isCorrect) reviewFilteredIndices.push(i);
    else if (filter === 'wrong' && isWrong) reviewFilteredIndices.push(i);
    else if (filter === 'skipped' && isSkipped) reviewFilteredIndices.push(i);
  });
}

function buildReviewGrid() {
  const grid = $('rvGrid');
  grid.innerHTML = '';

  reviewFilteredIndices.forEach((qIdx, pos) => {
    const ua = userAnswers[qIdx];
    const isCorrect = isAnswerCorrect(examQuestions[qIdx], ua);
    const isSkipped = ua === null;

    const btn = document.createElement('button');
    btn.className = 'grid-btn';
    if (isCorrect) btn.classList.add('gb-rv-correct');
    else if (isSkipped) btn.classList.add('gb-rv-skipped');
    else btn.classList.add('gb-rv-wrong');
    if (pos === reviewCurrentQ) btn.classList.add('gb-current');

    btn.textContent = String(qIdx + 1).padStart(2, '0');
    btn.dataset.pos = pos;
    btn.addEventListener('click', () => goToReviewQuestion(pos));
    grid.appendChild(btn);
  });
}

function updateReviewGrid() {
  const btns = $('rvGrid').querySelectorAll('.grid-btn');
  btns.forEach((btn, pos) => {
    btn.classList.remove('gb-current');
    if (pos === reviewCurrentQ) {
      btn.classList.add('gb-current');
      btn.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
  });
}

function renderReviewQuestion(pos) {
  if (reviewFilteredIndices.length === 0) {
    $('rvQCounter').textContent = 'No questions';
    $('rvQNumber').textContent = '';
    $('rvQText').textContent = 'No questions match this filter.';
    $('rvOptionsList').innerHTML = '';
    $('rvExplanationText').textContent = '';
    $('rvStatusBadge').textContent = '';
    $('rvStatusBadge').className = 'review-status-badge';
    return;
  }

  const qIdx = reviewFilteredIndices[pos];
  const q = examQuestions[qIdx];
  const ua = userAnswers[qIdx];
  const isCorrect = isAnswerCorrect(q, ua);
  const isSkipped = ua === null;
  const isWrong = !isSkipped && !isCorrect;
  const letters = ['A', 'B', 'C', 'D'];

  $('rvQCounter').textContent = `Q ${pos + 1} / ${reviewFilteredIndices.length}`;
  $('rvQNumber').textContent = `${qIdx + 1}.`;

  const typeLabel = '';
  $('rvQText').textContent = typeLabel + q.q;

  // Status badge
  const badge = $('rvStatusBadge');
  badge.className = 'review-status-badge';
  if (isCorrect) { badge.textContent = '✓ Correct'; badge.classList.add('rsb-correct'); }
  else if (isSkipped) { badge.textContent = '— Skipped'; badge.classList.add('rsb-skipped'); }
  else { badge.textContent = '✗ Wrong'; badge.classList.add('rsb-wrong'); }

  // Options / answer display
  const opts = $('rvOptionsList');
  opts.innerHTML = '';

  if (q.type === 'mcq') {
    q.opts.forEach((opt, i) => {
      const btn = document.createElement('button');
      btn.className = 'option-btn';
      btn.style.cursor = 'default';
      btn.style.pointerEvents = 'none';

      const isThisCorrect = i === q.ans;
      const isThisUserPick = i === ua && ua !== null;

      if (isThisCorrect) btn.classList.add('review-correct');
      else if (isThisUserPick) btn.classList.add('review-wrong');

      const letterEl = document.createElement('span');
      letterEl.className = 'opt-letter';
      letterEl.textContent = letters[i];

      if (isThisCorrect) {
        letterEl.style.background = 'var(--correct)';
        letterEl.style.color = '#fff';
        letterEl.style.borderColor = 'var(--correct)';
      } else if (isThisUserPick) {
        letterEl.style.background = 'var(--wrong)';
        letterEl.style.color = '#fff';
        letterEl.style.borderColor = 'var(--wrong)';
      }

      const textEl = document.createElement('span');
      textEl.className = 'opt-text';
      textEl.textContent = opt + (isThisCorrect ? ' ✓' : '') + (isThisUserPick && !isThisCorrect ? ' ✗' : '');

      btn.appendChild(letterEl);
      btn.appendChild(textEl);
      opts.appendChild(btn);
    });
  } else {
    // FITG review display
    const reviewFitgDiv = document.createElement('div');
    reviewFitgDiv.className = 'fitg-review';

    const userRow = document.createElement('div');
    userRow.className = 'fitg-review-row';
    const userLabel = document.createElement('span');
    userLabel.className = 'fitg-review-label';
    userLabel.textContent = 'Your Answer:';
    const userVal = document.createElement('span');
    userVal.className = isSkipped ? 'fitg-review-val skipped' : (isCorrect ? 'fitg-review-val correct' : 'fitg-review-val wrong');
    userVal.textContent = isSkipped ? '(No answer)' : String(ua);
    userRow.appendChild(userLabel);
    userRow.appendChild(userVal);

    const correctRow = document.createElement('div');
    correctRow.className = 'fitg-review-row';
    const correctLabel = document.createElement('span');
    correctLabel.className = 'fitg-review-label';
    correctLabel.textContent = 'Correct Answer:';
    const correctVal = document.createElement('span');
    correctVal.className = 'fitg-review-val fitg-correct-ans';
    correctVal.textContent = q.ans;
    correctRow.appendChild(correctLabel);
    correctRow.appendChild(correctVal);

    reviewFitgDiv.appendChild(userRow);
    reviewFitgDiv.appendChild(correctRow);
    opts.appendChild(reviewFitgDiv);
  }

  // Explanation
  const explanationText = getExplanation(q);
  const explanationBox  = $('rvExplanation');
  $('rvExplanationText').textContent = explanationText;
  explanationBox.style.display = explanationText ? 'block' : 'none';

  // Nav buttons
  $('rvPrevBtn').disabled = pos === 0;
  $('rvNextBtn').disabled = pos === reviewFilteredIndices.length - 1;

  updateReviewGrid();
}

function goToReviewQuestion(pos) {
  reviewCurrentQ = pos;
  renderReviewQuestion(pos);
}

// ---- OPEN REVIEW ----
$('reviewBtn').addEventListener('click', () => {
  reviewFilter = 'all';
  reviewCurrentQ = 0;

  document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  document.querySelector('.filter-btn[data-filter="all"]').classList.add('active');

  buildFilteredIndices('all');
  buildReviewGrid();
  renderReviewQuestion(0);
  showPage('review');
});

// ---- REVIEW NAV ----
$('rvPrevBtn').addEventListener('click', () => {
  if (reviewCurrentQ > 0) goToReviewQuestion(reviewCurrentQ - 1);
});
$('rvNextBtn').addEventListener('click', () => {
  if (reviewCurrentQ < reviewFilteredIndices.length - 1) goToReviewQuestion(reviewCurrentQ + 1);
});

$('backToResults').addEventListener('click', () => showPage('results'));

// ---- FILTER BUTTONS ----
document.querySelectorAll('.filter-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    reviewFilter = btn.dataset.filter;
    reviewCurrentQ = 0;
    buildFilteredIndices(reviewFilter);
    buildReviewGrid();
    renderReviewQuestion(0);
  });
});

// ---- RETAKE ----
$('retakeBtn').addEventListener('click', startExam);

// Disable Right-Click
document.addEventListener('contextmenu', (e) => e.preventDefault());

// Disable F12 and Inspection Shortcuts
document.onkeydown = function(e) {
  if (e.keyCode == 123) return false;
  if (e.ctrlKey && e.shiftKey && e.keyCode == 'I'.charCodeAt(0)) return false;
  if (e.ctrlKey && e.shiftKey && e.keyCode == 'J'.charCodeAt(0)) return false;
  if (e.ctrlKey && e.keyCode == 'U'.charCodeAt(0)) return false;
};
