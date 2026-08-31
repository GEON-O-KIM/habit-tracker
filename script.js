(function () {
  "use strict";

  var STORAGE_KEY = "habit-tracker/habits";

  /* ============================================================
     날짜 유틸 (시간 무시, 자정 기준)
     ============================================================ */

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

  /* ============================================================
     저장소
     ============================================================ */

  function loadHabits() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }

  function saveHabits(list) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    } catch (e) {
      /* 저장 실패는 조용히 무시 */
    }
  }

  /* ============================================================
     상태
     ============================================================ */

  var habits = loadHabits();
  var justResistedId = null; // 방금 "참음"을 누른 습관 (반응 애니메이션용)
  var justLeveledUp = false;
  var openIds = {}; // 펼쳐 놓은 카드 (세션 한정, 저장 안 함)

  // 예전 데이터 호환
  habits.forEach(function (h) {
    if (typeof h.resistCount !== "number") h.resistCount = 0;
    if (typeof h.violationCount !== "number") h.violationCount = 0;
    if (!h.resistDate) h.resistDate = todayKey();
    delete h.resistHistory; // 더 이상 쓰지 않음
  });

  // 참음 카운트는 하루 단위. 자정을 넘겼으면 0으로 리셋.
  function rolloverResist() {
    var today = todayKey();
    var changed = false;
    habits.forEach(function (h) {
      if (h.resistDate !== today) {
        h.resistCount = 0;
        h.resistDate = today;
        changed = true;
      }
    });
    if (changed) saveHabits(habits);
  }

  var listEl = document.getElementById("habitList");
  var emptyEl = document.getElementById("emptyState");
  var summaryEl = document.getElementById("summary");
  var formEl = document.getElementById("habitForm");
  var nameEl = document.getElementById("habitName");
  var goalEl = document.getElementById("habitGoal");

  /* ============================================================
     참음 SD 캐릭터 (참음 횟수 → 옷)
     ============================================================ */

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

  // 32x32 격자에 도트 캐릭터를 그린다.
  function drawCharacter(ctx, tier, S) {
    function p(x, y, w, h, c) {
      ctx.fillStyle = c;
      ctx.fillRect(x * S, y * S, w * S, h * S);
    }

    var o = OUTFITS[Math.min(tier, MAX_TIER)];
    var SKIN = "#f6cfa6";
    var SKIN_D = "#e2b18c";
    var OL = "#2c2622";

    if (o.cape) {
      p(7, 15, 18, 14, "#5e1822");
      p(8, 16, 16, 12, "#a8323f");
      p(9, 17, 14, 10, "#c2434f");
      p(13, 15, 6, 2, "#f6c945");
    }

    p(9, 3, 14, 13, OL);
    p(8, 5, 1, 9, OL);
    p(23, 5, 1, 9, OL);
    p(10, 15, 12, 10, OL);
    p(8, 16, 3, 9, OL);
    p(21, 16, 3, 9, OL);
    p(12, 23, 4, 7, OL);
    p(16, 23, 4, 7, OL);

    p(10, 4, 12, 11, SKIN);
    p(9, 6, 1, 7, SKIN);
    p(22, 6, 1, 7, SKIN);
    p(13, 15, 6, 1, SKIN_D);
    p(11, 16, 10, 8, SKIN);
    p(9, 17, 2, 6, SKIN);
    p(22, 17, 2, 6, SKIN);
    p(13, 24, 2, 4, SKIN);
    p(18, 24, 2, 4, SKIN);
    p(8, 10, 1, 3, SKIN_D);
    p(23, 10, 1, 3, SKIN_D);

    if (o.shorts) {
      p(12, 22, 3, 3, o.shorts);
      p(17, 22, 3, 3, o.shorts);
    } else if (o.pants) {
      p(12, 23, 3, 5, o.pants);
      p(17, 23, 3, 5, o.pants);
    }
    var dressShoe = o.pants || o.style === "jacket" || o.style === "suit";
    var shoe = dressShoe ? "#1c1f26" : "#6a5f52";
    p(12, 28, 4, 2, shoe);
    p(16, 28, 4, 2, shoe);

    if (o.style === "none") {
      p(12, 21, 8, 3, "#e2e6ef");
    } else if (o.style === "tee") {
      p(11, 16, 10, 6, o.c);
      p(9, 16, 2, 3, o.c);
      p(22, 16, 2, 3, o.c);
      p(11, 21, 10, 1, o.c2);
    } else if (o.style === "shirt") {
      p(11, 16, 10, 8, "#eef1f7");
      p(9, 16, 2, 6, "#eef1f7");
      p(22, 16, 2, 6, "#e3e7f0");
      p(15, 16, 1, 8, "#c7cede");
    } else if (o.style === "sweater") {
      p(11, 15, 10, 9, o.c);
      p(9, 16, 2, 7, o.c);
      p(22, 16, 2, 7, o.c2);
      p(13, 15, 4, 1, o.c2);
      p(11, 19, 10, 1, o.c2);
    } else if (o.style === "jacket") {
      p(12, 16, 8, 8, "#e7eaf2");
      p(15, 16, 1, 8, "#c7cede");
      p(11, 16, 3, 8, o.c);
      p(18, 16, 3, 8, o.c);
      p(9, 16, 2, 7, o.c);
      p(22, 16, 2, 7, o.c2);
      p(12, 16, 2, 3, o.c2);
      p(18, 16, 2, 3, o.c2);
    } else if (o.style === "suit") {
      p(11, 16, 10, 8, "#23252e");
      p(9, 16, 2, 7, "#23252e");
      p(22, 16, 2, 7, "#1a1c22");
      p(14, 16, 4, 8, "#eef1f7");
      p(12, 16, 2, 3, "#15161c");
      p(18, 16, 2, 3, "#15161c");
    }
    if (o.tie) p(15, 17, 2, 5, o.tie);

    p(9, 3, 14, 3, "#6b4a2f");
    p(9, 4, 1, 4, "#6b4a2f");
    p(22, 4, 1, 4, "#6b4a2f");
    p(8, 5, 1, 3, "#6b4a2f");
    p(23, 5, 1, 3, "#6b4a2f");
    p(9, 5, 3, 2, "#6b4a2f");
    p(20, 5, 3, 2, "#6b4a2f");
    p(11, 3, 10, 1, "#7d5941");

    p(12, 9, 2, 3, "#2a2320");
    p(18, 9, 2, 3, "#2a2320");
    p(12, 9, 1, 1, "#ffffff");
    p(18, 9, 1, 1, "#ffffff");
    if (tier >= 7) {
      p(14, 13, 4, 1, "#a85f48");
      p(15, 14, 2, 1, "#a85f48");
    } else {
      p(15, 13, 2, 1, "#a85f48");
    }

    if (o.hat) {
      p(7, 4, 18, 2, "#1b1d24");
      p(9, 0, 14, 4, "#23252e");
      p(9, 3, 14, 1, "#3a3d47");
    }
    if (o.crown) {
      p(9, 1, 14, 3, "#f6c945");
      p(9, 0, 2, 2, "#f6c945");
      p(15, 0, 2, 2, "#f6c945");
      p(21, 0, 2, 2, "#f6c945");
      p(15, 1, 2, 2, "#4f7cff");
      p(11, 0, 1, 1, "#fff1b8");
    }
  }

  function charCanvas(tier, S) {
    var c = document.createElement("canvas");
    c.width = 32 * S;
    c.height = 32 * S;
    var ctx = c.getContext("2d");
    ctx.imageSmoothingEnabled = false;
    drawCharacter(ctx, Math.min(tier, MAX_TIER), S);
    return c;
  }

  /* ============================================================
     연속 일수 → 쌓이는 트럼프 카드 피라미드
     하루에 자그만 삼각형(카드 두 장) 하나씩, 바닥 줄부터 채운다.
     ============================================================ */

  function frac(v) {
    v = Math.sin(v) * 43758.5453;
    return v - Math.floor(v);
  }

  var TW = { W: 240, H: 250 };
  var C_FACE2 = "#efe8d6";
  var SUIT_RED = "#c0473c";
  var SUIT_BLK = "#33333c";
  var SUITS = ["♠", "♥", "♦", "♣"];

  function roundRectPath(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // 카드 한 장: 중심 (cx,cy), 길이 len, 폭 w, 각도 ang(라디안)
  function paintCard(ctx, cx, cy, len, w, ang, suitIdx) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(ang);
    roundRectPath(ctx, -len / 2, -w / 2, len, w, Math.min(2.5, w / 3));
    var grad = ctx.createLinearGradient(0, -w / 2, 0, w / 2);
    grad.addColorStop(0, "#fffdf6");
    grad.addColorStop(1, C_FACE2);
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = "#9c8d6b";
    ctx.stroke();
    var red = suitIdx === 1 || suitIdx === 2;
    ctx.fillStyle = red ? SUIT_RED : SUIT_BLK;
    ctx.font = "bold " + Math.max(5, w * 0.62) + "px 'IBM Plex Mono', monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(SUITS[suitIdx], -len / 2 + w * 0.7, 0);
    ctx.fillText(SUITS[suitIdx], len / 2 - w * 0.7, 0);
    ctx.restore();
  }

  // 목표 일수 → 완성 피라미드의 층수 (바닥 R개 → R-1 → ... → 1, 합계 >= goal)
  function pyramidRows(goal) {
    var R = Math.ceil((-1 + Math.sqrt(1 + 8 * Math.max(1, goal))) / 2);
    return Math.max(2, R);
  }

  // 한 줄 안에서 삼각형을 채우는 순서: 가운데부터 좌우로
  function centerOutOrder(rc) {
    var mid = (rc - 1) / 2;
    var arr = [];
    for (var j = 0; j < rc; j++) arr.push(j);
    arr.sort(function (a, b) {
      return Math.abs(a - mid) - Math.abs(b - mid) || a - b;
    });
    return arr;
  }

  function buildTower(dayCount, goal) {
    var W = TW.W;
    var H = TW.H;
    var cx = W / 2;
    var m = 14;
    var R = pyramidRows(goal);
    var cap = (R * (R + 1)) / 2;
    var n = Math.max(0, Math.min(Math.round(dayCount), cap));

    var rowH = Math.min(28, (H - 2 * m) / R);
    var pitch = Math.min((W - 2 * m) / R, rowH * 1.6);
    var foot = pitch * 0.82;
    var th = rowH * 1.02;
    var cardW = Math.max(3, pitch * 0.15);
    var cardLen = Math.sqrt(th * th + (foot / 2) * (foot / 2));
    var totalH = R * rowH;
    var baseY = H - m - Math.max(0, (H - 2 * m - totalH) / 2);

    var cards = [];
    var suit = 0;
    var remaining = n;
    var topApexY = baseY - totalH;

    for (var i = 0; i < R; i++) {
      var rc = R - i;
      var rowY = baseY - i * rowH;
      var apexY = rowY - th;
      var left = cx - ((rc - 1) / 2) * pitch;
      var rowFill = Math.min(remaining, rc);
      remaining -= rowFill;
      var order = centerOutOrder(rc);
      var filledSet = {};
      for (var f = 0; f < rowFill; f++) filledSet[order[f]] = true;
      var present = [];
      for (var j = 0; j < rc; j++) {
        if (filledSet[j]) {
          var tx = left + j * pitch;
          cards.push({
            cx: tx - foot / 4, cy: (apexY + rowY) / 2, len: cardLen, w: cardW,
            ang: Math.atan2(th, -foot / 2), suit: suit++ % 4
          });
          cards.push({
            cx: tx + foot / 4, cy: (apexY + rowY) / 2, len: cardLen, w: cardW,
            ang: Math.atan2(th, foot / 2), suit: suit++ % 4
          });
          present.push(tx);
          if (rc === 1) topApexY = apexY;
        } else {
          present.push(null);
        }
      }
      for (var k = 0; k < rc - 1; k++) {
        if (present[k] != null && present[k + 1] != null) {
          cards.push({
            cx: (present[k] + present[k + 1]) / 2, cy: apexY - cardW * 0.6,
            len: pitch + foot * 0.15, w: cardW, ang: 0, suit: suit++ % 4
          });
        }
      }
    }
    return { cards: cards, cx: cx, baseY: baseY, topY: topApexY, rows: R, cap: cap, filled: n };
  }

  function groundShadow(ctx, T, spread) {
    ctx.save();
    ctx.fillStyle = "rgba(0,0,0,0.10)";
    ctx.beginPath();
    ctx.ellipse(T.cx, T.baseY + 5, spread || 52, 7, 0, 0, 7);
    ctx.fill();
    ctx.restore();
  }

  function drawFlag(ctx, x, y) {
    ctx.save();
    ctx.strokeStyle = "#6f6047";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x, y - 22);
    ctx.stroke();
    ctx.fillStyle = "#b47a2c";
    ctx.beginPath();
    ctx.moveTo(x, y - 22);
    ctx.lineTo(x + 15, y - 17);
    ctx.lineTo(x, y - 12);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function towerCanvas(dayCount, goal, done) {
    var c = document.createElement("canvas");
    c.width = TW.W;
    c.height = TW.H;
    var ctx = c.getContext("2d");
    var T = buildTower(dayCount, goal);
    groundShadow(ctx, T);
    T.cards.forEach(function (cd) {
      paintCard(ctx, cd.cx, cd.cy, cd.len, cd.w, cd.ang, cd.suit);
    });
    if (done) drawFlag(ctx, T.cx, T.topY);
    c._tower = T;
    return c;
  }

  // 무너지는 연출 — 카드가 튕겨 흩어졌다가 바닥에 쌓임
  function collapseTower(canvas, dayCount, goal) {
    var ctx = canvas.getContext("2d");
    var T = canvas._tower || buildTower(dayCount, goal);
    var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    var floor = T.baseY + 3;
    var bodies = T.cards.map(function (cd) {
      return {
        x: cd.cx, y: cd.cy, ang: cd.ang, len: cd.len, w: cd.w, suit: cd.suit,
        vx: (Math.random() - 0.5) * 4 + (cd.cx - T.cx) * 0.06,
        vy: -Math.random() * 3 - (T.baseY - cd.cy) * 0.02,
        va: (Math.random() - 0.5) * 0.5,
        rest: false
      };
    });

    function dust(px, py) {
      ctx.save();
      ctx.translate(px, py);
      ctx.fillStyle = "rgba(210,190,150,0.5)";
      ctx.beginPath();
      ctx.arc(0, 0, 3, 0, 7);
      ctx.fill();
      ctx.restore();
    }

    if (reduce) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      groundShadow(ctx, T, 64);
      bodies.forEach(function (b, i) {
        var rx = T.cx + (frac(i * 1.7) - 0.5) * 120;
        var ry = floor - frac(i * 2.3) * 10;
        paintCard(ctx, rx, ry, b.len, b.w, (frac(i * 3.1) - 0.5) * 3, b.suit);
      });
      return;
    }

    var g = 0.62;
    var t = 0;
    function step() {
      t++;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      groundShadow(ctx, T, 52 + Math.min(14, t * 0.4));
      var settled = 0;
      bodies.forEach(function (b) {
        if (!b.rest) {
          b.vy += g;
          b.x += b.vx;
          b.y += b.vy;
          b.ang += b.va;
          if (b.y >= floor) {
            b.y = floor;
            b.vy *= -0.26;
            b.vx *= 0.62;
            b.va *= 0.35;
            if (Math.abs(b.vy) < 1.4) {
              b.vy = 0;
              b.va = 0;
              b.rest = true;
            }
          }
        } else {
          settled++;
        }
        paintCard(ctx, b.x, b.y, b.len, b.w, b.ang, b.suit);
      });
      if (t < 12) {
        for (var d = 0; d < 5; d++) {
          dust(T.cx + (Math.random() - 0.5) * 70, T.baseY - Math.random() * 40);
        }
      }
      if (settled < bodies.length && t < 150) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  /* ============================================================
     렌더
     ============================================================ */

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
        "진행 중 " + habits.length + "개 · 최고 연속 " + (best + 1) + "일";
    }
  }

  function buildCard(habit, today) {
    var dayNum = daysBetween(habit.streakStartDate, today) + 1; // 시작일이 1일차
    if (dayNum < 1) dayNum = 1;
    var remaining = habit.goalDays - dayNum;
    var achieved = remaining <= 0;
    var percent = Math.min(100, Math.round((dayNum / habit.goalDays) * 100));
    var tier = Math.min(habit.resistCount, MAX_TIER);

    var card = document.createElement("div");
    card.className = "habit";
    if (openIds[habit.id]) card.classList.add("is-open");

    /* ---- 상단 (누르면 서랍 토글) ---- */
    var top = document.createElement("button");
    top.type = "button";
    top.className = "habit__top";
    top.innerHTML =
      '<div class="habit__name"></div>' +
      '<span class="habit__chip' + (achieved ? " habit__chip--done" : "") + '"></span>' +
      '<div class="bar' + (achieved ? " bar--done" : "") + '"><i></i></div>' +
      '<div class="habit__meta"><span></span><span></span></div>';
    top.querySelector(".habit__name").textContent = habit.name;
    top.querySelector(".habit__chip").textContent = achieved ? "목표 달성" : "D+" + dayNum;
    top.querySelector(".bar > i").style.width = percent + "%";
    var metaSpans = top.querySelectorAll(".habit__meta span");
    metaSpans[0].textContent = "목표 " + habit.goalDays + "일";
    metaSpans[1].innerHTML = percent + '% <span class="chev">▾</span>';

    var ava = charCanvas(tier, 3);
    ava.className = "habit__ava";
    top.insertBefore(ava, top.firstChild);

    top.addEventListener("click", function () {
      if (openIds[habit.id]) delete openIds[habit.id];
      else openIds[habit.id] = true;
      card.classList.toggle("is-open");
    });

    /* ---- 인라인 편집 ---- */
    var editPanel = document.createElement("div");
    editPanel.className = "habit__edit";
    editPanel.innerHTML =
      '<div class="habit__edit-row">' +
        '<div class="habit__edit-field"><label>이름</label>' +
          '<input class="e-name" type="text" maxlength="30" /></div>' +
        '<div class="habit__edit-field"><label>목표(일)</label>' +
          '<input class="e-goal" type="number" min="1" max="3650" /></div>' +
      "</div>" +
      '<div class="habit__edit-actions">' +
        '<button type="button" class="e-save">저장</button>' +
        '<button type="button" class="e-cancel">취소</button>' +
      "</div>";
    var nameInput = editPanel.querySelector(".e-name");
    var goalInput = editPanel.querySelector(".e-goal");
    nameInput.value = habit.name;
    goalInput.value = habit.goalDays;
    editPanel.querySelector(".e-cancel").addEventListener("click", function () {
      card.classList.remove("is-editing");
    });
    editPanel.querySelector(".e-save").addEventListener("click", function () {
      var nm = nameInput.value.trim();
      var gl = parseInt(goalInput.value, 10);
      if (!nm || isNaN(gl) || gl < 1) return;
      habit.name = nm;
      habit.goalDays = gl;
      saveHabits(habits);
      render();
    });

    /* ---- 액션 줄 ---- */
    var act = document.createElement("div");
    act.className = "habit__act";

    var resistBtn = document.createElement("button");
    resistBtn.type = "button";
    resistBtn.className = "btn btn--resist";
    resistBtn.textContent = "참음";
    resistBtn.addEventListener("click", function () {
      resistHabit(habit.id);
    });

    var violateBtn = document.createElement("button");
    violateBtn.type = "button";
    violateBtn.className = "btn btn--slip";
    violateBtn.textContent = "어김";

    var countSpan = document.createElement("span");
    countSpan.className = "habit__count";
    countSpan.textContent =
      "오늘 " + habit.resistCount + " · 어김 " + habit.violationCount;

    act.appendChild(resistBtn);
    act.appendChild(violateBtn);
    act.appendChild(countSpan);

    /* ---- 보상 서랍 ---- */
    var reward = document.createElement("div");
    reward.className = "habit__reward";

    // 왼쪽: 오늘의 캐릭터
    var colChar = document.createElement("div");
    colChar.className = "reward__col";
    var charCap = document.createElement("div");
    charCap.className = "reward__cap";
    charCap.textContent = habit.resistCount + "회 참음";
    colChar.appendChild(charCap);
    var stage = document.createElement("div");
    stage.className = "box box--stage";
    var charCv = charCanvas(tier, 8);
    if (habit.id === justResistedId) {
      charCv.classList.add(justLeveledUp ? "is-levelup" : "is-bump");
      charCap.classList.add("is-bump");
    }
    stage.appendChild(charCv);
    colChar.appendChild(stage);
    var charLabel = document.createElement("div");
    charLabel.className = "reward__label";
    charLabel.textContent = OUTFITS[tier].name;
    colChar.appendChild(charLabel);
    var charHint = document.createElement("div");
    charHint.className = "reward__hint";
    charHint.textContent = tier < MAX_TIER ? "참을수록 옷이 바뀝니다" : "마지막 옷";
    colChar.appendChild(charHint);
    reward.appendChild(colChar);

    // 오른쪽: 연속 카드 피라미드
    var colTower = document.createElement("div");
    colTower.className = "reward__col";
    var towerCap = document.createElement("div");
    towerCap.className = "reward__cap";
    towerCap.textContent = "연속 D+" + dayNum;
    colTower.appendChild(towerCap);
    var towerBox = document.createElement("div");
    towerBox.className = "box box--tower";
    var towerCv = towerCanvas(dayNum, habit.goalDays, achieved);
    towerBox.appendChild(towerCv);
    colTower.appendChild(towerBox);
    var towerLabel = document.createElement("div");
    towerLabel.className = "reward__label";
    towerLabel.textContent = achieved
      ? "탑 완성"
      : dayNum + " / " + habit.goalDays + "일";
    colTower.appendChild(towerLabel);
    var towerHint = document.createElement("div");
    towerHint.className = "reward__hint";
    towerHint.textContent = "어기면 전부 무너집니다";
    colTower.appendChild(towerHint);
    reward.appendChild(colTower);

    // 수정 / 삭제
    var edrawer = document.createElement("div");
    edrawer.className = "reward__edit";
    var editLink = document.createElement("button");
    editLink.type = "button";
    editLink.textContent = "이름·목표 수정";
    editLink.addEventListener("click", function () {
      card.classList.add("is-editing");
      nameInput.focus();
    });
    var delLink = document.createElement("button");
    delLink.type = "button";
    delLink.className = "reward__edit-del";
    delLink.textContent = "삭제";
    delLink.addEventListener("click", function () {
      if (confirm('"' + habit.name + '" 습관을 삭제할까요?')) {
        deleteHabit(habit.id);
      }
    });
    edrawer.appendChild(editLink);
    edrawer.appendChild(delLink);
    reward.appendChild(edrawer);

    /* ---- 어김 → 무너지는 연출 후 실제 반영 ---- */
    violateBtn.addEventListener("click", function () {
      if (
        !confirm(
          '"' +
            habit.name +
            '" 습관을 어겼나요?\nD-day와 참음 캐릭터가 초기화되고, 어긴 횟수가 1 늘어납니다.'
        )
      ) {
        return;
      }
      openIds[habit.id] = true;
      card.classList.add("is-open", "is-broken");
      stage.classList.add("is-stumble");
      collapseTower(towerCv, dayNum, habit.goalDays);
      var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      setTimeout(function () {
        violateHabit(habit.id);
      }, reduce ? 120 : 900);
    });

    card.appendChild(top);
    card.appendChild(editPanel);
    card.appendChild(act);
    card.appendChild(reward);
    return card;
  }

  /* ============================================================
     액션
     ============================================================ */

  function findHabit(id) {
    for (var i = 0; i < habits.length; i++) {
      if (habits[i].id === id) return habits[i];
    }
    return null;
  }

  function addHabit(name, goalDays) {
    var id = String(Date.now()) + Math.random().toString(16).slice(2);
    habits.push({
      id: id,
      name: name,
      goalDays: goalDays,
      streakStartDate: todayKey(),
      violationCount: 0,
      resistCount: 0,
      resistDate: todayKey(),
      createdAt: todayKey()
    });
    openIds[id] = true;
    saveHabits(habits);
    render();
  }

  function deleteHabit(id) {
    habits = habits.filter(function (h) {
      return h.id !== id;
    });
    delete openIds[id];
    saveHabits(habits);
    render();
  }

  function resistHabit(id) {
    rolloverResist();
    var habit = findHabit(id);
    if (!habit) return;
    var prevTier = Math.min(habit.resistCount, MAX_TIER);
    habit.resistCount += 1;
    var newTier = Math.min(habit.resistCount, MAX_TIER);
    justResistedId = id;
    justLeveledUp = newTier !== prevTier;
    saveHabits(habits);
    render();
    justResistedId = null;
    justLeveledUp = false;
  }

  function violateHabit(id) {
    rolloverResist();
    var habit = findHabit(id);
    if (!habit) return;
    habit.violationCount += 1;
    habit.streakStartDate = todayKey();
    habit.resistCount = 0;
    saveHabits(habits);
    render();
  }

  /* ============================================================
     이벤트
     ============================================================ */

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
      openIds = {};
      saveHabits(habits);
      render();
    }
  });

  /* ============================================================
     초기화 — 자정을 넘기면 다시 그림
     ============================================================ */

  var currentDate = todayKey();
  document.getElementById("todayDate").textContent = formatToday();
  render();

  setInterval(function () {
    if (todayKey() !== currentDate) {
      currentDate = todayKey();
      document.getElementById("todayDate").textContent = formatToday();
      render();
    }
  }, 30000);
})();
