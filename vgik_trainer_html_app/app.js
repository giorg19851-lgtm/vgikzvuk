
(function(){
  const db = window.VGIK_DB;
  if(!db || !Array.isArray(db.items)){
    document.getElementById("questionText").textContent = "База не загрузилась. Проверь db.js.";
    return;
  }

  const els = {
    topicTitle: document.getElementById("topicTitle"),
    counter: document.getElementById("counter"),
    difficulty: document.getElementById("difficulty"),
    modeName: document.getElementById("modeName"),
    questionText: document.getElementById("questionText"),
    choices: document.getElementById("choices"),
    freeAnswer: document.getElementById("freeAnswer"),
    answerPanel: document.getElementById("answerPanel"),
    answerText: document.getElementById("answerText"),
    explanationText: document.getElementById("explanationText"),
    showAnswerBtn: document.getElementById("showAnswerBtn"),
    correctBtn: document.getElementById("correctBtn"),
    wrongBtn: document.getElementById("wrongBtn"),
    nextBtn: document.getElementById("nextBtn"),
    stats: document.getElementById("stats"),
    drawer: document.getElementById("drawer"),
    menuBtn: document.getElementById("menuBtn"),
    closeDrawer: document.getElementById("closeDrawer"),
    onlyWrong: document.getElementById("onlyWrong"),
    hardMode: document.getElementById("hardMode"),
    resetProgress: document.getElementById("resetProgress"),
  };

  const STORAGE_KEY = "vgik-sound-trainer-state-v1";

  let state = loadState();
  let current = null;
  let locked = false;

  function freshState(){
    return {
      totalAnswered: 0,
      correct: 0,
      wrong: 0,
      streak: 0,
      lastIds: [],
      currentId: null,
      settings: { onlyWrong: false, hardMode: false },
      progress: {}
    };
  }

  function loadState(){
    try{
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY));
      return Object.assign(freshState(), parsed || {});
    }catch(e){
      return freshState();
    }
  }

  function saveState(){
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function progressFor(id){
    if(!state.progress[id]){
      state.progress[id] = { seen:0, correct:0, wrong:0, dueAt:null, lastSeen:-1 };
    }
    return state.progress[id];
  }

  function sharedTags(a=[], b=[]){
    const s = new Set(a);
    return b.some(x => s.has(x));
  }

  function weightedPick(list){
    if(!list.length) return db.items[Math.floor(Math.random()*db.items.length)];

    const weights = list.map(q => {
      const p = progressFor(q.id);
      let w = 1;
      if(p.wrong > p.correct) w += 4;
      if(p.seen === 0) w += 2;
      if(state.settings.hardMode && q.difficulty >= 3) w += 3;
      if(q.id === state.currentId) w = 0.01;
      if(state.lastIds.includes(q.id)) w *= 0.12;
      return Math.max(w, 0.01);
    });

    const sum = weights.reduce((a,b)=>a+b,0);
    let r = Math.random() * sum;
    for(let i=0;i<list.length;i++){
      r -= weights[i];
      if(r <= 0) return list[i];
    }
    return list[list.length-1];
  }

  function pickNextQuestion(){
    const now = state.totalAnswered;

    // Scheduled repeats after wrong answers win.
    const due = db.items.filter(q => {
      const p = state.progress[q.id];
      return p && p.dueAt !== null && p.dueAt <= now;
    });
    if(due.length) return weightedPick(due);

    if(state.settings.onlyWrong){
      const wrongPool = db.items.filter(q => {
        const p = state.progress[q.id];
        return p && p.wrong > p.correct;
      });
      if(wrongPool.length) return weightedPick(wrongPool);
    }

    if(!current) return weightedPick(db.items);

    const related = db.items.filter(q =>
      q.id !== current.id &&
      (q.topic === current.topic || sharedTags(q.tags, current.tags))
    );

    const sameTheme = db.items.filter(q => q.id !== current.id && q.topic === current.topic);
    const roll = Math.random();

    if(roll < 0.50 && sameTheme.length) return weightedPick(sameTheme);
    if(roll < 0.82 && related.length) return weightedPick(related);

    return weightedPick(db.items);
  }

  function renderQuestion(q){
    current = q;
    locked = false;
    state.currentId = q.id;
    saveState();

    els.topicTitle.textContent = q.topic_name || q.topic || "Вопрос";
    els.counter.textContent = `${state.totalAnswered + 1} • ${q.id}`;
    els.difficulty.textContent = `сложность ${q.difficulty || 1}`;
    els.modeName.textContent = q.type || "вопрос";
    els.questionText.textContent = q.question;
    els.answerText.textContent = q.answer || "Ответ не указан";
    els.explanationText.textContent = q.explanation || "";

    els.choices.innerHTML = "";
    els.freeAnswer.value = "";
    els.answerPanel.classList.add("hidden");
    els.showAnswerBtn.classList.remove("hidden");
    els.nextBtn.classList.add("hidden");
    els.correctBtn.classList.add("hidden");
    els.wrongBtn.classList.add("hidden");

    const isChoice = q.type === "multiple_choice" || q.type === "true_false" || (q.choices && q.choices.length > 0);
    els.freeAnswer.classList.toggle("hidden", isChoice);

    if(isChoice){
      const opts = q.choices && q.choices.length ? q.choices : ["Да", "Нет"];
      opts.forEach(opt => {
        const btn = document.createElement("button");
        btn.className = "choice-btn";
        btn.textContent = opt;
        btn.addEventListener("click", () => answerChoice(btn, opt));
        els.choices.appendChild(btn);
      });
      els.showAnswerBtn.classList.add("hidden");
    }

    updateStats();
  }

  function normalize(s){
    return String(s || "")
      .toLowerCase()
      .replaceAll("ё", "е")
      .replace(/[«»"'.!,?:;()\-–—]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function answerChoice(btn, opt){
    if(locked) return;
    locked = true;

    const isCorrect = normalize(opt) === normalize(current.answer);
    [...els.choices.children].forEach(b => {
      if(normalize(b.textContent) === normalize(current.answer)) b.classList.add("selected","correct");
    });
    btn.classList.add("selected", isCorrect ? "correct" : "wrong");

    els.answerPanel.classList.remove("hidden");
    recordResult(isCorrect);
    els.nextBtn.classList.remove("hidden");
  }

  function revealAnswer(){
    els.answerPanel.classList.remove("hidden");
    els.showAnswerBtn.classList.add("hidden");
    els.correctBtn.classList.remove("hidden");
    els.wrongBtn.classList.remove("hidden");
  }

  function recordResult(isCorrect){
    const p = progressFor(current.id);
    p.seen += 1;
    p.lastSeen = state.totalAnswered;

    state.totalAnswered += 1;

    if(isCorrect){
      p.correct += 1;
      p.dueAt = null;
      state.correct += 1;
      state.streak += 1;
    } else {
      const delay = 5 + Math.floor(Math.random() * 6);
      p.wrong += 1;
      p.dueAt = state.totalAnswered + delay;
      state.wrong += 1;
      state.streak = 0;
    }

    state.lastIds.unshift(current.id);
    state.lastIds = state.lastIds.slice(0, 12);
    saveState();
    updateStats();
  }

  function updateStats(){
    els.stats.textContent = `правильно ${state.correct} • ошибки ${state.wrong} • серия ${state.streak}`;
    els.onlyWrong.checked = !!state.settings.onlyWrong;
    els.hardMode.checked = !!state.settings.hardMode;
  }

  function next(){
    renderQuestion(pickNextQuestion());
  }

  els.showAnswerBtn.addEventListener("click", revealAnswer);
  els.correctBtn.addEventListener("click", () => {
    recordResult(true);
    els.correctBtn.classList.add("hidden");
    els.wrongBtn.classList.add("hidden");
    els.nextBtn.classList.remove("hidden");
  });
  els.wrongBtn.addEventListener("click", () => {
    recordResult(false);
    els.correctBtn.classList.add("hidden");
    els.wrongBtn.classList.add("hidden");
    els.nextBtn.classList.remove("hidden");
  });
  els.nextBtn.addEventListener("click", next);

  els.menuBtn.addEventListener("click", () => els.drawer.classList.remove("hidden"));
  els.closeDrawer.addEventListener("click", () => els.drawer.classList.add("hidden"));
  els.drawer.addEventListener("click", e => {
    if(e.target === els.drawer) els.drawer.classList.add("hidden");
  });
  els.onlyWrong.addEventListener("change", e => {
    state.settings.onlyWrong = e.target.checked;
    saveState();
  });
  els.hardMode.addEventListener("change", e => {
    state.settings.hardMode = e.target.checked;
    saveState();
  });
  els.resetProgress.addEventListener("click", () => {
    if(confirm("Сбросить весь прогресс?")){
      state = freshState();
      saveState();
      els.drawer.classList.add("hidden");
      current = null;
      next();
    }
  });

  document.addEventListener("keydown", e => {
    if(e.key === " "){
      e.preventDefault();
      if(!els.nextBtn.classList.contains("hidden")) next();
      else if(!els.showAnswerBtn.classList.contains("hidden")) revealAnswer();
    }
    if(e.key === "ArrowRight" && !els.nextBtn.classList.contains("hidden")) next();
  });

  if("serviceWorker" in navigator && location.protocol !== "file:"){
    navigator.serviceWorker.register("./service-worker.js").catch(()=>{});
  }

  next();
})();
