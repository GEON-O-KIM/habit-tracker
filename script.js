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
  });

  var listEl = document.getElementById("habitList");
  var emptyEl = document.getElementById("emptyState");
  var summaryEl = document.getElementById("summary");
  var formEl = document.getElementById("habitForm");
  var nameEl = document.getElementById("habitName");
  var goalEl = document.getElementById("habitGoal");

  /* ---------- 렌더 ---------- */

  function render() {
    var today = todayKey();
    listEl.innerHTML = "";

    habits.forEach(function (habit) {
      listEl.appendChild(buildCard(habit, today));
    });

    emptyEl.classList.toggle("is-hidden", habits.length > 0);

    var doneCount = habits.filter(function (h) {
      return h.checkedDates.indexOf(today) !== -1;
    }).length;
    summaryEl.textContent = "오늘 완료 " + doneCount + " / " + habits.length;
  }

  function buildCard(habit, today) {
    var elapsed = daysBetween(habit.streakStartDate, today); // D+elapsed
    if (elapsed < 0) elapsed = 0;
    var remaining = habit.goalDays - elapsed; // D-remaining
    var achieved = remaining <= 0;
    var percent = Math.min(100, Math.round((elapsed / habit.goalDays) * 100));
    var isDone = habit.checkedDates.indexOf(today) !== -1;

    var card = document.createElement("div");
    card.className = "habit" + (isDone ? " habit--done" : "");

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

    var checkBtn = document.createElement("button");
    checkBtn.type = "button";
    checkBtn.className = "btn btn--check" + (isDone ? " is-active" : "");
    checkBtn.textContent = isDone ? "✅ 오늘 완료됨" : "오늘 완료";
    checkBtn.addEventListener("click", function () {
      toggleToday(habit.id);
    });

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
            '" 습관을 어겼나요?\nD-day가 D+0으로 초기화되고 어긴 횟수가 1 증가합니다.'
        )
      ) {
        violateHabit(habit.id);
      }
    });

    buttons.appendChild(checkBtn);
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
    resistLabel.textContent = "번 참았어요";

    resistTop.appendChild(resistNum);
    resistTop.appendChild(resistLabel);

    resistBox.appendChild(resistTop);
    resistBox.appendChild(
      buildResistCharacter(habit.resistCount, habit.id === justResistedId)
    );

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

  // 참음 횟수가 이 값에 도달할 때마다 새 옷으로 업그레이드
  var RESIST_TIERS = [1, 5, 10, 20, 35, 50];
  var RESIST_TIER_NAMES = [
    "맨몸으로 시작",
    "티셔츠를 입었다",
    "셔츠와 바지",
    "멋진 재킷",
    "정장과 중절모",
    "망토 두른 기사",
    "왕관 쓴 영웅"
  ];

  function outfitTier(count) {
    var t = 0;
    for (var i = 0; i < RESIST_TIERS.length; i++) {
      if (count >= RESIST_TIERS[i]) t = i + 1;
    }
    return t;
  }

  function nextTierAt(count) {
    for (var i = 0; i < RESIST_TIERS.length; i++) {
      if (count < RESIST_TIERS[i]) return RESIST_TIERS[i];
    }
    return null;
  }

  function buildResistCharacter(count, animateLast) {
    var wrap = document.createElement("div");
    wrap.className = "sd";

    var tier = outfitTier(count);
    var leveledUp = animateLast && count > 0 && tier !== outfitTier(count - 1);

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
    label.textContent = RESIST_TIER_NAMES[tier];
    wrap.appendChild(label);

    var next = nextTierAt(count);
    var hint = document.createElement("div");
    hint.className = "sd__hint";
    hint.textContent = next ? "다음 옷까지 " + (next - count) + "번" : "최고 등급 달성!";
    wrap.appendChild(hint);

    return wrap;
  }

  // 32x32 격자에 도트 캐릭터를 그린다. tier 가 올라갈수록 옷이 좋아진다.
  function drawCharacter(ctx, tier, S) {
    function p(x, y, w, h, c) {
      ctx.fillStyle = c;
      ctx.fillRect(x * S, y * S, w * S, h * S);
    }

    var SKIN = "#f6cfa6";
    var SKIN_D = "#e2b18c";
    var OL = "#2c2622"; // 외곽선

    // 망토 (맨 뒤)
    if (tier >= 5) {
      p(7, 15, 18, 14, "#5e1822");
      p(8, 16, 16, 12, "#a8323f");
      p(9, 17, 14, 10, "#c2434f");
      p(13, 15, 6, 2, "#f6c945"); // 어깨 잠금장식
    }

    // ---- 실루엣(외곽선) ----
    p(9, 3, 14, 13, OL); // 머리 (네 모서리 1px 둥글게)
    p(8, 5, 1, 9, OL); // 머리 왼쪽
    p(23, 5, 1, 9, OL); // 머리 오른쪽
    p(10, 15, 12, 10, OL); // 몸통
    p(8, 16, 3, 9, OL); // 왼팔
    p(21, 16, 3, 9, OL); // 오른팔
    p(12, 23, 4, 7, OL); // 왼다리
    p(16, 23, 4, 7, OL); // 오른다리

    // ---- 맨살 채우기 ----
    p(10, 4, 12, 11, SKIN); // 얼굴 (모서리 둥글게)
    p(9, 6, 1, 7, SKIN); // 왼뺨
    p(22, 6, 1, 7, SKIN); // 오른뺨
    p(13, 15, 6, 1, SKIN_D); // 목
    p(11, 16, 10, 8, SKIN); // 몸통
    p(9, 17, 2, 6, SKIN); // 왼팔
    p(22, 17, 2, 6, SKIN); // 오른팔
    p(13, 24, 2, 4, SKIN); // 왼다리
    p(18, 24, 2, 4, SKIN); // 오른다리
    p(8, 10, 1, 3, SKIN_D); // 왼귀
    p(23, 10, 1, 3, SKIN_D); // 오른귀

    // ---- 하의 ----
    if (tier >= 2) {
      var pants = tier >= 4 ? "#23252e" : "#3b4b66";
      p(12, 23, 3, 5, pants);
      p(17, 23, 3, 5, pants);
    }
    // 신발
    var shoe = tier >= 3 ? "#1c1f26" : "#6a5f52";
    p(12, 28, 4, 2, shoe);
    p(16, 28, 4, 2, shoe);

    // ---- 상의 ----
    if (tier === 0) {
      p(12, 21, 8, 3, "#e2e6ef"); // 속옷
    } else if (tier === 1) {
      p(11, 16, 10, 6, "#4f7cff"); // 티셔츠
      p(9, 16, 2, 3, "#4f7cff"); // 짧은 소매
      p(22, 16, 2, 3, "#4f7cff");
      p(11, 21, 10, 1, "#3b63d6"); // 밑단
    } else if (tier === 2) {
      p(11, 16, 10, 8, "#eef1f7"); // 셔츠
      p(9, 16, 2, 6, "#eef1f7");
      p(22, 16, 2, 6, "#e3e7f0");
      p(15, 16, 1, 8, "#c7cede"); // 단추선
    } else if (tier === 3) {
      p(11, 16, 10, 8, "#e7eaf2"); // 안쪽 셔츠
      p(15, 16, 1, 8, "#c7cede");
      p(11, 16, 3, 8, "#574ccb"); // 재킷 자락
      p(18, 16, 3, 8, "#574ccb");
      p(9, 16, 2, 7, "#574ccb"); // 긴소매
      p(22, 16, 2, 7, "#463cae");
      p(12, 16, 2, 2, "#463cae"); // 옷깃
      p(18, 16, 2, 2, "#463cae");
    } else {
      p(11, 16, 10, 8, "#23252e"); // 정장
      p(9, 16, 2, 7, "#23252e");
      p(22, 16, 2, 7, "#1a1c22");
      p(14, 16, 4, 8, "#eef1f7"); // 셔츠 앞판
      p(15, 17, 2, 6, tier >= 6 ? "#f6c945" : "#e5794b"); // 넥타이
      p(12, 16, 2, 3, "#15161c"); // 옷깃
      p(18, 16, 2, 3, "#15161c");
    }

    // ---- 머리카락 ----
    p(9, 3, 14, 3, "#6b4a2f"); // 앞머리 (윗변도 둥근 폭)
    p(9, 4, 1, 4, "#6b4a2f");
    p(22, 4, 1, 4, "#6b4a2f");
    p(8, 5, 1, 3, "#6b4a2f"); // 옆머리
    p(23, 5, 1, 3, "#6b4a2f");
    p(9, 5, 3, 2, "#6b4a2f"); // 구레나룻
    p(20, 5, 3, 2, "#6b4a2f");
    p(11, 3, 10, 1, "#7d5941"); // 윗머리 하이라이트

    // ---- 눈, 입 ----
    p(12, 9, 2, 3, "#2a2320");
    p(18, 9, 2, 3, "#2a2320");
    p(12, 9, 1, 1, "#ffffff");
    p(18, 9, 1, 1, "#ffffff");
    if (tier >= 4) {
      p(14, 13, 4, 1, "#a85f48"); // 미소
      p(15, 14, 2, 1, "#a85f48");
    } else {
      p(15, 13, 2, 1, "#a85f48");
    }

    // ---- 모자 / 왕관 ----
    if (tier === 4 || tier === 5) {
      p(7, 4, 18, 2, "#1b1d24"); // 챙
      p(9, 0, 14, 4, "#23252e"); // 윗부분
      p(9, 3, 14, 1, "#3a3d47"); // 밴드
    }
    if (tier >= 6) {
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
      checkedDates: [],
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

  function toggleToday(id) {
    var habit = findHabit(id);
    if (!habit) return;
    var today = todayKey();
    var idx = habit.checkedDates.indexOf(today);
    if (idx === -1) {
      habit.checkedDates.push(today);
    } else {
      habit.checkedDates.splice(idx, 1);
    }
    saveHabits(habits);
    render();
  }

  function resistHabit(id) {
    var habit = findHabit(id);
    if (!habit) return;
    habit.resistCount += 1;
    justResistedId = id;
    saveHabits(habits);
    render();
    justResistedId = null;
  }

  function violateHabit(id) {
    var habit = findHabit(id);
    if (!habit) return;
    habit.violationCount += 1;
    habit.streakStartDate = todayKey(); // D-day 즉시 초기화
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
