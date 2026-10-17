(() => {
  const WORDS_PER_LESSON = 5;
  const TOTAL_LESSONS = Math.ceil(WORDS.length / WORDS_PER_LESSON);
  const STORAGE_KEY = "lessoneasyenglish-progress-v1";

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  // ---------- الحفظ ----------
  // completed: عدد الدروس المجتازة، stage: study | test1 | test2 | done
  function loadState() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (saved && Number.isInteger(saved.completed)) return saved;
    } catch (e) {}
    return { completed: 0, stage: "study" };
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {}
  }

  let state = loadState();

  function currentLessonIndex() {
    return state.stage === "done" ? state.completed - 1 : state.completed;
  }

  function lessonWords(index) {
    const start = index * WORDS_PER_LESSON;
    return WORDS.slice(start, start + WORDS_PER_LESSON).map((w, i) => ({ ...w, num: start + i + 1 }));
  }

  // ---------- النطق ----------
  let voices = [];
  function loadVoices() {
    if (!("speechSynthesis" in window)) return;
    voices = speechSynthesis.getVoices().filter((v) => /^en[-_]/i.test(v.lang));
  }
  if ("speechSynthesis" in window) {
    loadVoices();
    speechSynthesis.onvoiceschanged = loadVoices;
  }

  function pickVoice() {
    const preferred = ["Google US English", "Samantha", "Microsoft Aria", "Microsoft Jenny", "Microsoft Zira"];
    for (const name of preferred) {
      const v = voices.find((voice) => voice.name.includes(name));
      if (v) return v;
    }
    return voices.find((v) => /en[-_]US/i.test(v.lang)) || voices[0] || null;
  }

  function speak(text, rate, button) {
    if (!("speechSynthesis" in window)) {
      alert("المتصفح لا يدعم النطق الصوتي، جرّب متصفح Chrome أو Safari.");
      return;
    }
    speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = "en-US";
    utter.rate = rate;
    const voice = pickVoice();
    if (voice) utter.voice = voice;
    if (button) {
      button.classList.add("playing");
      utter.onend = utter.onerror = () => button.classList.remove("playing");
    }
    speechSynthesis.speak(utter);
  }

  const SPEAKER_ICON =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5 6 9H2v6h4l5 4V5z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M19 5a10 10 0 0 1 0 14"/></svg>';

  function speakButton(word, { slow = false, label = true } = {}) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "speak" + (slow ? " slow" : "");
    btn.title = slow ? "نطق بطيء" : "استمع للنطق";
    btn.setAttribute("aria-label", `${btn.title}: ${word}`);
    btn.innerHTML = SPEAKER_ICON + (label ? `<span>${slow ? "ببطء" : "استمع"}</span>` : "");
    btn.addEventListener("click", () => speak(word, slow ? 0.45 : 0.85, btn));
    return btn;
  }

  // ---------- تصحيح الإجابات ----------
  function normalizeEnglish(s) {
    return s.toLowerCase().replace(/[^a-z' ]/g, "").replace(/\s+/g, " ").trim();
  }

  function normalizeArabic(s) {
    return s
      .replace(/\(.*?\)/g, " ")
      .replace(/[ً-ٰٟـ]/g, "") // التشكيل والتطويل
      .replace(/[أإآٱ]/g, "ا")
      .replace(/ة/g, "ه")
      .replace(/ى/g, "ي")
      .replace(/ؤ/g, "و")
      .replace(/ئ/g, "ي")
      .replace(/[^ء-ي\s]/g, " ")
      .split(/\s+/)
      .filter(Boolean)
      .map((w) => (w.length > 3 && w.startsWith("ال") ? w.slice(2) : w))
      .join(" ");
  }

  function levenshtein(a, b) {
    const dp = Array.from({ length: a.length + 1 }, (_, i) => [i]);
    for (let j = 1; j <= b.length; j++) dp[0][j] = j;
    for (let i = 1; i <= a.length; i++) {
      for (let j = 1; j <= b.length; j++) {
        dp[i][j] = Math.min(
          dp[i - 1][j] + 1,
          dp[i][j - 1] + 1,
          dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
        );
      }
    }
    return dp[a.length][b.length];
  }

  function isEnglishCorrect(input, word) {
    return normalizeEnglish(input) === normalizeEnglish(word.en);
  }

  // نقبل أي معنى من المعاني المذكورة مع تسامح بسيط في الإملاء والهمزات و«ال» التعريف
  function isArabicCorrect(input, word) {
    const answer = normalizeArabic(input);
    if (!answer) return false;
    return word.meanings.some((meaning) => {
      const target = normalizeArabic(meaning);
      if (!target) return false;
      const variants = [target];
      // الفعل المضارع والماضي: يكتب / كتب
      if (target.startsWith("ي") && target.length >= 4) variants.push(target.slice(1));
      return variants.some((v) => {
        if (answer === v) return true;
        if (v.length >= 4 && levenshtein(answer, v) <= 1) return true;
        if (v.length >= 3 && answer.split(" ").includes(v)) return true;
        if (answer.length >= 3 && v.includes(answer) && answer.length >= v.length * 0.6) return true;
        return false;
      });
    });
  }

  // ---------- العرض ----------
  function updateProgress() {
    const learned = Math.min(state.completed * WORDS_PER_LESSON, WORDS.length);
    $("#learnedCount").textContent = learned;
    $("#lessonNum").textContent = Math.min(currentLessonIndex() + 1, TOTAL_LESSONS);
    $("#progressFill").style.width = (learned / WORDS.length) * 100 + "%";
  }

  function updateSteps() {
    const order = ["study", "test1", "test2"];
    const pos = state.stage === "done" ? 3 : order.indexOf(state.stage);
    $$("#steps li").forEach((li, i) => {
      li.classList.toggle("done", i < pos);
      li.classList.toggle("current", i === pos);
    });
    $("#steps").classList.toggle("hidden", isFinished());
  }

  function isFinished() {
    return state.completed >= TOTAL_LESSONS && state.stage !== "done";
  }

  function showStage(name) {
    ["study", "test1", "test2", "done", "finished"].forEach((s) =>
      $("#stage-" + s).classList.toggle("hidden", s !== name)
    );
  }

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function renderStudy() {
    const grid = $("#studyGrid");
    grid.innerHTML = "";
    lessonWords(currentLessonIndex()).forEach((w) => {
      const card = document.createElement("article");
      card.className = "word-card";
      card.innerHTML = `
        <div class="word-top">
          <span class="word-en"></span>
          <span class="word-num">#${w.num}</span>
        </div>
        <div class="word-ar"></div>
        <div class="speak-row"></div>`;
      card.querySelector(".word-en").textContent = w.en;
      card.querySelector(".word-ar").textContent = w.meanings.join(" / ");
      const row = card.querySelector(".speak-row");
      row.append(speakButton(w.en), speakButton(w.en, { slow: true }));
      grid.append(card);
    });
  }

  function renderQuiz(formId, mode) {
    const form = $("#" + formId);
    form.innerHTML = "";
    shuffle(lessonWords(currentLessonIndex())).forEach((w) => {
      const row = document.createElement("div");
      row.className = "q-row";
      row.dataset.num = w.num;

      const prompt = document.createElement("div");
      const input = document.createElement("input");
      input.type = "text";
      input.autocapitalize = "off";
      input.spellcheck = false;

      if (mode === "ar-to-en") {
        prompt.className = "q-prompt";
        prompt.textContent = w.meanings.join(" / ");
        input.className = "ltr";
        input.dir = "ltr";
        input.placeholder = "English word";
        input.setAttribute("aria-label", `الكلمة الإنجليزية لـ ${w.meanings[0]}`);
      } else {
        prompt.className = "q-prompt en";
        const span = document.createElement("span");
        span.textContent = w.en;
        prompt.append(span, speakButton(w.en, { label: false }));
        input.placeholder = "اكتب المعنى بالعربي";
        input.setAttribute("aria-label", `معنى ${w.en} بالعربي`);
      }

      const mark = document.createElement("div");
      mark.className = "q-mark";
      row.append(prompt, input, mark);
      form.append(row);
    });
    const first = form.querySelector("input");
    if (first) setTimeout(() => first.focus(), 50);
  }

  function gradeQuiz(formId, feedbackId, check) {
    const words = lessonWords(currentLessonIndex());
    const rows = $$(`#${formId} .q-row`);
    let correct = 0;
    let firstWrong = null;
    rows.forEach((row) => {
      const word = words.find((w) => String(w.num) === row.dataset.num);
      const input = row.querySelector("input");
      const ok = check(input.value, word);
      row.classList.remove("wrong");
      void row.offsetWidth; // لإعادة تشغيل حركة الاهتزاز
      row.classList.toggle("correct", ok);
      row.classList.toggle("wrong", !ok);
      row.querySelector(".q-mark").textContent = ok ? "✅" : "❌";
      input.readOnly = ok;
      if (ok) correct++;
      else if (!firstWrong) firstWrong = input;
    });

    const fb = $("#" + feedbackId);
    if (correct === rows.length) {
      fb.className = "feedback ok";
      fb.textContent = "ممتاز! كل الإجابات صحيحة 🎉";
      return true;
    }
    fb.className = "feedback err";
    fb.textContent = `أجبت ${correct} من ${rows.length} بشكل صحيح. صحّح الإجابات الحمراء، أو ارجع لمراجعة الكلمات.`;
    if (firstWrong) firstWrong.focus();
    return false;
  }

  function render() {
    updateProgress();
    updateSteps();
    $("#feedback1").textContent = "";
    $("#feedback2").textContent = "";

    if (isFinished()) {
      showStage("finished");
      return;
    }
    if (state.stage === "study") renderStudy();
    if (state.stage === "test1") renderQuiz("quiz1", "ar-to-en");
    if (state.stage === "test2") renderQuiz("quiz2", "en-to-ar");
    if (state.stage === "done") {
      const remaining = WORDS.length - state.completed * WORDS_PER_LESSON;
      $("#doneText").textContent =
        remaining > 0
          ? `أتقنت ${state.completed * WORDS_PER_LESSON} كلمة حتى الآن، وتبقّى ${remaining} كلمة. استمر!`
          : "أتقنت جميع الكلمات!";
      $("#nextLesson").textContent = remaining > 0 ? "افتح الكلمات الخمس التالية" : "إنهاء";
    }
    showStage(state.stage);
  }

  function setStage(stage) {
    state.stage = stage;
    saveState();
    render();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // ---------- كلماتي ----------
  function renderMyWords() {
    const learned = WORDS.slice(0, state.completed * WORDS_PER_LESSON);
    const q = $("#search").value.trim();
    const qEn = normalizeEnglish(q);
    const qAr = normalizeArabic(q);
    const list = $("#myWordsList");
    list.innerHTML = "";
    $("#mywordsHint").textContent = learned.length
      ? `أتقنت ${learned.length} كلمة. اضغط على أيقونة الصوت لسماع النطق.`
      : "";

    const filtered = learned
      .map((w, i) => ({ ...w, num: i + 1 }))
      .filter(
        (w) =>
          !q ||
          (qEn && w.en.toLowerCase().includes(qEn)) ||
          (qAr && w.meanings.some((m) => normalizeArabic(m).includes(qAr)))
      );

    if (!filtered.length) {
      list.innerHTML = `<div class="empty">${
        learned.length ? "لا توجد نتائج." : "لم تُتقن أي كلمة بعد. اجتز اختباري الدرس الأول لتظهر كلماتك هنا."
      }</div>`;
      return;
    }

    const frag = document.createDocumentFragment();
    filtered.forEach((w) => {
      const item = document.createElement("div");
      item.className = "list-item";
      item.innerHTML = `<span class="word-num">#${w.num}</span><span class="en"></span><span class="ar"></span>`;
      item.querySelector(".en").textContent = w.en;
      item.querySelector(".ar").textContent = w.meanings.join(" / ");
      item.append(speakButton(w.en, { label: false }));
      frag.append(item);
    });
    list.append(frag);
  }

  // ---------- الاحتفال ----------
  function confetti() {
    const canvas = $("#confetti");
    const ctx = canvas.getContext("2d");
    canvas.width = innerWidth;
    canvas.height = innerHeight;
    const colors = ["#6a4cff", "#9b5cff", "#ff7a59", "#17a673", "#2bc4ff", "#ffc93c"];
    const pieces = Array.from({ length: 160 }, () => ({
      x: Math.random() * canvas.width,
      y: -20 - Math.random() * canvas.height * 0.5,
      w: 6 + Math.random() * 6,
      h: 8 + Math.random() * 8,
      vy: 2 + Math.random() * 4,
      vx: -2 + Math.random() * 4,
      r: Math.random() * Math.PI,
      vr: -0.2 + Math.random() * 0.4,
      c: colors[Math.floor(Math.random() * colors.length)],
    }));
    const startTime = performance.now();
    (function frame(now) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      pieces.forEach((p) => {
        p.x += p.vx;
        p.y += p.vy;
        p.r += p.vr;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.r);
        ctx.fillStyle = p.c;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      });
      if (now - startTime < 3000) requestAnimationFrame(frame);
      else ctx.clearRect(0, 0, canvas.width, canvas.height);
    })(startTime);
  }

  // ---------- الأحداث ----------
  $("#startTest1").addEventListener("click", () => setStage("test1"));

  $$(".back-study").forEach((btn) => btn.addEventListener("click", () => setStage("study")));

  $("#quiz1").addEventListener("submit", (e) => {
    e.preventDefault();
    if (gradeQuiz("quiz1", "feedback1", isEnglishCorrect)) {
      setTimeout(() => setStage("test2"), 900);
    }
  });

  $("#quiz2").addEventListener("submit", (e) => {
    e.preventDefault();
    if (gradeQuiz("quiz2", "feedback2", isArabicCorrect)) {
      setTimeout(() => {
        state.completed++;
        setStage("done");
        confetti();
      }, 900);
    }
  });

  $("#nextLesson").addEventListener("click", () => setStage("study"));

  $$(".tab").forEach((tab) =>
    tab.addEventListener("click", () => {
      $$(".tab").forEach((t) => t.classList.toggle("active", t === tab));
      const view = tab.dataset.view;
      $("#view-learn").classList.toggle("hidden", view !== "learn");
      $("#view-mywords").classList.toggle("hidden", view !== "mywords");
      if (view === "mywords") renderMyWords();
    })
  );

  $("#search").addEventListener("input", renderMyWords);

  $("#resetBtn").addEventListener("click", () => {
    if (confirm("هل تريد حذف تقدمك والبدء من الدرس الأول؟")) {
      state = { completed: 0, stage: "study" };
      saveState();
      render();
    }
  });

  render();
})();
