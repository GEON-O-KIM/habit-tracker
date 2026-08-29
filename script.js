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

  // 0시부터 지금까지 하루가 얼마나 지났는지 (%)
  function dayProgressPercent() {
    var n = new Date();
    var secs = n.getHours() * 3600 + n.getMinutes() * 60 + n.getSeconds();
    return Math.min(100, (secs / 86400) * 100).toFixed(1);
  }

  function clockText() {
    var n = new Date();
    return (
      String(n.getHours()).padStart(2, "0") +
      ":" +
      String(n.getMinutes()).padStart(2, "0")
    );
  }

  /* ---------- 하늘 (시각에 따라 무대 배경색) ---------- */

  function lerpChannel(a, b, t) {
    return Math.round(a + (b - a) * t);
  }
  function lerpHex(h1, h2, t) {
    var a = parseInt(h1.slice(1), 16);
    var b = parseInt(h2.slice(1), 16);
    return (
      "rgb(" +
      lerpChannel((a >> 16) & 255, (b >> 16) & 255, t) +
      "," +
      lerpChannel((a >> 8) & 255, (b >> 8) & 255, t) +
      "," +
      lerpChannel(a & 255, b & 255, t) +
      ")"
    );
  }

  // 하루 진행률(0~1) → 하늘 위 / 지평선 / 해 색
  var SKY_STOPS = [
    { t: 0.0, top: "#0e1230", hor: "#1a1e3e", sun: "#cdd7f5" },
    { t: 0.2, top: "#141a3a", hor: "#3a3766", sun: "#dfe4fb" },
    { t: 0.28, top: "#5f76b4", hor: "#f0b982", sun: "#fff3d6" },
    { t: 0.5, top: "#a8c1e6", hor: "#dde7f2", sun: "#fff7e2" },
    { t: 0.74, top: "#8f9fd0", hor: "#f2b877", sun: "#ffe9c2" },
    { t: 0.82, top: "#585596", hor: "#e88a5c", sun: "#ffdcb0" },
    { t: 0.9, top: "#2c2c5a", hor: "#5c4a7e", sun: "#c9c2e8" },
    { t: 1.0, top: "#0e1230", hor: "#1a1e3e", sun: "#cdd7f5" }
  ];

  function applySky() {
    var n = new Date();
    var frac =
      (n.getHours() * 3600 + n.getMinutes() * 60 + n.getSeconds()) / 86400;
    var lo = SKY_STOPS[0];
    var hi = SKY_STOPS[SKY_STOPS.length - 1];
    for (var i = 0; i < SKY_STOPS.length - 1; i++) {
      if (frac >= SKY_STOPS[i].t && frac <= SKY_STOPS[i + 1].t) {
        lo = SKY_STOPS[i];
        hi = SKY_STOPS[i + 1];
        break;
      }
    }
    var k = hi.t === lo.t ? 0 : (frac - lo.t) / (hi.t - lo.t);
    var s = document.documentElement.style;
    s.setProperty("--sky-top", lerpHex(lo.top, hi.top, k));
    s.setProperty("--sky-horizon", lerpHex(lo.hor, hi.hor, k));
    s.setProperty("--sun", lerpHex(lo.sun, hi.sun, k));
    s.setProperty("--day-frac", (frac * 100).toFixed(2) + "%");
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
    // 마을: townMax = 지금까지 도달한 최고 연속일, townShown = 지어진 걸 본 개수
    if (typeof h.townMax !== "number") {
      h.townMax = daysBetween(h.streakStartDate, todayKey()) + 1;
    }
    if (typeof h.townShown !== "number") h.townShown = -1; // -1 = 첫 렌더에서 조용히 맞춤
    if (!Array.isArray(h.slipMarks)) h.slipMarks = [];
  });

  var justBuiltTown = {}; // { habitId: 방금 지어진 구조물 이름 }

  /* ---------- 기억하는 마을 ---------- */

  var STRUCT_ORDER = [
    "signpost",
    "tent",
    "hut",
    "well",
    "house",
    "tree",
    "house2",
    "shop",
    "belltower"
  ];
  var STRUCT_KR = {
    signpost: "이정표",
    tent: "천막",
    hut: "오두막",
    well: "우물",
    house: "집",
    tree: "나무",
    house2: "두 번째 집",
    shop: "가게",
    belltower: "종탑"
  };

  // 9칸의 잠금 해제 일수 (목표 일수에 비례, 초반이 촘촘하게, 9번째 = 목표일)
  function townThresholds(goalDays) {
    var t = [];
    for (var k = 1; k <= 9; k++) {
      var v = Math.round(goalDays * Math.pow(k / 9, 1.6));
      v = Math.max(k, v);
      if (k > 1) v = Math.max(v, t[k - 2] + 1);
      t.push(v);
    }
    t[8] = Math.max(goalDays, t[7] + 1);
    return t;
  }

  function plotCount(habit) {
    var thr = townThresholds(habit.goalDays);
    var n = 0;
    for (var i = 0; i < thr.length; i++) {
      if (habit.townMax >= thr[i]) n++;
    }
    return n;
  }

  // 렌더 전에 townMax 갱신 + 새로 지어진 구조물 표시
  function syncTowns() {
    var today = todayKey();
    var changed = false;
    justBuiltTown = {};
    habits.forEach(function (h) {
      var dn = daysBetween(h.streakStartDate, today) + 1;
      if (dn > h.townMax) {
        h.townMax = dn;
        changed = true;
      }
      var plots = plotCount(h);
      if (h.townShown < 0) {
        h.townShown = plots; // 최초 1회: 조용히 맞춤
        changed = true;
      } else if (plots > h.townShown) {
        justBuiltTown[h.id] = STRUCT_ORDER[plots - 1];
        h.townShown = plots;
        changed = true;
      }
    });
    if (changed) saveHabits(habits);
  }

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
    syncTowns();
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
        "진행 중 " + habits.length + "개 · 최고 연속 " + (best + 1) + "일";
    }
  }

  function buildCard(habit, today) {
    var dayNum = daysBetween(habit.streakStartDate, today) + 1; // 시작일이 1일차
    if (dayNum < 1) dayNum = 1;
    var remaining = habit.goalDays - dayNum; // D-remaining
    var achieved = remaining <= 0;
    var percent = Math.min(100, Math.round((dayNum / habit.goalDays) * 100));

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
    elapsedTag.textContent = "D+" + dayNum;
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

    /* 오늘 하루 진행바 (0시 → 24시) */
    var dayProgress = document.createElement("div");
    dayProgress.className = "progress progress--day";
    var dayBar = document.createElement("div");
    dayBar.className = "progress__bar progress__bar--day";
    dayBar.style.width = dayProgressPercent() + "%";
    dayProgress.appendChild(dayBar);

    var dayMeta = document.createElement("div");
    dayMeta.className = "habit__meta habit__meta--day";
    var dayMetaLeft = document.createElement("span");
    dayMetaLeft.textContent = "오늘";
    var dayMetaRight = document.createElement("span");
    dayMetaRight.className = "day-time";
    dayMetaRight.textContent = clockText();
    dayMeta.appendChild(dayMetaLeft);
    dayMeta.appendChild(dayMetaRight);

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
      buildResistCharacter(habit, today, habit.id === justResistedId)
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
    card.appendChild(dayProgress);
    card.appendChild(dayMeta);
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

  function buildResistCharacter(habit, today, animateLast) {
    var count = habit.resistCount;
    var wrap = document.createElement("div");
    wrap.className = "sd";
    if (justBuiltTown[habit.id]) wrap.classList.add("sd--town-built");

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

    // 마을 칸 (스타듀밸리 느낌, 캐릭터는 작게 들어감)
    var vW = 182;
    var vH = 52;
    var vS = 5;
    var village = document.createElement("canvas");
    village.className = "sd__village";
    village.width = vW * vS;
    village.height = vH * vS;
    var vctx = village.getContext("2d");
    vctx.imageSmoothingEnabled = false;
    drawVillage(vctx, habit, today, tier, vW, vH, vS);
    wrap.appendChild(village);

    var hint = document.createElement("div");
    hint.className = "sd__hint";
    hint.textContent = townHint(habit, today);
    wrap.appendChild(hint);

    return wrap;
  }

  function townHint(habit, today) {
    if (justBuiltTown[habit.id]) {
      return "새 건물 — " + STRUCT_KR[justBuiltTown[habit.id]];
    }
    var plots = plotCount(habit);
    if (plots >= 9) return "🎏 마을 완공!";

    var dn = daysBetween(habit.streakStartDate, today) + 1;
    if (dn < habit.townMax) {
      // 어김 후 회복 중 — 예전 규모를 되찾아야 새 건물
      return "예전 마을까지 " + (habit.townMax - dn + 1) + "일";
    }
    var thr = townThresholds(habit.goalDays);
    return "마을 " + plots + "/9 · 다음 건물까지 " + (thr[plots] - habit.townMax) + "일";
  }

  // 마을 칸. 스타듀밸리풍 풀밭·길·밭, 구조물이 하나씩 들어서고 캐릭터는 작게 서 있다.
  var VILLAGE_POS = {
    belltower: [30, 31],
    hut: [52, 34],
    house: [80, 36],
    house2: [106, 37],
    shop: [136, 35],
    tent: [158, 41],
    well: [40, 45],
    tree: [172, 49],
    signpost: [118, 47]
  };
  var VILLAGE_FRONT_X = [124, 138, 150, 160, 170];
  var VILLAGE_CHAR = [88, 47];

  function drawVillage(vctx, habit, today, tier, W, H, S) {
    function p(x, y, w, h, c) {
      vctx.fillStyle = c;
      vctx.fillRect(Math.round(x * S), Math.round(y * S), Math.round(w * S), Math.round(h * S));
    }

    var OL = "#241f30";
    var WOOD = "#8a5a3c", WOOD_D = "#6b4229";
    var ROOF = "#8a4040", ROOF_D = "#682e2e";
    var STONE = "#63637a", STONE_D = "#4b4b60";
    var WIN = "#f4cd72", DOOR = "#3a281c";
    var TRUNK = "#5f4433", LEAF = "#4a8a63", LEAF_D = "#3a6e4e", LEAF_H = "#5fa078";
    var TENT = "#c9b487", TENT_D = "#a68f63";
    var RUBBLE = "#83859a", RUBBLE_D = "#5c5e6c";
    var FLOWER1 = "#ef7fa8", FLOWER2 = "#f4c94c", BRASS = "#caa24a";
    var GRASS = "#66ad4f", GRASS_D = "#57993f", GRASS_L = "#7cbc60", FOREST = "#3f6d3b";
    var PATH = "#caa576", PATH_E = "#a67f52";
    var FENCE = "#8a6a45", FENCE_D = "#6d5236", SOIL = "#6b4a33", SOIL_D = "#573c29", SPROUT = "#7ec850";

    var complete = plotCount(habit) >= 9;

    // 풀밭
    p(0, 0, W, H, GRASS);
    var seed = 1;
    for (var g = 0; g < 64; g++) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      var gx = seed % W;
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      var gy = 4 + (seed % (H - 6));
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      p(gx, gy, seed % 3 ? 1 : 2, 1, seed % 2 ? GRASS_D : GRASS_L);
    }
    // 위쪽 숲 가장자리 + 나무 몇 그루
    p(0, 0, W, 3, FOREST);
    for (var fx = 0; fx < W; fx += 5) p(fx, 3, 2, 1, FOREST);
    [18, 64, 120, 158].forEach(function (tx) {
      p(tx - 3, 0, 6, 3, LEAF_D);
      p(tx - 2, 0, 4, 2, LEAF);
    });
    // 길 (가로로 살짝 굽이치게)
    for (var px = 0; px < W; px += 2) {
      p(px, 39 + ((px / 10) % 2 ? 1 : 0), 2, 10, PATH);
    }
    p(0, 39, W, 1, PATH_E);
    // 왼쪽 아래 텃밭 + 울타리
    p(6, 44, 22, 7, SOIL);
    for (var sy = 45; sy < 51; sy += 2) p(6, sy, 22, 1, SOIL_D);
    for (var cx2 = 9; cx2 < 27; cx2 += 4) {
      for (var cy = 44; cy < 51; cy += 2) p(cx2, cy, 1, 1, SPROUT);
    }
    for (var ffx = 6; ffx < 30; ffx += 4) p(ffx, 43, 1, 3, FENCE_D);
    p(6, 42, 24, 1, FENCE);
    p(28, 42, 1, 9, FENCE_D);

    function structure(type, cx, by) {
      var x0;
      if (type === "signpost") {
        x0 = cx - 3;
        p(x0 + 2, by - 10, 2, 10, WOOD_D);
        p(x0, by - 10, 6, 3, WOOD);
        p(x0, by - 10, 6, 1, OL);
        p(x0, by - 10, 1, 3, OL);
        p(x0 + 5, by - 10, 1, 3, OL);
      } else if (type === "tent") {
        x0 = cx - 7;
        p(x0 + 1, by - 3, 12, 3, TENT_D);
        p(x0 + 2, by - 6, 10, 3, TENT);
        p(x0 + 4, by - 8, 6, 2, TENT);
        p(x0 + 6, by - 9, 2, 1, TENT);
        p(x0 + 6, by - 6, 2, 6, DOOR);
        p(x0, by - 1, 14, 1, OL);
      } else if (type === "hut") {
        x0 = cx - 6;
        p(x0 + 1, by - 6, 10, 6, WOOD);
        p(x0 + 5, by - 4, 2, 4, DOOR);
        p(x0 + 2, by - 5, 2, 2, WIN);
        p(x0, by - 7, 12, 2, ROOF_D);
        p(x0 + 2, by - 9, 8, 2, ROOF);
        p(x0 + 4, by - 10, 4, 1, ROOF);
      } else if (type === "well") {
        x0 = cx - 6;
        p(x0, by - 4, 8, 4, STONE);
        p(x0, by - 4, 8, 1, STONE_D);
        p(x0 + 1, by - 3, 6, 2, "#20242f");
        p(x0 + 1, by - 10, 1, 6, WOOD_D);
        p(x0 + 6, by - 10, 1, 6, WOOD_D);
        p(x0, by - 12, 8, 2, ROOF_D);
        p(x0 + 10, by - 11, 1, 11, "#3a3a48");
        p(x0 + 9, by - 12, 3, 3, WIN);
      } else if (type === "house") {
        x0 = cx - 7;
        p(x0 + 1, by - 8, 12, 8, WOOD);
        p(x0 + 6, by - 5, 3, 5, DOOR);
        p(x0 + 2, by - 6, 2, 2, WIN);
        p(x0 + 10, by - 6, 2, 2, WIN);
        p(x0, by - 9, 14, 2, ROOF_D);
        p(x0 + 2, by - 12, 10, 3, ROOF);
        p(x0 + 5, by - 14, 4, 2, ROOF);
        p(x0 + 10, by - 15, 2, 3, STONE_D);
      } else if (type === "tree") {
        x0 = cx - 7;
        p(x0 + 6, by - 7, 3, 7, TRUNK);
        p(x0, by - 14, 14, 8, LEAF_D);
        p(x0 + 2, by - 17, 10, 6, LEAF);
        p(x0 + 5, by - 19, 5, 2, LEAF);
        p(x0 + 3, by - 14, 3, 3, LEAF_H);
      } else if (type === "house2") {
        x0 = cx - 9;
        p(x0 + 3, by - 9, 12, 9, WOOD_D);
        p(x0 + 8, by - 5, 3, 5, DOOR);
        p(x0 + 4, by - 7, 2, 2, WIN);
        p(x0 + 12, by - 7, 2, 2, WIN);
        p(x0 + 2, by - 11, 14, 2, ROOF_D);
        p(x0 + 4, by - 14, 10, 3, ROOF);
      } else if (type === "shop") {
        x0 = cx - 8;
        p(x0 + 1, by - 9, 14, 9, WOOD);
        p(x0 + 6, by - 4, 4, 4, DOOR);
        p(x0 + 2, by - 4, 3, 3, WIN);
        p(x0 + 11, by - 4, 3, 3, WIN);
        p(x0 + 1, by - 7, 14, 1, "#c9564c");
        p(x0, by - 10, 16, 2, ROOF_D);
        p(x0 + 2, by - 12, 12, 2, ROOF);
        p(x0 + 6, by - 14, 4, 2, WOOD_D);
      } else if (type === "belltower") {
        x0 = cx - 5;
        p(x0 + 1, by - 18, 8, 18, STONE);
        p(x0 + 1, by - 18, 8, 1, STONE_D);
        p(x0 + 2, by - 15, 4, 4, "#20242f");
        p(x0 + 3, by - 14, 2, 2, BRASS);
        p(x0 + 3, by - 8, 2, 3, WIN);
        p(x0, by - 20, 10, 2, ROOF_D);
        p(x0 + 1, by - 23, 8, 3, ROOF);
        p(x0 + 4, by - 25, 2, 2, ROOF_D);
        if (complete) {
          p(x0 + 5, by - 28, 1, 3, "#3a3a48");
          p(x0 + 5, by - 28, 4, 2, "#e5794b");
        }
      }
    }

    // 캐릭터 스프라이트를 임시 캔버스에 그려서 축소해 넣는다
    var off = document.createElement("canvas");
    off.width = 128;
    off.height = 128;
    var octx = off.getContext("2d");
    octx.imageSmoothingEnabled = false;
    drawCharacter(octx, tier, 4);

    // 구조물 + 캐릭터를 baseline 순으로 (뒤→앞)
    var plots = plotCount(habit);
    var items = [];
    for (var k = 0; k < plots; k++) {
      items.push({ t: STRUCT_ORDER[k], x: VILLAGE_POS[STRUCT_ORDER[k]][0], y: VILLAGE_POS[STRUCT_ORDER[k]][1] });
    }
    items.push({ t: "__char__", x: VILLAGE_CHAR[0], y: VILLAGE_CHAR[1] });
    items.sort(function (a, b) { return a.y - b.y; });
    items.forEach(function (it) {
      if (it.t === "__char__") {
        var cu = 9;
        vctx.drawImage(
          off,
          Math.round(it.x * S - (cu * S) / 2),
          Math.round(it.y * S - cu * S),
          cu * S,
          cu * S
        );
      } else {
        structure(it.t, it.x, it.y);
      }
    });

    // 어긴 자리: 돌무더기 → 7일 뒤 이끼·꽃
    var marks = habit.slipMarks.slice(-5);
    for (var m = 0; m < marks.length; m++) {
      var mx = VILLAGE_FRONT_X[m];
      var my = 50;
      var healed = daysBetween(marks[m].at, today) >= 7;
      if (healed) {
        p(mx - 4, my - 2, 8, 2, "#4f8a63");
        p(mx - 3, my - 3, 6, 2, LEAF_H);
        p(mx - 3, my - 4, 1, 1, FLOWER1);
        p(mx + 2, my - 4, 1, 1, FLOWER2);
        p(mx, my - 3, 1, 1, FLOWER1);
      } else {
        p(mx - 3, my - 2, 7, 2, RUBBLE_D);
        p(mx - 2, my - 4, 2, 2, RUBBLE);
        p(mx + 1, my - 3, 2, 2, RUBBLE);
      }
    }
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
      townMax: 1,
      townShown: 0,
      slipMarks: [],
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
    // 마을엔 돌무더기가 남는다 (7일 뒤 이끼·꽃으로). townMax 는 그대로 두어 건물은 유지.
    habit.slipMarks.push({ at: todayKey() });
    if (habit.slipMarks.length > 8) habit.slipMarks.shift();
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

  var currentDate = todayKey();

  document.getElementById("todayDate").textContent = formatToday();
  applySky();
  render();

  // 하늘·하루 진행바·시계를 주기적으로 갱신. 자정을 넘기면 전체 다시 그림.
  setInterval(function () {
    applySky();
    if (todayKey() !== currentDate) {
      currentDate = todayKey();
      document.getElementById("todayDate").textContent = formatToday();
      render();
      return;
    }
    var w = dayProgressPercent() + "%";
    var bars = document.querySelectorAll(".progress__bar--day");
    for (var i = 0; i < bars.length; i++) bars[i].style.width = w;
    var t = clockText();
    var times = document.querySelectorAll(".day-time");
    for (var j = 0; j < times.length; j++) times[j].textContent = t;
  }, 20000);
})();
