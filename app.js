\
/**
 * Simulador Examen Licencia Chile (Clase B)
 * - 35 preguntas / 35 min / mínimo 28
 * - Timer real + timer aproximado (según tu ritmo)
 * - Guarda progreso en localStorage
 */

const $ = (id) => document.getElementById(id);

const screens = {
  home: $("screenHome"),
  exam: $("screenExam"),
  results: $("screenResults"),
};

const CONFIG = {
  totalQuestions: 35,
  minutes: 35,
  minCorrect: 28,
  questionsUrl: "data/questions.json",
  storageKey: "simulador_licencia_cl_v1",
};

let state = {
  mode: "exam",              // "exam" o "practice"
  questions: [],
  order: [],
  currentViewIndex: 0,
  answers: {},               // { realIndex: choiceIndex }
  startedAt: null,           // ms
  realEndsAt: null,          // ms
  tick: null,
};

function showScreen(name){
  Object.values(screens).forEach(s => s.classList.add("hidden"));
  screens[name].classList.remove("hidden");
}

function msToMMSS(ms){
  const s = Math.max(0, Math.floor(ms / 1000));
  const mm = String(Math.floor(s / 60)).padStart(2,"0");
  const ss = String(s % 60).padStart(2,"0");
  return `${mm}:${ss}`;
}

function shuffle(arr){
  const a = [...arr];
  for(let i=a.length-1;i>0;i--){
    const j = Math.floor(Math.random()*(i+1));
    [a[i],a[j]]=[a[j],a[i]];
  }
  return a;
}

function answeredCount(){
  return Object.keys(state.answers).length;
}

function getQuestionByViewIndex(viewIndex){
  const realIndex = state.order[viewIndex];
  return { realIndex, q: state.questions[realIndex] };
}

function setProgress(){
  const total = CONFIG.totalQuestions;
  const idx = state.currentViewIndex + 1;
  $("progressText").textContent = `Pregunta ${idx} de ${total}`;
  $("barFill").style.width = `${(idx/total)*100}%`;

  $("btnPrev").disabled = state.currentViewIndex === 0;
  $("btnNext").disabled = state.currentViewIndex === total - 1;
}

function saveProgress(){
  const payload = {
    ...state,
    tick: null,
  };
  localStorage.setItem(CONFIG.storageKey, JSON.stringify(payload));
  $("autosaveInfo").textContent = `Progreso guardado (${new Date().toLocaleTimeString()}).`;
}

function loadProgress(){
  try{
    const raw = localStorage.getItem(CONFIG.storageKey);
    if(!raw) return null;
    return JSON.parse(raw);
  }catch{
    return null;
  }
}

function clearProgress(){
  localStorage.removeItem(CONFIG.storageKey);
}

function renderQuestion(){
  setProgress();
  const { realIndex, q } = getQuestionByViewIndex(state.currentViewIndex);

  $("qCategory").textContent = q.category || "Pregunta";
  $("qId").textContent = q.id ? `ID: ${q.id}` : "";
  $("qText").textContent = q.text;

  const selected = state.answers[realIndex];
  const wrap = $("answers");
  wrap.innerHTML = "";

  q.choices.forEach((txt, i) => {
    const div = document.createElement("div");
    div.className = "answer";
    div.innerHTML = `
      <label>
        <input type="radio" name="ans" ${selected===i ? "checked":""} />
        <span>${escapeHtml(txt)}</span>
      </label>
    `;
    div.querySelector("input").addEventListener("change", () => {
      state.answers[realIndex] = i;
      saveProgress();
      updateApproxTimer();
    });
    wrap.appendChild(div);
  });
}

function escapeHtml(str){
  return String(str)
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;");
}

/* Timers */

function updateRealTimer(){
  if(state.mode === "practice"){
    $("realTimer").textContent = "∞";
    $("realHint").textContent = "Sin tiempo";
    return;
  }
  const now = Date.now();
  const left = state.realEndsAt - now;
  $("realTimer").textContent = msToMMSS(left);
  $("realHint").textContent = "Cuenta regresiva";

  if(left <= 0){
    finishExam(true);
  }
}

function updateApproxTimer(){
  const now = Date.now();

  if(!state.startedAt){
    $("approxTimer").textContent = "--:--";
    $("approxHint").textContent = "Se calcula con tu ritmo";
    return;
  }

  const elapsed = now - state.startedAt;
  const done = answeredCount();

  if(done <= 0){
    $("approxTimer").textContent = "--:--";
    $("approxHint").textContent = "Responde 1 pregunta para estimar";
    return;
  }

  const pacePerQ = elapsed / done;
  const projectedTotal = pacePerQ * CONFIG.totalQuestions;
  const projectedRemaining = Math.max(0, projectedTotal - elapsed);

  $("approxTimer").textContent = msToMMSS(projectedRemaining);

  if(state.mode === "practice"){
    $("approxHint").textContent = "Estimación por ritmo (modo práctica)";
    return;
  }

  const realLeft = Math.max(0, state.realEndsAt - now);
  const delta = projectedRemaining - realLeft;

  if(delta > 15_000) $("approxHint").textContent = "A este ritmo podrías quedar justo";
  else if(delta < -15_000) $("approxHint").textContent = "A este ritmo vas sobrado";
  else $("approxHint").textContent = "Vas dentro del tiempo real";
}

