
(function(){
  const db = window.VGIK_DB;
  const items = db && Array.isArray(db.items) ? db.items : [];
  const $ = id => document.getElementById(id);

  const el = {
    meta: $("meta"),
    question: $("question"),
    options: $("options"),
    result: $("result"),
    resultMark: $("resultMark"),
    correctAnswer: $("correctAnswer"),
    explanation: $("explanation"),
    nextBtn: $("nextBtn"),
    stats: $("stats"),
    drawer: $("drawer"),
    menuBtn: $("menuBtn"),
    closeDrawer: $("closeDrawer"),
    onlyWrong: $("onlyWrong"),
    hardMode: $("hardMode"),
    resetBtn: $("resetBtn")
  };

  const KEY = "vgik-test-v2";
  let current = null;
  let locked = false;

  let state = loadState();

  function defaultState(){
    return {
      total:0,
      correct:0,
      wrong:0,
      streak:0,
      lastIds:[],
      progress:{},
      settings:{onlyWrong:false, hardMode:false}
    };
  }

  function loadState(){
    try{
      return Object.assign(defaultState(), JSON.parse(localStorage.getItem(KEY)) || {});
    }catch(e){
      return defaultState();
    }
  }

  function save(){
    localStorage.setItem(KEY, JSON.stringify(state));
  }

  function p(id){
    if(!state.progress[id]){
      state.progress[id] = {seen:0, correct:0, wrong:0, dueAt:null};
    }
    return state.progress[id];
  }

  function norm(x){
    return String(x || "")
      .toLowerCase()
      .replaceAll("ё","е")
      .replace(/[«»"'.!,?:;()[\]{}\-–—]/g," ")
      .replace(/\s+/g," ")
      .trim();
  }

  function sharedTags(a=[], b=[]){
    const s = new Set(a);
    return b.some(x => s.has(x));
  }

  function shuffle(arr){
    const a = arr.slice();
    for(let i=a.length-1; i>0; i--){
      const j = Math.floor(Math.random()*(i+1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function weightedPick(list){
    if(!list.length) return items[Math.floor(Math.random()*items.length)];

    const weights = list.map(q => {
      const pr = p(q.id);
      let w = 1;
      if(pr.seen === 0) w += 2;
      if(pr.wrong > pr.correct) w += 4;
      if(state.settings.hardMode && Number(q.difficulty) >= 3) w += 3;
      if(state.lastIds.includes(q.id)) w *= .12;
      return Math.max(.01, w);
    });

    const sum = weights.reduce((a,b)=>a+b,0);
    let r = Math.random()*sum;
    for(let i=0; i<list.length; i++){
      r -= weights[i];
      if(r <= 0) return list[i];
    }
    return list[list.length-1];
  }

  function pickQuestion(){
    const now = state.total;

    const due = items.filter(q => {
      const pr = state.progress[q.id];
      return pr && pr.dueAt !== null && pr.dueAt <= now;
    });
    if(due.length) return weightedPick(due);

    if(state.settings.onlyWrong){
      const wrongPool = items.filter(q => {
        const pr = state.progress[q.id];
        return pr && pr.wrong > pr.correct;
      });
      if(wrongPool.length) return weightedPick(wrongPool);
    }

    if(!current) return weightedPick(items);

    const sameTopic = items.filter(q => q.id !== current.id && q.topic === current.topic);
    const related = items.filter(q => q.id !== current.id && (q.topic === current.topic || sharedTags(q.tags, current.tags)));

    const roll = Math.random();
    if(roll < .55 && sameTopic.length) return weightedPick(sameTopic);
    if(roll < .82 && related.length) return weightedPick(related);
    return weightedPick(items);
  }

  function makeOptions(q){
    const correct = String(q.answer || "Ответ не указан").trim();

    if(Array.isArray(q.choices) && q.choices.length >= 2){
      return shuffle(unique(q.choices.map(String))).slice(0, 6);
    }

    if(q.type === "true_false" || q.type === "true_false_explain"){
      const yes = /^(да|верно|true)$/i.test(correct) || /^да[.!\s]/i.test(correct);
      return yes ? ["Да", "Нет"] : ["Нет", "Да"];
    }

    const sameTopicAnswers = items
      .filter(x => x.id !== q.id && x.topic === q.topic && x.answer && norm(x.answer) !== norm(correct))
      .map(x => String(x.answer).trim());

    const sameTypeAnswers = items
      .filter(x => x.id !== q.id && x.type === q.type && x.answer && norm(x.answer) !== norm(correct))
      .map(x => String(x.answer).trim());

    const globalAnswers = items
      .filter(x => x.id !== q.id && x.answer && norm(x.answer) !== norm(correct))
      .map(x => String(x.answer).trim());

    let pool = unique([...sameTopicAnswers, ...sameTypeAnswers, ...globalAnswers])
      .filter(x => x.length > 0 && x.length < 180);

    let opts = [correct, ...shuffle(pool).slice(0, 3)];

    // Если ответы длинные, режем не смысл, а показ. Полный ответ всё равно выйдет после выбора.
    opts = unique(opts).slice(0, 4);

    while(opts.length < 4){
      opts.push(["Не относится к теме","Только музыка","Только пересказ сюжета","Нет правильного ответа"][opts.length-1] || "Другой вариант");
    }

    return shuffle(opts);
  }

  function unique(arr){
    const seen = new Set();
    const out = [];
    for(const x of arr){
      const k = norm(x);
      if(k && !seen.has(k)){
        seen.add(k);
        out.push(x);
      }
    }
    return out;
  }

  function render(){
    locked = false;
    current = pickQuestion();
    const pr = p(current.id);

    el.meta.textContent = `${current.id} • ${current.topic_name || current.topic} • ${current.difficulty || 1}`;
    el.question.textContent = current.question;
    el.options.innerHTML = "";
    el.result.classList.add("hidden");
    el.nextBtn.classList.add("hidden");

    const opts = makeOptions(current);
    const letters = "АБВГДЕ";

    opts.forEach((opt, i) => {
      const btn = document.createElement("button");
      btn.className = "option";
      btn.innerHTML = `<span class="letter">${letters[i]}</span><span>${escapeHtml(opt)}</span>`;
      btn.addEventListener("click", () => choose(btn, opt));
      el.options.appendChild(btn);
    });

    updateStats();
  }

  function choose(btn, opt){
    if(locked) return;
    locked = true;

    const correct = String(current.answer || "").trim();
    const isCorrect = norm(opt) === norm(correct);

    [...el.options.children].forEach(b => {
      const txt = b.querySelector("span:last-child").textContent;
      if(norm(txt) === norm(correct)) b.classList.add("correct");
    });

    if(!isCorrect) btn.classList.add("wrong");

    el.result.classList.remove("hidden");
    el.resultMark.textContent = isCorrect ? "верно" : "неверно";
    el.resultMark.style.color = isCorrect ? "var(--good)" : "var(--bad)";
    el.correctAnswer.textContent = correct;
    el.explanation.textContent = current.explanation || "";
    el.nextBtn.classList.remove("hidden");

    record(isCorrect);
  }

  function record(ok){
    const pr = p(current.id);
    pr.seen += 1;

    state.total += 1;

    if(ok){
      pr.correct += 1;
      pr.dueAt = null;
      state.correct += 1;
      state.streak += 1;
    }else{
      pr.wrong += 1;
      pr.dueAt = state.total + 5 + Math.floor(Math.random()*6);
      state.wrong += 1;
      state.streak = 0;
    }

    state.lastIds.unshift(current.id);
    state.lastIds = state.lastIds.slice(0, 12);
    save();
    updateStats();
  }

  function updateStats(){
    el.stats.textContent = `верно ${state.correct} • ошибки ${state.wrong} • серия ${state.streak}`;
    el.onlyWrong.checked = !!state.settings.onlyWrong;
    el.hardMode.checked = !!state.settings.hardMode;
  }

  function escapeHtml(s){
    return String(s)
      .replaceAll("&","&amp;")
      .replaceAll("<","&lt;")
      .replaceAll(">","&gt;")
      .replaceAll('"',"&quot;")
      .replaceAll("'","&#039;");
  }

  el.nextBtn.addEventListener("click", render);

  el.menuBtn.addEventListener("click", () => el.drawer.classList.remove("hidden"));
  el.closeDrawer.addEventListener("click", () => el.drawer.classList.add("hidden"));
  el.drawer.addEventListener("click", e => {
    if(e.target === el.drawer) el.drawer.classList.add("hidden");
  });

  el.onlyWrong.addEventListener("change", e => {
    state.settings.onlyWrong = e.target.checked;
    save();
  });

  el.hardMode.addEventListener("change", e => {
    state.settings.hardMode = e.target.checked;
    save();
  });

  el.resetBtn.addEventListener("click", () => {
    if(confirm("Сбросить прогресс?")){
      state = defaultState();
      save();
      current = null;
      el.drawer.classList.add("hidden");
      render();
    }
  });

  document.addEventListener("keydown", e => {
    if(e.key === "ArrowRight" || e.key === " "){
      if(!el.nextBtn.classList.contains("hidden")){
        e.preventDefault();
        render();
      }
    }
  });

  if("serviceWorker" in navigator && location.protocol !== "file:"){
    navigator.serviceWorker.register("./service-worker.js").catch(()=>{});
  }

  render();
})();
