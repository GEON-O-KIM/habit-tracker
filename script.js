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
  var justResistedId = null; // 방금 "참음"을 누른 습관 (방패 연출용)
  var openIds = {}; // 펼쳐 놓은 카드 (세션 한정, 저장 안 함)
  var dragState = null; // 카드 순서 바꾸기 진행 상태
  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

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
     도트 캐릭터 (연속일 → 옷, 20일까지 매일 한 벌씩)
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
    { name: "왕관 쓴 영웅", style: "suit", pants: "#23252e", tie: "#f6c945", cape: true, crown: true },
    { name: "은빛 흉갑", style: "armor", plate: "#c2c8d4", plateD: "#9198a6", pants: "#2a2d36" },
    { name: "황금 흉갑", style: "armor", plate: "#e7c65e", plateD: "#c29a37", pants: "#2a2d36" },
    { name: "기사단 망토", style: "armor", plate: "#e7c65e", plateD: "#c29a37", pants: "#2a2d36", cape: true },
    { name: "투구 쓴 기사", style: "armor", plate: "#cdd2dc", plateD: "#969caa", pants: "#2a2d36", cape: true, helm: true },
    { name: "견습 마법사", style: "robe", robe: "#3c4a86", robeD: "#2d3a6c", staff: true, gem: "#8fd0ff" },
    { name: "지팡이 든 현자", style: "robe", robe: "#5a3f86", robeD: "#46306a", staff: true, wizhat: true, hatC: "#46306a", gem: "#c9a0ff" },
    { name: "별을 두른 마도사", style: "robe", robe: "#242a63", robeD: "#1b2050", staff: true, wizhat: true, hatC: "#1b2050", stars: true, gem: "#ffd98a" },
    { name: "날개 돋은 사도", style: "robe", robe: "#eef1f7", robeD: "#d6dbe6", trim: "#c3cad8", wings: true },
    { name: "빛을 두른 자", style: "robe", robe: "#f4efe0", robeD: "#ddd3ba", trim: "#d8c48a", wings: true, glow: "#ffe6a2" },
    { name: "전설이 된 자", style: "armor", plate: "#efd27a", plateD: "#c9a13e", pants: "#23252e", cape: true, crown: true, wings: true, wingColor: "#fff4d6", glow: "#fff0c0" }
  ];
  var MAX_TIER = OUTFITS.length - 1;
  var OUTFIT_DAYS = 20; // 연속 20일까지 매일 옷 한 단계

  function tierForDay(dayNum) {
    return Math.max(0, Math.min(dayNum, MAX_TIER));
  }

  function hexA(hex, a) {
    var n = parseInt(hex.slice(1), 16);
    return "rgba(" + ((n >> 16) & 255) + "," + ((n >> 8) & 255) + "," + (n & 255) + "," + a + ")";
  }

  // 32x32 격자에 도트 캐릭터. pose: "stand"(기본) | "kneel"(한쪽 무릎)
  function drawCharacter(ctx, tier, S, pose) {
    function p(x, y, w, h, c) {
      ctx.fillStyle = c;
      ctx.fillRect(x * S, y * S, w * S, h * S);
    }

    var o = OUTFITS[Math.min(tier, MAX_TIER)];
    var SKIN = "#f6cfa6";
    var SKIN_D = "#e2b18c";
    var OL = "#2c2622";
    var kneel = pose === "kneel";
    var dressShoe = o.pants || o.style === "jacket" || o.style === "suit" ||
      o.style === "armor" || o.style === "robe";
    var shoe = dressShoe ? "#1c1f26" : "#6a5f52";
    var legc = o.pants || o.shorts || null;

    if (o.glow) {
      ctx.save();
      ctx.globalAlpha = 0.45;
      var gg = ctx.createRadialGradient(16 * S, 14 * S, 2 * S, 16 * S, 14 * S, 18 * S);
      gg.addColorStop(0, o.glow);
      gg.addColorStop(0.55, o.glow);
      gg.addColorStop(1, hexA(o.glow, 0));
      ctx.fillStyle = gg;
      ctx.fillRect(0, 0, 32 * S, 32 * S);
      ctx.restore();
    }
    if (o.wings) {
      var wc = o.wingColor || "#eef1f7";
      var wcD = "#cdd3df";
      p(6, 10, 4, 2, wc); p(4, 12, 5, 2, wc); p(2, 14, 5, 2, wc);
      p(1, 16, 5, 2, wc); p(2, 18, 4, 2, wc); p(4, 20, 3, 1, wc);
      p(6, 11, 3, 1, wcD); p(4, 13, 4, 1, wcD); p(2, 15, 4, 1, wcD);
      p(1, 17, 3, 1, wcD); p(2, 19, 3, 1, wcD);
      p(22, 10, 4, 2, wc); p(23, 12, 5, 2, wc); p(25, 14, 5, 2, wc);
      p(26, 16, 5, 2, wc); p(26, 18, 4, 2, wc); p(25, 20, 3, 1, wc);
      p(23, 11, 3, 1, wcD); p(24, 13, 4, 1, wcD); p(26, 15, 4, 1, wcD);
      p(28, 17, 3, 1, wcD); p(26, 19, 3, 1, wcD);
    }

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
    if (kneel) {
      p(15, 21, 6, 4, OL); p(18, 24, 4, 9, OL);   // 세워 디딘 다리
      p(10, 22, 6, 5, OL); p(9, 26, 5, 5, OL);    // 무릎 꿇은 다리
      p(5, 30, 6, 2, OL);                         // 바닥에 눕힌 종아리
    } else {
      p(12, 23, 4, 7, OL);
      p(16, 23, 4, 7, OL);
    }

    p(10, 4, 12, 11, SKIN);
    p(9, 6, 1, 7, SKIN);
    p(22, 6, 1, 7, SKIN);
    p(13, 15, 6, 1, SKIN_D);
    p(11, 16, 10, 8, SKIN);
    p(9, 17, 2, 6, SKIN);
    p(22, 17, 2, 6, SKIN);
    p(8, 10, 1, 3, SKIN_D);
    p(23, 10, 1, 3, SKIN_D);
    if (kneel) {
      p(19, 28, 3, 3, SKIN);
    } else {
      p(13, 24, 2, 4, SKIN);
      p(18, 24, 2, 4, SKIN);
    }

    if (kneel) {
      if (legc) {
        p(15, 21, 6, 4, legc); p(18, 24, 4, 5, legc);
        p(10, 22, 6, 4, legc); p(9, 26, 5, 4, legc);
      }
      p(18, 31, 8, 2, shoe);
      p(4, 30, 5, 2, shoe);
    } else {
      if (o.shorts) {
        p(12, 22, 3, 3, o.shorts);
        p(17, 22, 3, 3, o.shorts);
      } else if (o.pants) {
        p(12, 23, 3, 5, o.pants);
        p(17, 23, 3, 5, o.pants);
      }
      p(12, 28, 4, 2, shoe);
      p(16, 28, 4, 2, shoe);
    }

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
    } else if (o.style === "armor") {
      var pl = o.plate || "#c2c8d4";
      var plD = o.plateD || "#9198a6";
      p(11, 16, 10, 8, pl);
      p(9, 16, 2, 7, pl);
      p(22, 16, 2, 7, plD);
      p(11, 16, 10, 1, "#eef1f6");
      p(9, 15, 3, 3, plD);
      p(21, 15, 3, 3, plD);
      p(15, 17, 2, 7, plD);
      p(11, 20, 10, 1, plD);
      p(13, 22, 6, 2, plD);
    } else if (o.style === "robe") {
      var rb = o.robe || "#3c4a86";
      var rbD = o.robeD || "#2d3a6c";
      var trim = o.trim || "#e8c860";
      var rlen = kneel ? 10 : 15;
      p(10, 15, 12, rlen, rb);
      if (!kneel) {
        p(9, 25, 14, 4, rb);
        p(8, 28, 16, 2, rb);
      }
      p(9, 16, 2, 9, rb);
      p(22, 16, 3, 9, rbD);
      p(20, 15, 2, rlen, rbD);
      p(10, 15, 12, 1, "rgba(255,255,255,0.16)");
      p(11, 15, 10, 2, trim);
      p(15, 17, 1, rlen - 3, trim);
      p(10, 19, 12, 1, rbD);
      if (!kneel) {
        p(9, 29, 16, 1, trim);
        p(11, 30, 4, 1, shoe);
        p(17, 30, 4, 1, shoe);
      }
      if (o.stars) {
        p(12, 20, 1, 1, "#ffe9a8"); p(18, 22, 1, 1, "#ffffff");
        p(13, 24, 1, 1, "#ffe9a8"); p(19, 19, 1, 1, "#ffffff");
        p(11, 23, 1, 1, "#ffe9a8"); p(17, 26, 1, 1, "#ffffff");
      }
    }
    if (o.tie) p(15, 17, 2, 5, o.tie);

    if (o.staff) {
      p(23, 9, 1, 21, "#6b4a2f");
      p(23, 9, 1, 10, "#7d5941");
      p(22, 7, 3, 3, o.gem || "#8fd0ff");
      p(22, 6, 3, 1, "#e7f5ff");
    }

    if (!o.helm) {
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
    }

    if (o.helm) {
      p(9, 3, 14, 11, "#b7bcc7");
      p(9, 3, 14, 2, "#d2d6de");
      p(8, 5, 1, 7, "#9298a4");
      p(23, 5, 1, 7, "#9298a4");
      p(10, 9, 5, 2, "#181b22");
      p(17, 9, 5, 2, "#181b22");
      p(15, 6, 2, 8, "#8b909c");
      p(11, 2, 10, 2, "#e7c65e");
      p(15, 0, 2, 3, "#e7c65e");
    }
    if (o.wizhat) {
      var hc = o.hatC || "#3a3f6b";
      p(6, 4, 20, 2, hc);
      p(9, 2, 14, 2, hc);
      p(12, 0, 8, 2, hc);
      p(14, 0, 4, 1, "#fff1b8");
      p(6, 4, 20, 1, o.hatBand || "#e8c860");
      if (o.stars) {
        p(11, 2, 1, 1, "#ffe9a8");
        p(19, 1, 1, 1, "#ffffff");
      }
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
    drawCharacter(ctx, Math.min(tier, MAX_TIER), S, "stand");
    return c;
  }

  /* ============================================================
     참음 방패 씬 — 옷 입은 캐릭터가 무릎 꿇고 방패로 돌을 막음
     충동이 0이면 편히 서 있음. 참음 횟수 = 막아 쌓은 돌.
     ============================================================ */

  var GW = 200, GH = 200, CS = 4;
  var CHAR_OFF_X = 8;
  var GROUND = 188;
  var CHAR_OFF_Y = GROUND - 32 * CS;
  var SHIELD_CX = CHAR_OFF_X + 24 * CS;
  var SHIELD_CY = CHAR_OFF_Y + 20 * CS;
  var SHIELD_RY = 5.6 * CS;
  var SHIELD_FRONT_PX = SHIELD_CX + 4.4 * CS;
  var WALL_X = GW - 12;
  var PILE_CX = SHIELD_FRONT_PX + 22;

  function pileRowCount(row) { return Math.max(1, 5 - row); }
  function pileSlot(n) {
    var row = 0, acc = 0;
    while (acc + pileRowCount(row) <= n) { acc += pileRowCount(row); row++; }
    var count = pileRowCount(row);
    var col = n - acc;
    var spacing = 10;
    var x = PILE_CX - ((count - 1) * spacing) / 2 + col * spacing;
    var y = GROUND - 5 - row * 7;
    return {
      x: x + (frac(n * 12.9) - 0.5) * 3,
      y: y + (frac(n * 7.3) - 0.5) * 2,
      r: 5.4 + frac(n * 3.1) * 1.6,
      seed: frac(n * 5.7) * 6
    };
  }

  function rockColor(s) { return Math.floor(s) % 2 ? "#b0a695" : "#c6bca8"; }

  function drawRock(ctx, x, y, r, seed) {
    ctx.fillStyle = rockColor(seed);
    ctx.strokeStyle = "rgba(0,0,0,0.28)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (var i = 0; i < 6; i++) {
      var a = (i / 6) * Math.PI * 2 + seed;
      var rr = r * (0.72 + 0.28 * Math.abs(Math.sin(seed + i * 1.7)));
      var px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  function drawShield(ctx) {
    var cx = SHIELD_CX, cy = SHIELD_CY, S = CS;
    ctx.fillStyle = "#f6cfa6";
    ctx.fillRect(CHAR_OFF_X + 21 * S, cy - S, cx - (CHAR_OFF_X + 21 * S), S * 2.2);
    ctx.fillStyle = "#e2b18c";
    ctx.fillRect(CHAR_OFF_X + 21 * S, cy + S * 1.2, cx - (CHAR_OFF_X + 21 * S), S * 0.8);
    ctx.save();
    ctx.fillStyle = "#8a6a3a";
    ctx.strokeStyle = "#5e4622";
    ctx.lineWidth = Math.max(1, S * 0.8);
    ctx.beginPath();
    ctx.ellipse(cx, cy, S * 4.4, SHIELD_RY, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = "#b98f4e";
    ctx.lineWidth = Math.max(1, S * 0.55);
    ctx.beginPath();
    ctx.ellipse(cx, cy, S * 2.7, SHIELD_RY * 0.64, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = "#5e4622";
    ctx.beginPath();
    ctx.arc(cx, cy, S * 1.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // tier: 옷 단계, blocked: 오늘 막은 횟수, opts.pileCount/opts.extra: 연출용
  function drawShieldScene(ctx, tier, blocked, opts) {
    opts = opts || {};
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, GW, GH);

    ctx.fillStyle = "#6c6459";
    ctx.fillRect(WALL_X, 0, GW - WALL_X, GH);
    ctx.fillStyle = "rgba(0,0,0,0.16)";
    for (var w = 6; w < GH; w += 13) ctx.fillRect(WALL_X, w, GW - WALL_X, 1);
    ctx.fillStyle = "rgba(255,255,255,0.05)";
    ctx.fillRect(WALL_X, 0, 2, GH);

    ctx.fillStyle = "rgba(0,0,0,0.14)";
    ctx.fillRect(0, GROUND, GW, 2);
    ctx.fillStyle = "rgba(0,0,0,0.12)";
    ctx.beginPath();
    ctx.ellipse(CHAR_OFF_X + 15 * CS, GROUND + 2, 40, 6, 0, 0, Math.PI * 2);
    ctx.fill();

    var kneeling = blocked > 0 || opts.forceKneel;
    ctx.save();
    ctx.translate(CHAR_OFF_X, CHAR_OFF_Y);
    drawCharacter(ctx, tier, CS, kneeling ? "kneel" : "stand");
    ctx.restore();

    if (!kneeling) return;
    drawShield(ctx);

    var shown = opts.pileCount == null ? blocked : opts.pileCount;
    for (var i = 0; i < shown; i++) {
      var s = pileSlot(i);
      drawRock(ctx, s.x, s.y, s.r, s.seed);
    }
    if (opts.extra) opts.extra(ctx);
  }

  function shieldCanvas(tier, blocked) {
    var c = document.createElement("canvas");
    c.width = GW;
    c.height = GH;
    drawShieldScene(c.getContext("2d"), tier, blocked);
    c._tier = tier;
    c._blocked = blocked;
    return c;
  }

  // 참음: 돌 하나가 날아와 방패에 맞고 굴러 쌓이는 연출
  function animateShieldThrow(canvas, tier) {
    var ctx = canvas.getContext("2d");
    var blocked = canvas._blocked;
    if (reduceMotion || blocked < 1) {
      drawShieldScene(ctx, tier, blocked);
      return;
    }
    var target = pileSlot(blocked - 1);
    var rock = {
      x: WALL_X - 2,
      y: SHIELD_CY - 20 - frac(blocked * 4.1) * 30,
      r: target.r,
      seed: target.seed,
      vx: -(4.8 + frac(blocked) * 1.4),
      vy: -0.3,
      phase: "fly"
    };
    var flash = 0, t = 0;
    function step() {
      t++;
      if (flash > 0) flash--;
      if (rock.phase === "fly") {
        rock.x += rock.vx; rock.y += rock.vy; rock.vy += 0.04;
        if (rock.x <= SHIELD_FRONT_PX) {
          rock.phase = "drop";
          rock.x = SHIELD_FRONT_PX;
          rock.vx = 1.4 + frac(t) * 1.2;
          rock.vy = -2.6 - frac(t * 2);
          flash = 6;
        }
      } else if (rock.phase === "drop") {
        rock.x += rock.vx; rock.y += rock.vy; rock.vy += 0.5; rock.vx *= 0.95;
        if (rock.y >= target.y) rock.phase = "done";
      }
      drawShieldScene(ctx, tier, blocked, {
        pileCount: blocked - 1,
        extra: function (c) {
          if (rock.phase !== "done") drawRock(c, rock.x, rock.y, rock.r, rock.seed);
          if (flash > 0) {
            c.save();
            c.strokeStyle = "rgba(255,236,180," + (flash / 6) + ")";
            c.lineWidth = 2;
            c.beginPath();
            c.arc(SHIELD_FRONT_PX - 2, SHIELD_CY, 8 + (6 - flash) * 3, -0.9, 0.9);
            c.stroke();
            c.restore();
          }
        }
      });
      if (rock.phase !== "done" || flash > 0) {
        requestAnimationFrame(step);
      } else {
        drawShieldScene(ctx, tier, blocked);
      }
    }
    requestAnimationFrame(step);
  }

  /* ============================================================
     연속 일수 → 쌓이는 트럼프 카드 피라미드
     하루에 자그만 삼각형(카드 두 장) 하나씩, 바닥 줄부터 채운다.
     ============================================================ */

  function frac(v) {
    v = Math.sin(v) * 43758.5453;
    return v - Math.floor(v);
  }

  var TW = { W: 384, H: 208 };
  var C_FACE2 = "#efe8d6";
  var SUIT_RED = "#c0473c";
  var SUIT_BLK = "#33333c";
  var SUITS = ["♠", "♥", "♦", "♣"];

  // 아직 안 쌓인 목표 자리 — 테마별 점선 색
  function ghostStroke() {
    var t = document.documentElement.getAttribute("data-theme");
    var dark = t === "dark" ||
      (t !== "light" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    return dark ? "rgba(190,192,200,0.34)" : "rgba(90,95,110,0.34)";
  }

  function roundRectPath(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // 카드 한 장: 중심 (cx,cy), 길이 len, 폭 w, 각도 ang(라디안). ghost=true면 점선 윤곽만.
  function paintCard(ctx, cx, cy, len, w, ang, suitIdx, ghost) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(ang);
    roundRectPath(ctx, -len / 2, -w / 2, len, w, Math.min(2.5, w / 3));
    if (ghost) {
      ctx.strokeStyle = ghostStroke();
      ctx.lineWidth = 1;
      ctx.setLineDash([2.5, 3]);
      ctx.stroke();
      ctx.restore();
      return;
    }
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

    var rowH = Math.min(24, (H - 2 * m) / R);
    var pitch = Math.min((W - 2 * m) / R, rowH * 1.7);
    var foot = pitch * 0.82;
    var th = rowH * 1.02;
    var cardW = Math.max(3, pitch * 0.14);
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
        var tx = left + j * pitch;
        var filled = !!filledSet[j];
        cards.push({
          cx: tx - foot / 4, cy: (apexY + rowY) / 2, len: cardLen, w: cardW,
          ang: Math.atan2(th, -foot / 2), suit: suit++ % 4, ghost: !filled
        });
        cards.push({
          cx: tx + foot / 4, cy: (apexY + rowY) / 2, len: cardLen, w: cardW,
          ang: Math.atan2(th, foot / 2), suit: suit++ % 4, ghost: !filled
        });
        present.push({ x: tx, filled: filled });
        if (rc === 1) topApexY = apexY;
      }
      for (var k = 0; k < rc - 1; k++) {
        var both = present[k].filled && present[k + 1].filled;
        cards.push({
          cx: (present[k].x + present[k + 1].x) / 2, cy: apexY - cardW * 0.6,
          len: pitch + foot * 0.15, w: cardW, ang: 0, suit: suit++ % 4, ghost: !both
        });
      }
    }
    return { cards: cards, cx: cx, baseY: baseY, topY: topApexY, rows: R, cap: cap, filled: n };
  }

  function groundShadow(ctx, T, spread) {
    ctx.save();
    ctx.fillStyle = "rgba(0,0,0,0.10)";
    ctx.beginPath();
    ctx.ellipse(T.cx, T.baseY + 5, spread || 74, 7, 0, 0, 7);
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
      if (cd.ghost) paintCard(ctx, cd.cx, cd.cy, cd.len, cd.w, cd.ang, cd.suit, true);
    });
    T.cards.forEach(function (cd) {
      if (!cd.ghost) paintCard(ctx, cd.cx, cd.cy, cd.len, cd.w, cd.ang, cd.suit, false);
    });
    if (done) drawFlag(ctx, T.cx, T.topY);
    c._tower = T;
    return c;
  }

  // 무너지는 연출 — 쌓인 카드만 튕겨 흩어지고, 목표 윤곽(점선)은 남는다
  function collapseTower(canvas, dayCount, goal) {
    var ctx = canvas.getContext("2d");
    var T = canvas._tower || buildTower(dayCount, goal);
    var floor = T.baseY + 3;
    var ghosts = T.cards.filter(function (c) { return c.ghost; });
    function drawGhosts() {
      ghosts.forEach(function (cd) {
        paintCard(ctx, cd.cx, cd.cy, cd.len, cd.w, cd.ang, cd.suit, true);
      });
    }
    var bodies = T.cards.filter(function (c) { return !c.ghost; }).map(function (cd) {
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

    if (reduceMotion) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      groundShadow(ctx, T, 90);
      drawGhosts();
      bodies.forEach(function (b, i) {
        var rx = T.cx + (frac(i * 1.7) - 0.5) * 180;
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
      groundShadow(ctx, T, 74 + Math.min(20, t * 0.5));
      drawGhosts();
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
          dust(T.cx + (Math.random() - 0.5) * 90, T.baseY - Math.random() * 40);
        }
      }
      if (settled < bodies.length && t < 150) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  /* ============================================================
     카드 순서 바꾸기 (손잡이를 잡고 위아래 드래그)
     ============================================================ */

  function attachDrag(handle, card) {
    handle.addEventListener("pointerdown", function (e) {
      if (e.button != null && e.button > 0) return;
      var startY = e.clientY;
      var startX = e.clientX;
      var started = false;
      try {
        handle.setPointerCapture(e.pointerId);
      } catch (err) {}

      function move(ev) {
        if (!started) {
          if (Math.abs(ev.clientY - startY) < 4 && Math.abs(ev.clientX - startX) < 4) {
            return;
          }
          started = true;
          beginDrag(card, ev);
        }
        ev.preventDefault();
        dragMove(ev);
      }
      function end() {
        handle.removeEventListener("pointermove", move);
        handle.removeEventListener("pointerup", end);
        handle.removeEventListener("pointercancel", end);
        if (started) dragEnd();
      }
      handle.addEventListener("pointermove", move);
      handle.addEventListener("pointerup", end);
      handle.addEventListener("pointercancel", end);
    });
  }

  function beginDrag(card, e) {
    var rect = card.getBoundingClientRect();
    var ph = document.createElement("div");
    ph.className = "habit--placeholder";
    ph.style.height = rect.height + "px";

    card.style.width = rect.width + "px";
    card.style.position = "fixed";
    card.style.left = rect.left + "px";
    card.style.top = rect.top + "px";
    card.style.margin = "0";
    card.style.zIndex = "999";
    card.style.pointerEvents = "none";
    card.classList.add("is-dragging");

    listEl.insertBefore(ph, card.nextSibling);
    dragState = { card: card, ph: ph, grabY: e.clientY - rect.top };
    document.body.style.userSelect = "none";
  }

  function dragMove(e) {
    var ds = dragState;
    if (!ds) return;
    ds.card.style.top = e.clientY - ds.grabY + "px";

    var others = Array.prototype.slice.call(
      listEl.querySelectorAll(".habit:not(.is-dragging)")
    );
    var target = null;
    for (var i = 0; i < others.length; i++) {
      var r = others[i].getBoundingClientRect();
      if (e.clientY < r.top + r.height / 2) {
        target = others[i];
        break;
      }
    }
    if (target) listEl.insertBefore(ds.ph, target);
    else listEl.appendChild(ds.ph);

    var pad = 64;
    if (e.clientY < pad) window.scrollBy(0, -12);
    else if (e.clientY > window.innerHeight - pad) window.scrollBy(0, 12);
  }

  function dragEnd() {
    var ds = dragState;
    if (!ds) return;
    dragState = null;
    document.body.style.userSelect = "";

    listEl.insertBefore(ds.card, ds.ph);
    listEl.removeChild(ds.ph);
    ds.card.classList.remove("is-dragging");
    ds.card.style.cssText = "";

    var order = Array.prototype.slice.call(listEl.children).map(function (c) {
      return c.getAttribute("data-id");
    });
    habits.sort(function (a, b) {
      return order.indexOf(a.id) - order.indexOf(b.id);
    });
    saveHabits(habits);
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
    var tier = tierForDay(dayNum);       // 옷 = 연속일
    var blocked = habit.resistCount;     // 오늘 방패로 막은 충동 수

    var card = document.createElement("div");
    card.className = "habit";
    card.setAttribute("data-id", habit.id);
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
      openPause(habit.id);
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

    /* ---- 보상 서랍 (의상 | 참음 방패 / 트럼프 탑) ---- */
    var reward = document.createElement("div");
    reward.className = "habit__reward";

    // 왼쪽 위: 의상 룸 (연속일 → 옷)
    var colChar = document.createElement("div");
    colChar.className = "reward__col";
    var charCap = document.createElement("div");
    charCap.className = "reward__cap";
    charCap.textContent = "연속 D+" + dayNum;
    colChar.appendChild(charCap);
    var stage = document.createElement("div");
    stage.className = "box box--stage";
    stage.appendChild(charCanvas(tier, 8));
    colChar.appendChild(stage);
    var charLabel = document.createElement("div");
    charLabel.className = "reward__label";
    charLabel.textContent = OUTFITS[tier].name;
    colChar.appendChild(charLabel);
    var charHint = document.createElement("div");
    charHint.className = "reward__hint";
    charHint.textContent = dayNum >= OUTFIT_DAYS
      ? "20벌 완성"
      : "매일 한 벌씩 (" + Math.min(dayNum, OUTFIT_DAYS) + " / " + OUTFIT_DAYS + ")";
    colChar.appendChild(charHint);
    reward.appendChild(colChar);

    // 오른쪽 위: 참음 방패 씬 (오늘 막은 충동)
    var colGuard = document.createElement("div");
    colGuard.className = "reward__col";
    var guardCap = document.createElement("div");
    guardCap.className = "reward__cap";
    guardCap.textContent = blocked === 0 ? "오늘 충동 없음" : "오늘 " + blocked + "번 막음";
    colGuard.appendChild(guardCap);
    var guardBox = document.createElement("div");
    guardBox.className = "box box--guard";
    var guardCv = shieldCanvas(tier, blocked);
    guardBox.appendChild(guardCv);
    colGuard.appendChild(guardBox);
    if (habit.id === justResistedId) animateShieldThrow(guardCv, tier);
    var guardLabel = document.createElement("div");
    guardLabel.className = "reward__label";
    guardLabel.textContent = blocked === 0 ? "잔잔한 하루" : "흔들렸지만 넘김";
    colGuard.appendChild(guardLabel);
    var guardHint = document.createElement("div");
    guardHint.className = "reward__hint";
    guardHint.textContent = "충동이 없는 날도 좋은 날입니다";
    colGuard.appendChild(guardHint);
    reward.appendChild(colGuard);

    // 아래: 연속 카드 피라미드 (전체폭)
    var colTower = document.createElement("div");
    colTower.className = "reward__col reward__col--wide";
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
            '" 습관을 어겼나요?\n연속일과 옷·탑이 처음으로 돌아가고, 어긴 횟수가 1 늘어납니다.'
        )
      ) {
        return;
      }
      openIds[habit.id] = true;
      card.classList.add("is-open", "is-broken");
      stage.classList.add("is-stumble");
      collapseTower(towerCv, dayNum, habit.goalDays);
      setTimeout(function () {
        violateHabit(habit.id);
      }, reduceMotion ? 120 : 900);
    });

    card.appendChild(top);
    card.appendChild(editPanel);
    card.appendChild(act);
    card.appendChild(reward);

    if (habits.length > 1) {
      var grip = document.createElement("button");
      grip.type = "button";
      grip.className = "habit__grip";
      grip.setAttribute("aria-label", "드래그해서 순서 변경");
      grip.title = "드래그해서 순서 변경";
      grip.innerHTML =
        '<svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">' +
        '<g fill="currentColor">' +
        '<circle cx="5" cy="3" r="1.3"/><circle cx="9" cy="3" r="1.3"/>' +
        '<circle cx="5" cy="7" r="1.3"/><circle cx="9" cy="7" r="1.3"/>' +
        '<circle cx="5" cy="11" r="1.3"/><circle cx="9" cy="11" r="1.3"/>' +
        "</g></svg>";
      attachDrag(grip, card);
      card.appendChild(grip);
    }

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
    habit.resistCount += 1;
    justResistedId = id; // buildCard에서 방패로 막는 연출 실행
    saveHabits(habits);
    render();
    justResistedId = null;
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
     참음 전 10초 멈춤 — 충동이 가라앉을 시간을 강제로 둔다
     10초를 버텨야 "참음"으로 기록된다. 취소하면 아무것도 안 남는다.
     ============================================================ */

  var PAUSE_SECONDS = 10;
  var pauseEl = document.getElementById("pauseOverlay");
  var pauseNumEl = document.getElementById("pauseNum");
  var pauseBarEl = document.getElementById("pauseBar");
  var pauseDoneEl = document.getElementById("pauseDone");
  var pauseStopEl = document.getElementById("pauseStop");
  var pauseTimer = null;
  var pauseHabitId = null;
  var pauseLastFocus = null;

  function openPause(id) {
    if (pauseTimer) clearInterval(pauseTimer);
    pauseHabitId = id;
    pauseLastFocus = document.activeElement;

    var left = PAUSE_SECONDS;
    pauseNumEl.textContent = left;
    pauseDoneEl.disabled = true;
    pauseDoneEl.textContent = left + "초";

    pauseBarEl.style.transition = "none";
    pauseBarEl.style.width = "0%";
    pauseEl.hidden = false;
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        pauseBarEl.style.transition = "width " + PAUSE_SECONDS + "s linear";
        pauseBarEl.style.width = "100%";
      });
    });
    pauseStopEl.focus();

    pauseTimer = setInterval(function () {
      left -= 1;
      if (left <= 0) {
        clearInterval(pauseTimer);
        pauseTimer = null;
        pauseNumEl.textContent = "0";
        pauseDoneEl.disabled = false;
        pauseDoneEl.textContent = "참음으로 기록";
        pauseDoneEl.focus();
      } else {
        pauseNumEl.textContent = left;
        pauseDoneEl.textContent = left + "초";
      }
    }, 1000);
  }

  function closePause() {
    if (pauseTimer) {
      clearInterval(pauseTimer);
      pauseTimer = null;
    }
    pauseEl.hidden = true;
    pauseHabitId = null;
    if (pauseLastFocus && pauseLastFocus.focus) pauseLastFocus.focus();
  }

  pauseStopEl.addEventListener("click", closePause);

  pauseDoneEl.addEventListener("click", function () {
    if (pauseDoneEl.disabled) return;
    var id = pauseHabitId;
    closePause();
    if (id) resistHabit(id);
  });

  pauseEl.addEventListener("click", function (e) {
    if (e.target === pauseEl) closePause();
  });

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && !pauseEl.hidden) closePause();
  });

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