function startTick(){
  stopTick();
  updateRealTimer();
  updateApproxTimer();
  state.tick = setInterval(() => {
    updateRealTimer();
    updateApproxTimer();
  }, 500);
}

function stopTick(){
  if(state.tick) clearInterval(state.tick);
  state.tick = null;
}

/* Results */

function computeResults(){
  let correct = 0, wrong = 0, blank = 0;

  for(let view=0; view<CONFIG.totalQuestions; view++){
    const realIndex = state.order[view];
    const q = state.questions[realIndex];
    const a = state.answers[realIndex];

    if(a === undefined) blank++;
    else if(a === q.answerIndex) correct++;
    else wrong++;
  }
  return { correct, wrong, blank };
}

function renderReview(){
  const review = $("review");
  review.innerHTML = "";

  for(let view=0; view<CONFIG.totalQuestions; view++){
    const realIndex = state.order[view];
    const q = state.questions[realIndex];
    const a = state.answers[realIndex];

    const chosen = (a===undefined) ? "(sin responder)" : q.choices[a];
    const correct = q.choices[q.answerIndex];

    const div = document.createElement("div");
    div.className = "reviewItem";
    div.innerHTML = `
      <div class="rtitle">${view+1}. ${escapeHtml(q.text)}</div>
      <div class="tiny muted">Tu respuesta: <b>${escapeHtml(chosen)}</b></div>
      <div class="tiny muted">Correcta: <b>${escapeHtml(correct)}</b></div>
    `;
    review.appendChild(div);
  }
}

function finishExam(isAuto=false){
  stopTick();

  const used = state.startedAt ? (Date.now() - state.startedAt) : 0;
  const { correct, wrong, blank } = computeResults();

  $("rCorrect").textContent = String(correct);
  $("rWrong").textContent = String(wrong);
  $("rBlank").textContent = String(blank);
  $("rTime").textContent = msToMMSS(used);

  const pass = correct >= CONFIG.minCorrect;
  $("rPassFail").textContent = pass
    ? `✅ APROBADO (mínimo ${CONFIG.minCorrect})`
    : `❌ REPROBADO (mínimo ${CONFIG.minCorrect})`;

  if(isAuto) $("rPassFail").textContent += " — se terminó el tiempo.";

  renderReview();
  showScreen("results");
}

/* Start / Resume */

async function loadQuestions(){
  const res = await fetch(CONFIG.questionsUrl, { cache: "no-store" });
  if(!res.ok) throw new Error("No pude cargar las preguntas. Revisa data/questions.json");
  const payload = await res.json();
  return payload.questions || payload;
}

function initAttempt(mode){
  state.mode = mode;
  $("modePill").textContent = (mode === "practice") ? "Modo práctica" : "Modo examen";

  const total = CONFIG.totalQuestions;
  $("homeTotal").textContent = String(total);

  state.order = shuffle([...Array(state.questions.length).keys()]).slice(0, total);
  state.currentViewIndex = 0;
  state.answers = {};
  state.startedAt = Date.now();

  if(mode === "exam"){
    state.realEndsAt = state.startedAt + CONFIG.minutes * 60_000;
  }else{
    state.realEndsAt = null;
  }

  saveProgress();
  showScreen("exam");
  renderQuestion();
  startTick();
}

function tryResume(){
  const p = loadProgress();
  if(!p) return false;

  // Reanudar solo si ya estaba en examen y tiene preguntas
  if(p.questions && p.order && p.startedAt){
    state = { ...state, ...p, tick: null };
    $("modePill").textContent = (state.mode === "practice") ? "Modo práctica" : "Modo examen";
    showScreen("exam");
    renderQuestion();
    startTick();
    $("autosaveInfo").textContent = "Se reanudó tu intento anterior (guardado localmente).";
    return true;
  }
  return false;
}

/* UI */

function wireUI(){
  $("btnStart").addEventListener("click", () => initAttempt("exam"));
  $("btnPractice").addEventListener("click", () => initAttempt("practice"));
  $("btnReset").addEventListener("click", () => {
    clearProgress();
    alert("Progreso borrado.");
  });

  $("btnPrev").addEventListener("click", () => {
    state.currentViewIndex = Math.max(0, state.currentViewIndex - 1);
    renderQuestion();
    saveProgress();
  });

  $("btnNext").addEventListener("click", () => {
    state.currentViewIndex = Math.min(CONFIG.totalQuestions - 1, state.currentViewIndex + 1);
    renderQuestion();
    saveProgress();
  });

  $("btnFinish").addEventListener("click", () => finishExam(false));

  $("btnHome").addEventListener("click", () => showScreen("home"));
  $("btnRestart").addEventListener("click", () => {
    clearProgress();
    location.reload();
  });
}

(async function boot(){
  wireUI();

  try{
    state.questions = await loadQuestions();
    // Si hay menos preguntas que las requeridas, ajusta automáticamente
    if(state.questions.length < CONFIG.totalQuestions){
      CONFIG.totalQuestions = state.questions.length;
    }
    // intenta reanudar
    if(!tryResume()){
      showScreen("home");
    }
  }catch(err){
    console.error(err);
    alert((err && err.message) ? err.message : "Error cargando preguntas");
    showScreen("home");
  }
})();
