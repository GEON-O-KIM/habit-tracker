(function () {
  "use strict";

  var STORAGE_KEY = "habit-tracker/habits";

  /* ---------- 날짜 유틸 (시간 무시, 자정 기준) ---------- */

  function toKey(date) {
    var y = date.getFullYear();
    var m = String(date.getMonth() + 1).padStart(2, "0");
    var d = String(date.getDate()).padStart(2, "0");
    return y + "-" + m + "-" + d;
  }

  function todayKey() {
    return toKey(new Date());
  }

  // 두 날짜 키의 차이(일). b - a
  function daysBetween(aKey, bKey) {
    var a = new Date(aKey + "T00:00:00");
    var b = new Date(bKey + "T00:00:00");
    return Math.round((b - a) / 86400000);
  }

  function addDays(key, n) {
    var d = new Date(key + "T00:00:00");
    d.setDate(d.getDate() + n);
    return toKey(d);
  }

  var WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];
  function weekdayOf(key) {
    return WEEKDAYS[new Date(key + "T00:00:00").getDay()];
  }

  function formatToday() {
    var d = new Date();
    return d.getFullYear() + "년 " + (d.getMonth() + 1) + "월 " + d.getDate() + "일";
  }

  /* ---------- 저장소 ---------- */

  function loadHabits() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }

  function saveHabits(habits) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(habits));
    } catch (e) {
      /* 저장 실패는 조용히 무시 (프로토타입) */
    }
  }

  /* ---------- 상태 ---------- */

  var habits = loadHabits();
  var justResistedId = null; // 방금 "참음"을 누른 습관 (숫자 애니메이션용)

  // 예전 데이터 호환: 없는 필드 기본값 채우기
  habits.forEach(function (h) {
    if (typeof h.resistCount !== "number") h.resistCount = 0;
    if (typeof h.violationCount !== "number") h.violationCount = 0;
    if (!h.resistDate) h.resistDate = todayKey();
    if (!Array.isArray(h.resistHistory)) h.resistHistory = [];
  });

  // 참음 카운트는 하루 단위. 자정을 넘겼으면 그날의 마무리 상태를 기록에 남기고 0으로 리셋.
  function rolloverResist() {
    var today = todayKey();
    var changed = false;
    habits.forEach(function (h) {
      if (h.resistDate === today) return;

      // 마지막 활동일의 마무리 캐릭터 상태 저장
      h.resistHistory.push({ date: h.resistDate, count: h.resistCount });
      // 그 뒤로 건너뛴 날들은 "맨몸(0)"으로 마무리한 것으로 채움
      var cursor = addDays(h.resistDate, 1);
      var guard = 0;
      while (cursor !== today && guard < 400) {
        h.resistHistory.push({ date: cursor, count: 0 });
        cursor = addDays(cursor, 1);
        guard++;
      }
      if (h.resistHistory.length > 7) {
        h.resistHistory = h.resistHistory.slice(-7);
      }
      h.resistCount = 0;
      h.resistDate = today;
      changed = true;
    });
    if (changed) saveHabits(habits);
  }

  var listEl = document.getElementById("habitList");
  var emptyEl = document.getElementById("emptyState");
  var summaryEl = document.getElementById("summary");
  var formEl = document.getElementById("habitForm");
  var nameEl = document.getElementById("habitName");
  var goalEl = document.getElementById("habitGoal");

  /* ---------- 렌더 ---------- */

  function render() {
    rolloverResist();
    var today = todayKey();
    listEl.innerHTML = "";

    habits.forEach(function (habit) {
      listEl.appendChild(buildCard(habit, today));
    });

    emptyEl.classList.toggle("is-hidden", habits.length > 0);

    if (habits.length === 0) {
      summaryEl.textContent = "";
    } else {
      var best = 0;
      habits.forEach(function (h) {
        var d = daysBetween(h.streakStartDate, today);
        if (d > best) best = d;
      });
      summaryEl.textContent =
        "진행 중 " + habits.length + "개 · 최고 연속 " + best + "일";
    }
  }

  function buildCard(habit, today) {
    var elapsed = daysBetween(habit.streakStartDate, today); // D+elapsed
    if (elapsed < 0) elapsed = 0;
    var remaining = habit.goalDays - elapsed; // D-remaining
    var achieved = remaining <= 0;
    var percent = Math.min(100, Math.round((elapsed / habit.goalDays) * 100));

    var card = document.createElement("div");
    card.className = "habit";

    /* 헤더 */
    var head = document.createElement("div");
    head.className = "habit__head";

    var name = document.createElement("div");
    name.className = "habit__name";
    name.textContent = habit.name;

    var actions = document.createElement("div");
    actions.className = "habit__actions";

    var editBtn = document.createElement("button");
    editBtn.className = "icon-btn";
    editBtn.type = "button";
    editBtn.textContent = "✏️";
    editBtn.title = "이름 / 목표 수정";
    editBtn.addEventListener("click", function () {
      editHabit(habit.id);
    });

    var delBtn = document.createElement("button");
    delBtn.className = "icon-btn";
    delBtn.type = "button";
    delBtn.textContent = "🗑️";
    delBtn.title = "삭제";
    delBtn.addEventListener("click", function () {
      if (confirm('"' + habit.name + '" 습관을 삭제할까요?')) {
        deleteHabit(habit.id);
      }
    });

    actions.appendChild(editBtn);
    actions.appendChild(delBtn);
    head.appendChild(name);
    head.appendChild(actions);

    /* D-day 태그 */
    var dday = document.createElement("div");
    dday.className = "habit__dday";

    var elapsedTag = document.createElement("span");
    elapsedTag.className = "tag";
    elapsedTag.textContent = "D+" + elapsed;
    dday.appendChild(elapsedTag);

    var goalTag = document.createElement("span");
    if (achieved) {
      goalTag.className = "tag tag--achieved";
      goalTag.textContent = "🎉 목표 달성! (" + habit.goalDays + "일)";
    } else {
      goalTag.className = "tag tag--goal";
      goalTag.textContent = "목표까지 D-" + remaining;
    }
    dday.appendChild(goalTag);

    /* 진행바 */
    var progress = document.createElement("div");
    progress.className = "progress";
    var bar = document.createElement("div");
    bar.className = "progress__bar" + (achieved ? " progress__bar--achieved" : "");
    bar.style.width = percent + "%";
    progress.appendChild(bar);

    var meta = document.createElement("div");
    meta.className = "habit__meta";
    var metaLeft = document.createElement("span");
    metaLeft.textContent = "시작일 " + habit.streakStartDate;
    var metaRight = document.createElement("span");
    metaRight.textContent = percent + "%";
    meta.appendChild(metaLeft);
    meta.appendChild(metaRight);

    /* 버튼 */
    var buttons = document.createElement("div");
    buttons.className = "habit__buttons";

    var resistBtn = document.createElement("button");
    resistBtn.type = "button";
    resistBtn.className = "btn btn--resist";
    resistBtn.textContent = "🛡️ 참음";
    resistBtn.title = "유혹을 참았을 때 기록 (D-day 유지)";
    resistBtn.addEventListener("click", function () {
      resistHabit(habit.id);
    });

    var violateBtn = document.createElement("button");
    violateBtn.type = "button";
    violateBtn.className = "btn btn--violate";
    violateBtn.textContent = "⚠️ 어김";
    violateBtn.addEventListener("click", function () {
      if (
        confirm(
          '"' +
            habit.name +
            '" 습관을 어겼나요?\nD-day와 참음 캐릭터가 초기화되고, 어긴 횟수가 1 증가합니다.'
        )
      ) {
        violateHabit(habit.id);
      }
    });

    buttons.appendChild(resistBtn);
    buttons.appendChild(violateBtn);

    /* 참음 강조 블록 */
    var resistBox = document.createElement("div");
    resistBox.className = "resist-box";

    var resistTop = document.createElement("div");
    resistTop.className = "resist-box__top";

    var resistNum = document.createElement("span");
    resistNum.className = "resist-box__num";
    if (habit.id === justResistedId) resistNum.classList.add("is-bumped");
    resistNum.textContent = habit.resistCount;

    var resistLabel = document.createElement("span");
    resistLabel.className = "resist-box__label";
    resistLabel.textContent = "번 참았어요 (오늘)";

    resistTop.appendChild(resistNum);
    resistTop.appendChild(resistLabel);

    resistBox.appendChild(resistTop);
    resistBox.appendChild(
      buildResistCharacter(habit.resistCount, habit.id === justResistedId)
    );
    if (habit.resistHistory.length > 0) {
      resistBox.appendChild(buildWeekStrip(habit.resistHistory));
    }

    /* 어김 (작게) */
    var violations = document.createElement("div");
    violations.className = "habit__violations";
    violations.textContent = "어긴 횟수 " + habit.violationCount + "회";

    card.appendChild(head);
    card.appendChild(dday);
    card.appendChild(progress);
    card.appendChild(meta);
    card.appendChild(buttons);
    card.appendChild(resistBox);
    card.appendChild(violations);

    return card;
  }

  /* ---------- 참음 SD 캐릭터 ---------- */

  // 참음 1번마다 다음 옷으로. 인덱스 = 오늘의 참음 횟수 (마지막 옷에서 멈춤).
  var OUTFITS = [
    { name: "맨몸으로 시작", style: "none" },
    { name: "티셔츠", style: "tee", c: "#4f7cff", c2: "#3b63d6" },
    { name: "반팔 반바지", style: "tee", c: "#e5794b", c2: "#c86038", shorts: "#3b6ea5" },
    { name: "깔끔한 셔츠", style: "shirt" },
    { name: "셔츠와 슬랙스", style: "shirt", pants: "#3b4b66" },
    { name: "포근한 스웨터", style: "sweater", c: "#3f9e6a", c2: "#33845a", pants: "#3b4b66" },
    { name: "멋진 재킷", style: "jacket", c: "#574ccb", c2: "#463cae", pants: "#2f3646" },
    { name: "정장 차림", style: "suit", pants: "#23252e", tie: "#e5794b" },
    { name: "정장과 중절모", style: "suit", pants: "#23252e", tie: "#e5794b", hat: true },
    { name: "망토 두른 신사", style: "suit", pants: "#23252e", tie: "#f6c945", hat: true, cape: true },
    { name: "왕관 쓴 영웅", style: "suit", pants: "#23252e", tie: "#f6c945", cape: true, crown: true }
  ];
  var MAX_TIER = OUTFITS.length - 1;

  function buildResistCharacter(count, animateLast) {
    var wrap = document.createElement("div");
    wrap.className = "sd";

    var tier = Math.min(count, MAX_TIER);
    var prevTier = Math.min(Math.max(count - 1, 0), MAX_TIER);
    var leveledUp = animateLast && count > 0 && tier !== prevTier;

    var stage = document.createElement("div");
    stage.className = "sd__stage";
    if (animateLast) {
      stage.classList.add(leveledUp ? "sd__stage--levelup" : "sd__stage--bob");
    }

    var shadow = document.createElement("div");
    shadow.className = "sd__shadow";
    stage.appendChild(shadow);

    var GRID = 32;
    var S = 8;
    var canvas = document.createElement("canvas");
    canvas.className = "sd__canvas";
    canvas.width = GRID * S;
    canvas.height = GRID * S;
    var ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = false;
    drawCharacter(ctx, tier, S);
    stage.appendChild(canvas);

    if (leveledUp) {
      for (var i = 0; i < 5; i++) {
        var sp = document.createElement("span");
        sp.className = "sd__spark sd__spark--" + i;
        stage.appendChild(sp);
      }
    }

    wrap.appendChild(stage);

    var label = document.createElement("div");
    label.className = "sd__label";
    label.textContent = OUTFITS[tier].name;
    wrap.appendChild(label);

    var hint = document.createElement("div");
    hint.className = "sd__hint";
    hint.textContent =
      tier < MAX_TIER ? "한 번 더 참으면 새 옷!" : "최고의 옷을 완성했어요!";
    wrap.appendChild(hint);

    return wrap;
  }

  // 최근 7일, 하루를 마무리한 캐릭터 상태를 작게 나열
  function buildWeekStrip(history) {
    var strip = document.createElement("div");
    strip.className = "week";

    var title = document.createElement("div");
    title.className = "week__title";
    title.textContent = "지난 7일 마무리";
    strip.appendChild(title);

    var row = document.createElement("div");
    row.className = "week__row";

    history.slice(-7).forEach(function (entry) {
      var cell = document.createElement("div");
      cell.className = "week__cell";

      var mini = document.createElement("canvas");
      mini.className = "week__canvas";
      mini.width = 32 * 2;
      mini.height = 32 * 2;
      var mctx = mini.getContext("2d");
      mctx.imageSmoothingEnabled = false;
      drawCharacter(mctx, Math.min(entry.count, MAX_TIER), 2);
      cell.appendChild(mini);

      var day = document.createElement("span");
      day.className = "week__day";
      day.textContent = weekdayOf(entry.date);
      cell.appendChild(day);

      row.appendChild(cell);
    });

    strip.appendChild(row);
    return strip;
  }

  // 32x32 격자에 도트 캐릭터를 그린다. tier(=오늘 참음 횟수)에 맞는 옷을 입힌다.
  function drawCharacter(ctx, tier, S) {
    function p(x, y, w, h, c) {
      ctx.fillStyle = c;
      ctx.fillRect(x * S, y * S, w * S, h * S);
    }

    var o = OUTFITS[Math.min(tier, MAX_TIER)];
    var SKIN = "#f6cfa6";
    var SKIN_D = "#e2b18c";
    var OL = "#2c2622"; // 외곽선

    // ---- 망토 (맨 뒤) ----
    if (o.cape) {
      p(7, 15, 18, 14, "#5e1822");
      p(8, 16, 16, 12, "#a8323f");
      p(9, 17, 14, 10, "#c2434f");
      p(13, 15, 6, 2, "#f6c945"); // 어깨 잠금장식
    }

    // ---- 실루엣(외곽선) ----
    p(9, 3, 14, 13, OL); // 머리 (네 모서리 1px 둥글게)
    p(8, 5, 1, 9, OL);
    p(23, 5, 1, 9, OL);
    p(10, 15, 12, 10, OL); // 몸통
    p(8, 16, 3, 9, OL); // 왼팔
    p(21, 16, 3, 9, OL); // 오른팔
    p(12, 23, 4, 7, OL); // 왼다리
    p(16, 23, 4, 7, OL); // 오른다리

    // ---- 맨살 ----
    p(10, 4, 12, 11, SKIN); // 얼굴
    p(9, 6, 1, 7, SKIN);
    p(22, 6, 1, 7, SKIN);
    p(13, 15, 6, 1, SKIN_D); // 목
    p(11, 16, 10, 8, SKIN); // 몸통
    p(9, 17, 2, 6, SKIN); // 왼팔
    p(22, 17, 2, 6, SKIN); // 오른팔
    p(13, 24, 2, 4, SKIN); // 왼다리
    p(18, 24, 2, 4, SKIN); // 오른다리
    p(8, 10, 1, 3, SKIN_D); // 귀
    p(23, 10, 1, 3, SKIN_D);

    // ---- 하의 ----
    if (o.shorts) {
      p(12, 22, 3, 3, o.shorts);
      p(17, 22, 3, 3, o.shorts);
    } else if (o.pants) {
      p(12, 23, 3, 5, o.pants);
      p(17, 23, 3, 5, o.pants);
    }
    // 신발
    var dressShoe = o.pants || o.style === "jacket" || o.style === "suit";
    var shoe = dressShoe ? "#1c1f26" : "#6a5f52";
    p(12, 28, 4, 2, shoe);
    p(16, 28, 4, 2, shoe);

    // ---- 상의 ----
    if (o.style === "none") {
      p(12, 21, 8, 3, "#e2e6ef"); // 속옷
    } else if (o.style === "tee") {
      p(11, 16, 10, 6, o.c);
      p(9, 16, 2, 3, o.c); // 짧은 소매
      p(22, 16, 2, 3, o.c);
      p(11, 21, 10, 1, o.c2); // 밑단
    } else if (o.style === "shirt") {
      p(11, 16, 10, 8, "#eef1f7");
      p(9, 16, 2, 6, "#eef1f7");
      p(22, 16, 2, 6, "#e3e7f0");
      p(15, 16, 1, 8, "#c7cede"); // 단추선
    } else if (o.style === "sweater") {
      p(11, 15, 10, 9, o.c); // 목까지 덮는 니트
      p(9, 16, 2, 7, o.c);
      p(22, 16, 2, 7, o.c2);
      p(13, 15, 4, 1, o.c2); // 칼라
      p(11, 19, 10, 1, o.c2); // 짜임선
    } else if (o.style === "jacket") {
      p(12, 16, 8, 8, "#e7eaf2"); // 안쪽 셔츠
      p(15, 16, 1, 8, "#c7cede");
      p(11, 16, 3, 8, o.c); // 재킷 자락
      p(18, 16, 3, 8, o.c);
      p(9, 16, 2, 7, o.c); // 긴소매
      p(22, 16, 2, 7, o.c2);
      p(12, 16, 2, 3, o.c2); // 옷깃
      p(18, 16, 2, 3, o.c2);
    } else if (o.style === "suit") {
      p(11, 16, 10, 8, "#23252e");
      p(9, 16, 2, 7, "#23252e");
      p(22, 16, 2, 7, "#1a1c22");
      p(14, 16, 4, 8, "#eef1f7"); // 셔츠 앞판
      p(12, 16, 2, 3, "#15161c"); // 옷깃
      p(18, 16, 2, 3, "#15161c");
    }
    if (o.tie) p(15, 17, 2, 5, o.tie);

    // ---- 머리카락 ----
    p(9, 3, 14, 3, "#6b4a2f");
    p(9, 4, 1, 4, "#6b4a2f");
    p(22, 4, 1, 4, "#6b4a2f");
    p(8, 5, 1, 3, "#6b4a2f");
    p(23, 5, 1, 3, "#6b4a2f");
    p(9, 5, 3, 2, "#6b4a2f");
    p(20, 5, 3, 2, "#6b4a2f");
    p(11, 3, 10, 1, "#7d5941"); // 하이라이트

    // ---- 눈, 입 ----
    p(12, 9, 2, 3, "#2a2320");
    p(18, 9, 2, 3, "#2a2320");
    p(12, 9, 1, 1, "#ffffff");
    p(18, 9, 1, 1, "#ffffff");
    if (tier >= 7) {
      p(14, 13, 4, 1, "#a85f48"); // 미소
      p(15, 14, 2, 1, "#a85f48");
    } else {
      p(15, 13, 2, 1, "#a85f48");
    }

    // ---- 모자 / 왕관 ----
    if (o.hat) {
      p(7, 4, 18, 2, "#1b1d24"); // 챙
      p(9, 0, 14, 4, "#23252e");
      p(9, 3, 14, 1, "#3a3d47"); // 밴드
    }
    if (o.crown) {
      p(9, 1, 14, 3, "#f6c945");
      p(9, 0, 2, 2, "#f6c945");
      p(15, 0, 2, 2, "#f6c945");
      p(21, 0, 2, 2, "#f6c945");
      p(15, 1, 2, 2, "#4f7cff"); // 보석
      p(11, 0, 1, 1, "#fff1b8");
    }
  }

  /* ---------- 액션 ---------- */

  function findHabit(id) {
    for (var i = 0; i < habits.length; i++) {
      if (habits[i].id === id) return habits[i];
    }
    return null;
  }

  function addHabit(name, goalDays) {
    habits.push({
      id: String(Date.now()) + Math.random().toString(16).slice(2),
      name: name,
      goalDays: goalDays,
      streakStartDate: todayKey(),
      violationCount: 0,
      resistCount: 0,
      resistDate: todayKey(),
      resistHistory: [],
      createdAt: todayKey()
    });
    saveHabits(habits);
    render();
  }

  function deleteHabit(id) {
    habits = habits.filter(function (h) {
      return h.id !== id;
    });
    saveHabits(habits);
    render();
  }

  function editHabit(id) {
    var habit = findHabit(id);
    if (!habit) return;

    var newName = prompt("습관 이름", habit.name);
    if (newName === null) return;
    newName = newName.trim();
    if (!newName) return;

    var newGoalRaw = prompt("목표 일수", String(habit.goalDays));
    if (newGoalRaw === null) return;
    var newGoal = parseInt(newGoalRaw, 10);
    if (isNaN(newGoal) || newGoal < 1) return;

    habit.name = newName;
    habit.goalDays = newGoal;
    saveHabits(habits);
    render();
  }

  function resistHabit(id) {
    rolloverResist(); // 날이 바뀌었으면 어제치를 기록에 남기고 리셋
    var habit = findHabit(id);
    if (!habit) return;
    habit.resistCount += 1;
    justResistedId = id;
    saveHabits(habits);
    render();
    justResistedId = null;
  }

  function violateHabit(id) {
    rolloverResist();
    var habit = findHabit(id);
    if (!habit) return;
    habit.violationCount += 1;
    habit.streakStartDate = todayKey(); // D-day 즉시 초기화
    habit.resistCount = 0; // 참음 캐릭터도 초기화 (오늘 마무리 상태는 자정에 기록됨)
    saveHabits(habits);
    render();
  }

  /* ---------- 이벤트 ---------- */

  formEl.addEventListener("submit", function (e) {
    e.preventDefault();
    var name = nameEl.value.trim();
    var goalDays = parseInt(goalEl.value, 10);
    if (!name || isNaN(goalDays) || goalDays < 1) return;
    addHabit(name, goalDays);
    formEl.reset();
    goalEl.value = 30;
    nameEl.focus();
  });

  document.getElementById("resetAll").addEventListener("click", function () {
    if (confirm("모든 습관과 기록을 삭제할까요? 되돌릴 수 없습니다.")) {
      habits = [];
      saveHabits(habits);
      render();
    }
  });

  /* ---------- 초기화 ---------- */

  document.getElementById("todayDate").textContent = formatToday();
  render();
})();
