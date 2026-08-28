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
