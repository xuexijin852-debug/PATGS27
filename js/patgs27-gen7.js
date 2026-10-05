"use strict";

/* =========================================================
   PATGS27  patgs27-gen7b.js  （第七次改革・追加機能）
   =========================================================
   読み込み順：script.js → patgs27-gen7.js → このファイル

   ・おはよう／おやすみ（日時を記録）
   ・すごろく（作文を書いて完了した授業の数＝サイコロ回数）
   ・週間時間割の表形式表示と、予定の変更・追加・削除、テンプレート
   ・学習開始・終了時の200字以上の作文（未満は開始・終了できない）
   ・作文一覧（後から確認）
   ・週次レビュー：まとめ表示、AI要約・総まとめ・改善提案、200字以上の振り返り作文

   既存データ（旧予約・旧時間割の記録）は削除せず、そのまま残す。
   新しいデータは patgs27_g7_* のキーに保存する。
   ========================================================= */

(function () {

    if (typeof window.renderHomePlan !== "function" || typeof weeklyPlanRecords === "undefined") {
        console.error("patgs27-gen7b.js: patgs27-gen7.js が先に読み込まれていません。");
        return;
    }

    /* ---------------------------------------------------------
       設定値（変えたいときはここだけ直す）
       --------------------------------------------------------- */

    var MIN_CHARS = 200;          /* 作文の最低文字数（空白・改行は数えない） */
    var LATE_AFTER_MIN = 5;       /* 開始時刻から5分を過ぎて作文提出 → 遅刻 */
    var OUT_AFTER_MIN = 7;        /* 開始時刻から7分を過ぎて作文提出 → アウト */

    var K = {
        life: "patgs27_g7_life",
        essays: "patgs27_g7_essays",
        sugo: "patgs27_g7_sugoroku",
        ai: "patgs27_g7_ai",
        planlog: "patgs27_g7_planlog"
    };

    var STATUS = {
        planned: "未記録", in_progress: "学習中", done: "完了",
        not_started: "未着手", plan_changed: "予定変更", empty: "空きコマ"
    };

    var DAYS = ["日", "月", "火", "水", "木", "金", "土"];

    var TEMPLATES = {
        club: {
            label: "平日：部活がある日",
            times: ["19:30", "20:10", "20:50", "21:30"],
            flow: "帰宅17:00〜17:30／休憩／夕食18:00〜19:30／学習①〜④（19:30〜22:10）／就寝準備／22:30入浴／23:30就寝"
        },
        noclub: {
            label: "平日：部活がない日",
            times: ["16:00", "16:40", "17:20", "19:30", "20:10", "20:50", "21:30"],
            flow: "帰宅15:00〜15:30／休憩／学習①〜③（16:00〜18:00）／夕食18:00〜19:30／学習④〜⑦（19:30〜22:10）／22:30入浴／23:30就寝"
        },
        early: {
            label: "平日：早帰りの日",
            times: ["15:00", "15:40", "16:20", "17:00", "19:30", "20:10", "20:50", "21:30"],
            flow: "14:00ごろ帰宅／休憩／学習①〜④（15:00〜17:40）／夕食18:00〜19:30／学習⑤〜⑧（19:30〜22:10）／22:30入浴／23:30就寝"
        },
        holiday: {
            label: "土日・祝日",
            times: ["09:00", "10:00", "11:00", "13:15", "14:15", "15:15", "16:15", "19:20", "20:20", "21:20"],
            flow: "学習①〜③（9:00〜12:00）／昼食12:00〜13:15／学習④〜⑦（13:15〜17:15）／夕食18:00〜19:20／学習⑧〜⑩（19:20〜22:20）／22:30入浴／23:30就寝"
        }
    };

    var MORNING_TIMES = ["06:00", "06:40", "07:45"];

    /* ---------------------------------------------------------
       共通の道具
       --------------------------------------------------------- */

    function esc(text) {
        return String(text === undefined || text === null ? "" : text)
            .replace(/&/g, "&amp;").replace(/</g, "&lt;")
            .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    }

    function countChars(text) {
        return String(text || "").replace(/\s/g, "").length;
    }

    function newId(prefix) {
        return prefix + "_" + Date.now() + "_" + Math.floor(Math.random() * 100000);
    }

    function nowMinutes() {
        var d = new Date();
        return d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60;
    }

    function isOptional(slot) {
        if (slot.optional === true) { return true; }
        if (slot.optional === false) { return false; }
        return (slot.time || "") < "08:30";
    }

    function slotDate(weekKey, slot) {
        return addDaysToKey(weekKey, slot.dayOfWeek);
    }

    function findSlot(weekKey, slotId) {
        var week = weeklyPlanTimetables[weekKey];
        return week ? week.slots.find(function (s) { return s.id === slotId; }) : null;
    }

    function recOf(weekKey, slotId) {
        return (weeklyPlanRecords[weekKey] || {})[slotId] || null;
    }

    function statusOf(weekKey, slot) {
        if (slot.isEmpty) { return "empty"; }
        var rec = recOf(weekKey, slot.id);
        return rec ? rec.status : "planned";
    }

    function slotEnded(weekKey, slot) {
        var date = slotDate(weekKey, slot);
        var today = todayKey();
        if (date < today) { return true; }
        if (date > today) { return false; }
        return nowMinutes() >= timeToMinutes(slot.time) + weeklyPlanDurations(date).study;
    }

    /* 棄権＝任意枠ではない授業が、終わっても開始されなかった */
    function isForfeit(weekKey, slot) {
        return !isOptional(slot) && statusOf(weekKey, slot) === "planned" && slotEnded(weekKey, slot);
    }

    function addEssay(data) {
        var list = loadJSON(K.essays, []);
        var essay = Object.assign({
            id: newId("es"),
            length: countChars(data.text),
            at: nowText()
        }, data);
        list.push(essay);
        saveJSON(K.essays, list);
        return essay.id;
    }

    function logPlanChange(weekKey, text) {
        var list = loadJSON(K.planlog, []);
        list.push({ week: weekKey, at: nowText(), text: text });
        saveJSON(K.planlog, list.slice(-200));
    }

    /* ---------------------------------------------------------
       見た目（CSS）
       --------------------------------------------------------- */

    var style = document.createElement("style");
    style.textContent =
        ".g7-table-wrap{overflow-x:auto;margin:10px 0}" +
        ".g7-table{border-collapse:collapse;width:100%;min-width:640px;font-size:12px}" +
        ".g7-table th,.g7-table td{border:1px solid var(--line);padding:4px;vertical-align:top;background:#fff}" +
        ".g7-table th{background:#f5f2ff;color:var(--indigo-deep)}" +
        ".g7-table th.g7-hol{background:#ffe9de}" +
        ".g7-time{font-weight:800;white-space:nowrap;background:#faf9f5!important}" +
        ".g7-slot{border-left:4px solid var(--indigo);padding:3px 5px;margin-bottom:3px;background:#faf9ff}" +
        ".g7-slot.g7-done{border-left-color:var(--green);background:var(--green-soft)}" +
        ".g7-slot.g7-in_progress{border-left-color:var(--coral);background:#fff2ee}" +
        ".g7-slot.g7-not_started,.g7-slot.g7-empty{border-left-color:var(--amber);background:var(--amber-soft)}" +
        ".g7-slot.g7-forfeit{border-left-color:var(--red);background:var(--red-soft)}" +
        ".g7-task{color:var(--ink-soft)}" +
        ".g7-btns{display:flex;flex-wrap:wrap;gap:3px;margin-top:3px}" +
        ".g7-btns button,.g7-add{font-size:11px;padding:2px 7px}" +
        ".g7-count{font-weight:700;margin:4px 0}" +
        ".g7-count.ok{color:var(--green-deep)}.g7-count.ng{color:var(--red)}" +
        ".g7-modal textarea{min-height:180px}" +
        ".g7-board .map-square{width:30px;height:30px;font-size:14px}" +
        ".g7-board{max-height:none!important}" +
        ".g7-board .passed{background:#9be9a8}" +
        ".g7-dice{font-size:44px;margin-left:10px}" +
        ".g7-pre{white-space:pre-wrap;background:#faf9f5;border-radius:8px;padding:8px 10px;font-size:13px}" +
        ".g7-essay-body{white-space:pre-wrap;font-size:13px;margin:6px 0}" +
        ".g7-ed{background:#faf9f5;border:1px solid var(--line);border-radius:8px;padding:10px;margin:10px 0}";
    document.head.appendChild(style);


    /* ---------------------------------------------------------
       画面の追加（HTMLを書き足す）
       --------------------------------------------------------- */

    var mainApp = $("mainApp");

    var homeFirst = document.querySelector('[data-screen="home"]');

    if (homeFirst) {
        homeFirst.insertAdjacentHTML("afterend",
            '<section data-screen="home" class="panel">' +
            '<h2>🌅 おはよう／おやすみ</h2>' +
            '<div class="btn-row">' +
            '<button id="g7WakeBtn" class="primary">🌅 おはよう</button>' +
            '<button id="g7SleepBtn" class="primary">🌙 おやすみ</button>' +
            '</div>' +
            '<p class="sub" id="g7LifeStatus"></p>' +
            '</section>');
    }

    mainApp.insertAdjacentHTML("beforeend",
        '<section data-screen="sugoroku" class="panel panel-main">' +
        '<h2>🎲 すごろく</h2>' +
        '<p class="sub">作文を書いて完了した授業の数だけ、自分でサイコロを振れます。ゴールすると次のステージへ進みます。' +
        '朝の予備枠も、作文を書いて完了すればサイコロ回数になります（使わなくても棄権にはなりません）。</p>' +
        '<p id="g7SugoStatus"></p>' +
        '<div id="g7SugoBoard" class="map-board g7-board"></div>' +
        '<div class="btn-row"><button id="g7RollBtn" class="primary">🎲 サイコロを振る</button>' +
        '<span id="g7DiceFace" class="g7-dice"></span></div>' +
        '<p class="sub" id="g7SugoMsg"></p>' +
        '<h3>履歴</h3><div id="g7SugoLog"></div>' +
        '</section>' +

        '<section data-screen="essays" class="panel panel-main">' +
        '<h2>✍️ 作文一覧</h2>' +
        '<p class="sub">学習開始・終了時に書いた作文と、週次レビューの振り返り作文を後から確認できます。</p>' +
        '<label class="inline-label">種類：<select id="g7EssayFilter" style="width:auto">' +
        '<option value="all">すべて</option><option value="start">開始の作文</option>' +
        '<option value="end">終了の作文</option><option value="review">週次レビューの作文</option></select></label>' +
        '<div id="g7EssayList"></div>' +
        '</section>' +

        '<div id="g7EssayOverlay" class="intervention-overlay" style="display:none;">' +
        '<div class="intervention-modal g7-modal">' +
        '<h3 id="g7EssayTitle" style="color:var(--indigo-deep)"></h3>' +
        '<p class="sub" id="g7EssayHint"></p>' +
        '<textarea id="g7EssayText" rows="8"></textarea>' +
        '<p id="g7EssayCount" class="g7-count"></p>' +
        '<div class="btn-row"><button id="g7EssaySubmit" class="primary"></button>' +
        '<button id="g7EssayCancel" class="ghost">やめる</button></div>' +
        '</div></div>');

    /* 週間時間割：表・編集欄・テンプレートを追加し、古い一覧と追加フォームを隠す */

    var oldList = $("weeklyPlanSlotList");

    if (oldList) {

        oldList.insertAdjacentHTML("beforebegin",
            '<div class="btn-row"><button id="g7AddSlotBtn" class="primary small">＋ 予定を追加</button></div>' +
            '<div class="g7-table-wrap" id="g7PlanTable"></div>' +
            '<div class="g7-ed" id="g7PlanEditor" style="display:none;">' +
            '<h4 id="g7EdTitle">予定の編集</h4>' +
            '<div class="form-grid">' +
            '<label>曜日<select id="g7EdDay">' +
            DAYS.map(function (d, i) { return '<option value="' + i + '">' + d + '</option>'; }).join("") +
            '</select></label>' +
            '<label>時刻<input type="time" id="g7EdTime"></label>' +
            '<label>教科<input type="text" id="g7EdSubject" placeholder="例：数学"></label>' +
            '<label>学習課題<input type="text" id="g7EdTask" placeholder="例：青チャート例題32〜40"></label>' +
            '<label class="wide check-label"><input type="checkbox" id="g7EdOptional">任意の予備枠（使わなくても棄権にならない）</label>' +
            '</div>' +
            '<div class="btn-row"><button id="g7EdSave" class="primary small">保存</button>' +
            '<button id="g7EdDelete" class="ghost small">削除</button>' +
            '<button id="g7EdClose" class="ghost small">閉じる</button></div>' +
            '<p class="form-status" id="g7EdStatus"></p></div>' +
            '<details class="cal-add-details"><summary>📋 テンプレートから時間割を作る</summary>' +
            '<div class="form-grid">' +
            '<label>パターン<select id="g7TplPattern">' +
            Object.keys(TEMPLATES).map(function (k) {
                return '<option value="' + k + '">' + TEMPLATES[k].label + '</option>';
            }).join("") +
            '</select></label>' +
            '<label>曜日<select id="g7TplDay">' +
            DAYS.map(function (d, i) { return '<option value="' + i + '">' + d + '</option>'; }).join("") +
            '</select></label>' +
            '<label class="wide check-label"><input type="checkbox" id="g7TplMorning">朝の予備枠（6:00・6:40・7:45）も追加する</label>' +
            '</div>' +
            '<div class="btn-row"><button id="g7TplApply" class="primary small">この曜日に反映（教科は「未設定」で入ります）</button></div>' +
            '<p class="sub" id="g7TplFlow"></p><p class="form-status" id="g7TplStatus"></p></details>');

        var panel = $("weeklyPlanPanel");

        if (panel) {
            Array.prototype.slice.call(panel.children).forEach(function (el) {
                if (
                    el === oldList || el.tagName === "H3" || el.classList.contains("form-grid") ||
                    (el.classList.contains("btn-row") && el.querySelector("#weeklyPlanAddSlotBtn"))
                ) {
                    el.style.display = "none";
                }
            });
        }
    }

    /* 週次レビュー：まとめ・AI・200字作文のパネルを追加し、古い入力欄を隠す */

    var reviewPanel = $("weeklyPlanReviewPanel");

    if (reviewPanel) {

        reviewPanel.insertAdjacentHTML("beforebegin",
            '<section data-screen="weeklyplanreview" class="panel panel-main">' +
            '<h2>📊 今週のまとめ</h2>' +
            '<div class="btn-row"><button id="g7RvPrev" class="ghost small">← 前週</button>' +
            '<span class="patgs-today" id="g7RvWeek">-</span>' +
            '<button id="g7RvNext" class="ghost small">次週 →</button></div>' +
            '<p class="sub" id="g7RvWindow"></p>' +
            '<div id="g7RvStats" class="stat-row"></div>' +
            '<div id="g7RvBody"></div>' +
            '</section>' +

            '<section data-screen="weeklyplanreview" class="panel panel-main">' +
            '<h2>🤖 AIによる要約・総まとめ</h2>' +
            '<div class="btn-row"><button id="g7AiBtn" class="primary small">AIで作る／作り直す</button></div>' +
            '<p class="sub" id="g7AiStatus"></p>' +
            '<h3>今週の作文の要約</h3><div id="g7AiEssay" class="g7-pre"></div>' +
            '<h3>今週の総まとめ・翌週への改善提案</h3><div id="g7AiOverall" class="g7-pre"></div>' +
            '</section>' +

            '<section data-screen="weeklyplanreview" class="panel panel-main">' +
            '<h2>✍️ 週次レビューの振り返り作文</h2>' +
            '<p class="sub">今週の振り返りを200字以上で書いてください（空白・改行は数えません）。200字未満では保存できません。</p>' +
            '<textarea id="g7RvEssay" rows="8" placeholder="今週できたこと・できなかったこと・来週に活かしたいこと"></textarea>' +
            '<p id="g7RvCount" class="g7-count"></p>' +
            '<div class="btn-row"><button id="g7RvSave" class="primary">保存する</button>' +
            '<button id="g7RvNotDone" class="ghost">今回は未実施として記録する</button>' +
            '<span class="sub" id="g7RvSaveStatus"></span></div>' +
            '</section>');

        var oldText = $("weeklyPlanReviewText");
        if (oldText && oldText.closest("label")) { oldText.closest("label").style.display = "none"; }

        var oldSave = $("weeklyPlanReviewSaveBtn");
        if (oldSave && oldSave.closest(".btn-row")) { oldSave.closest(".btn-row").style.display = "none"; }

        reviewPanel.querySelectorAll("p.sub").forEach(function (p) {
            if (p.textContent.indexOf("AIによる自動要約") !== -1) { p.style.display = "none"; }
        });
    }


    /* ---------------------------------------------------------
       おはよう／おやすみ
       --------------------------------------------------------- */

    function lifeDateForSleep() {
        var d = new Date();
        if (d.getHours() < 5) { d.setDate(d.getDate() - 1); }
        return dateKeyOf(d);
    }

    function recordLife(kind) {

        var all = loadJSON(K.life, {});
        var key = (kind === "wake") ? todayKey() : lifeDateForSleep();
        var entry = all[key] || {};

        if (entry[kind] && !confirm("すでに記録があります（" + entry[kind] + "）。上書きしますか？")) {
            return;
        }

        entry[kind] = nowText();
        all[key] = entry;
        saveJSON(K.life, all);

        if (typeof playChime === "function") { playChime(); }

        renderLifeStatus();
        renderG7Review();
    }

    function renderLifeStatus() {

        var el = $("g7LifeStatus");

        if (!el) { return; }

        var all = loadJSON(K.life, {});
        var wake = (all[todayKey()] || {}).wake;
        var sleep = (all[lifeDateForSleep()] || {}).sleep;

        el.textContent =
            "🌅 起床：" + (wake ? clockOnly(wake) : "未記録") +
            "　／　🌙 就寝：" + (sleep ? clockOnly(sleep) : "未記録");
    }

    $("g7WakeBtn")?.addEventListener("click", function () { recordLife("wake"); });
    $("g7SleepBtn")?.addEventListener("click", function () { recordLife("sleep"); });


    /* ---------------------------------------------------------
       200字作文のモーダル
       --------------------------------------------------------- */

    var essayCallback = null;

    function updateEssayCount() {

        var n = countChars($("g7EssayText").value);
        var ok = n >= MIN_CHARS;

        $("g7EssayCount").textContent = n + " / " + MIN_CHARS + "字" + (ok ? "　✓ 送信できます" : "　あと" + (MIN_CHARS - n) + "字");
        $("g7EssayCount").className = "g7-count " + (ok ? "ok" : "ng");
        $("g7EssaySubmit").disabled = !ok;
    }

    function openEssayModal(options) {

        $("g7EssayTitle").textContent = options.title;
        $("g7EssayHint").textContent = options.hint + "（" + MIN_CHARS + "字以上・空白と改行は数えません）";
        $("g7EssaySubmit").textContent = options.submitLabel;
        $("g7EssayText").value = "";
        essayCallback = options.onSubmit;

        updateEssayCount();

        $("g7EssayOverlay").style.display = "flex";
        $("g7EssayText").focus();
    }

    function closeEssayModal() {
        $("g7EssayOverlay").style.display = "none";
        essayCallback = null;
    }

    $("g7EssayText")?.addEventListener("input", updateEssayCount);
    $("g7EssayCancel")?.addEventListener("click", closeEssayModal);

    $("g7EssaySubmit")?.addEventListener("click", function () {

        var text = $("g7EssayText").value;

        if (countChars(text) < MIN_CHARS || !essayCallback) {
            return;
        }

        var callback = essayCallback;
        closeEssayModal();
        callback(text);
    });


    /* ---------------------------------------------------------
       学習開始・終了（作文必須）
       --------------------------------------------------------- */

    var previousStart = window.startWeeklyPlanSlot;

    window.startWeeklyPlanSlot = function (weekKey, slotId) {

        var slot = findSlot(weekKey, slotId);

        if (!slot) { return; }

        var date = slotDate(weekKey, slot);

        if (date !== todayKey()) {
            alert("学習を開始できるのは、その日のコマだけです。");
            return;
        }

        var existing = recOf(weekKey, slotId);

        if (existing && existing.status === "in_progress") { return; }

        if (slotEnded(weekKey, slot)) {
            alert("このコマの時間は終わっています（棄権扱いです）。");
            return;
        }

        openEssayModal({
            title: "学習開始の作文：" + (slot.subject || "") + " " + slot.time,
            hint: "これから何を、どこまで、どんな方法でやるかを書いてください",
            submitLabel: "作文を提出して学習を開始する",
            onSubmit: function (text) {

                var elapsed = nowMinutes() - timeToMinutes(slot.time);
                var penalty = elapsed > OUT_AFTER_MIN ? "out" : (elapsed > LATE_AFTER_MIN ? "late" : "");

                var essayId = addEssay({
                    kind: "start", weekKey: weekKey, slotId: slotId, date: date,
                    subject: slot.subject || "", time: slot.time, text: text
                });

                previousStart(weekKey, slotId);

                recordWeeklyPlanStatus(weekKey, slotId, "in_progress", {
                    startEssayId: essayId, penalty: penalty, startedAtFull: nowText()
                });

                if (penalty === "out") {
                    alert("開始時刻から" + OUT_AFTER_MIN + "分を過ぎたため、「アウト」として記録されました。");
                } else if (penalty === "late") {
                    alert("開始時刻から" + LATE_AFTER_MIN + "分を過ぎたため、「遅刻」として記録されました。");
                }

                window.renderWeeklyPlan();
                renderSugoroku();
            }
        });
    };

    window.finishWeeklyPlanSlot = function (weekKey, slotId) {

        var slot = findSlot(weekKey, slotId);
        var rec = recOf(weekKey, slotId);

        if (!slot || !rec || rec.status !== "in_progress") { return; }

        openEssayModal({
            title: "学習終了の作文：" + (slot.subject || "") + " " + slot.time,
            hint: "やったこと・分かったこと・できなかったこと・次回の課題を書いてください",
            submitLabel: "作文を提出して学習を終了する",
            onSubmit: function (text) {

                var essayId = addEssay({
                    kind: "end", weekKey: weekKey, slotId: slotId, date: slotDate(weekKey, slot),
                    subject: slot.subject || "", time: slot.time, text: text
                });

                var flat = text.replace(/\s+/g, " ");

                recordWeeklyPlanStatus(weekKey, slotId, "done", {
                    endEssayId: essayId,
                    endedAt: clockOnly(nowText()),
                    actualContent: flat.slice(0, 60) + (flat.length > 60 ? "…" : "")
                });

                if (typeof growSubject === "function") { growSubject(slot.subject); }
                if (typeof playChime === "function") { playChime(); }

                renderStudyHeatmap();
                renderMapBoard();
                window.renderWeeklyPlan();
                renderSugoroku();
            }
        });
    };


    /* ---------------------------------------------------------
       週間時間割の表
       --------------------------------------------------------- */

    var editingSlotId = null;

    function cellHtml(weekKey, slot, date) {

        var status = statusOf(weekKey, slot);
        var rec = recOf(weekKey, slot.id) || {};
        var forfeit = isForfeit(weekKey, slot);

        var html = '<div class="g7-slot g7-' + (forfeit ? "forfeit" : status) + '"><b>' + esc(slot.subject) + '</b>';

        if (isOptional(slot)) { html += ' <span class="koma-tag">任意</span>'; }

        if (slot.task) { html += '<div class="g7-task">' + esc(slot.task) + '</div>'; }

        html += '<div><span class="koma-tag">' + STATUS[status] + '</span>';
        if (rec.penalty === "late") { html += ' <span class="koma-tag kind-exam">遅刻</span>'; }
        if (rec.penalty === "out") { html += ' <span class="koma-tag kind-exam">アウト</span>'; }
        if (forfeit) { html += ' <span class="koma-tag kind-exam">棄権</span>'; }
        html += '</div><div class="g7-btns">';

        if (date === todayKey() && status === "planned" && !slotEnded(weekKey, slot)) {
            html += '<button data-act="start" data-id="' + slot.id + '" class="primary">開始</button>';
        }

        if (status === "in_progress") {
            html += '<button data-act="finish" data-id="' + slot.id + '" class="primary">終了</button>';
        }

        html += '<button data-act="edit" data-id="' + slot.id + '" class="ghost">編集</button></div></div>';

        return html;
    }

    function renderG7Table() {

        var box = $("g7PlanTable");

        if (!box) { return; }

        var weekKey = weeklyPlanViewWeek;
        var week = getOrCreateWeeklyPlanWeek(weekKey);

        var times = [];

        week.slots.forEach(function (slot) {
            if (times.indexOf(slot.time) === -1) { times.push(slot.time); }
        });

        times.sort();

        var html = '<table class="g7-table"><thead><tr><th>時刻</th>';

        for (var d = 0; d < 7; d++) {
            var dateKey = addDaysToKey(weekKey, d);
            var hol = patgsIsHolidayDate(dateKey);
            html += '<th class="' + (hol ? "g7-hol" : "") + '">' + DAYS[d] + "<br>" + formatShortDate(dateKey).replace(/\(.*\)/, "") + (hol ? "（休）" : "") + "</th>";
        }

        html += "</tr></thead><tbody>";

        if (times.length === 0) {
            html += '<tr><td colspan="8" class="empty-note">この週の時間割はまだありません。「＋予定を追加」かテンプレートから作れます。</td></tr>';
        }

        times.forEach(function (time) {

            html += '<tr><td class="g7-time">' + time + "</td>";

            for (var day = 0; day < 7; day++) {

                var date = addDaysToKey(weekKey, day);
                var slots = week.slots.filter(function (s) { return s.dayOfWeek === day && s.time === time; });

                html += "<td>";

                if (slots.length === 0) {
                    html += '<button class="ghost g7-add" data-act="add" data-dow="' + day + '" data-time="' + time + '">＋</button>';
                } else {
                    slots.forEach(function (slot) { html += cellHtml(weekKey, slot, date); });
                }

                html += "</td>";
            }

            html += "</tr>";
        });

        html += "</tbody></table>";

        box.innerHTML = html;
    }

    function openEditor(slot, presetDay, presetTime) {

        editingSlotId = slot ? slot.id : null;

        $("g7EdTitle").textContent = slot ? "予定の編集" : "予定の追加";
        $("g7EdDay").value = String(slot ? slot.dayOfWeek : (presetDay || 0));
        $("g7EdTime").value = slot ? slot.time : (presetTime || "");
        $("g7EdSubject").value = slot ? (slot.subject || "") : "";
        $("g7EdTask").value = slot ? (slot.task || "") : "";
        $("g7EdOptional").checked = slot ? isOptional(slot) : false;
        $("g7EdDelete").style.display = slot ? "inline-block" : "none";
        $("g7EdStatus").textContent = "";
        $("g7PlanEditor").style.display = "block";
        $("g7PlanEditor").scrollIntoView({ behavior: "smooth", block: "center" });
    }

    function saveEditor() {

        var weekKey = weeklyPlanViewWeek;
        var week = getOrCreateWeeklyPlanWeek(weekKey);

        var day = parseInt($("g7EdDay").value, 10);
        var time = $("g7EdTime").value;
        var subject = $("g7EdSubject").value.trim();
        var task = $("g7EdTask").value.trim();
        var optional = $("g7EdOptional").checked;

        if (!time || !subject) {
            $("g7EdStatus").textContent = "時刻と教科は必須です。";
            $("g7EdStatus").className = "form-status error";
            return;
        }

        var duplicate = week.slots.some(function (s) {
            return s.dayOfWeek === day && s.time === time && s.id !== editingSlotId;
        });

        if (duplicate) {
            $("g7EdStatus").textContent = "同じ曜日・時刻にすでに予定があります。";
            $("g7EdStatus").className = "form-status error";
            return;
        }

        if (editingSlotId) {

            var slot = findSlot(weekKey, editingSlotId);

            if (!slot) { return; }

            var status = statusOf(weekKey, slot);

            if (status !== "planned" && status !== "empty") {
                $("g7EdStatus").textContent = "学習の記録があるコマは変更できません（記録を守るため）。";
                $("g7EdStatus").className = "form-status error";
                return;
            }

            slot.dayOfWeek = day; slot.time = time; slot.subject = subject; slot.task = task; slot.optional = optional;
            logPlanChange(weekKey, "変更：" + DAYS[day] + " " + time + " " + subject);

        } else {

            week.slots.push({
                id: makeWeeklyPlanSlotId(), dayOfWeek: day, time: time, subject: subject,
                task: task, isEmpty: false, emptyReason: "", optional: optional
            });

            logPlanChange(weekKey, "追加：" + DAYS[day] + " " + time + " " + subject);
        }

        week.updatedAt = nowText();
        saveWeeklyPlanTimetables();

        $("g7PlanEditor").style.display = "none";
        window.renderWeeklyPlan();
    }

    function deleteEditorSlot() {

        var weekKey = weeklyPlanViewWeek;
        var slot = findSlot(weekKey, editingSlotId);

        if (!slot) { return; }

        if (statusOf(weekKey, slot) !== "planned" && statusOf(weekKey, slot) !== "empty") {
            $("g7EdStatus").textContent = "学習の記録があるコマは削除できません。";
            $("g7EdStatus").className = "form-status error";
            return;
        }

        if (!confirm("このコマを削除しますか？")) { return; }

        deleteWeeklyPlanSlot(weekKey, slot.id);
        logPlanChange(weekKey, "削除：" + DAYS[slot.dayOfWeek] + " " + slot.time + " " + (slot.subject || ""));

        $("g7PlanEditor").style.display = "none";
        window.renderWeeklyPlan();
    }

    function applyTemplate() {

        var weekKey = weeklyPlanViewWeek;
        var week = getOrCreateWeeklyPlanWeek(weekKey);
        var tpl = TEMPLATES[$("g7TplPattern").value];
        var day = parseInt($("g7TplDay").value, 10);
        var times = tpl.times.map(function (t) { return { time: t, optional: false }; });

        if ($("g7TplMorning").checked) {
            MORNING_TIMES.forEach(function (t) { times.unshift({ time: t, optional: true }); });
        }

        var added = 0;

        times.forEach(function (item) {

            var exists = week.slots.some(function (s) { return s.dayOfWeek === day && s.time === item.time; });

            if (exists) { return; }

            week.slots.push({
                id: makeWeeklyPlanSlotId(), dayOfWeek: day, time: item.time, subject: "未設定",
                task: "", isEmpty: false, emptyReason: "", optional: item.optional
            });

            added += 1;
        });

        week.updatedAt = nowText();
        saveWeeklyPlanTimetables();
        logPlanChange(weekKey, "テンプレート反映：" + DAYS[day] + "曜 " + tpl.label + "（" + added + "コマ）");

        $("g7TplStatus").textContent = added + "コマ追加しました。教科は表の「編集」から入力してください。";
        window.renderWeeklyPlan();
    }

    function updateTemplateFlow() {
        var tpl = TEMPLATES[$("g7TplPattern").value];
        $("g7TplFlow").textContent = "一日の流れ：" + tpl.flow;
    }

    $("g7PlanTable")?.addEventListener("click", function (event) {

        var button = event.target.closest("button[data-act]");

        if (!button) { return; }

        var act = button.dataset.act;
        var weekKey = weeklyPlanViewWeek;

        if (act === "start") { window.startWeeklyPlanSlot(weekKey, button.dataset.id); }
        if (act === "finish") { window.finishWeeklyPlanSlot(weekKey, button.dataset.id); }
        if (act === "edit") { openEditor(findSlot(weekKey, button.dataset.id)); }
        if (act === "add") { openEditor(null, parseInt(button.dataset.dow, 10), button.dataset.time); }
    });

    $("g7AddSlotBtn")?.addEventListener("click", function () { openEditor(null, new Date().getDay(), ""); });
    $("g7EdSave")?.addEventListener("click", saveEditor);
    $("g7EdDelete")?.addEventListener("click", deleteEditorSlot);
    $("g7EdClose")?.addEventListener("click", function () { $("g7PlanEditor").style.display = "none"; });
    $("g7TplApply")?.addEventListener("click", applyTemplate);
    $("g7TplPattern")?.addEventListener("change", updateTemplateFlow);

    var previousRenderWeeklyPlan = window.renderWeeklyPlan;

    window.renderWeeklyPlan = function () {
        previousRenderWeeklyPlan();
        renderG7Table();
    };


    /* ---------------------------------------------------------
       すごろく
       --------------------------------------------------------- */

    function sugoState() {
        return loadJSON(K.sugo, { stage: 1, pos: 0, totalRolled: 0, log: [] });
    }

    function stageSize(stage) {
        return Math.min(50, 20 + 5 * (stage - 1));
    }

    /* 作文（開始・終了の両方）を書いて完了した授業の数 */
    function earnedDice() {

        var count = 0;

        Object.keys(weeklyPlanRecords).forEach(function (weekKey) {
            var store = weeklyPlanRecords[weekKey] || {};
            Object.keys(store).forEach(function (id) {
                var r = store[id];
                if (r && r.status === "done" && r.startEssayId && r.endEssayId) { count += 1; }
            });
        });

        return count;
    }

    function availableDice() {
        return Math.max(0, earnedDice() - (sugoState().totalRolled || 0));
    }

    function renderSugoroku() {

        var board = $("g7SugoBoard");

        if (!board) { return; }

        var state = sugoState();
        var size = stageSize(state.stage);
        var available = availableDice();

        $("g7SugoStatus").textContent =
            "ステージ " + state.stage + "（ゴールまで " + (size - state.pos) + "マス）／ 振れる回数：" + available + "回" +
            "（獲得 " + earnedDice() + "回・使用 " + (state.totalRolled || 0) + "回）";

        board.innerHTML = "";

        for (var i = 0; i <= size; i++) {

            var square = document.createElement("div");
            square.className = "map-square" + (i < state.pos ? " passed" : "");

            if (i === size) {
                square.classList.add("is-goal");
                square.textContent = "🏁";
            } else if (i === state.pos) {
                square.classList.add("is-today");
                square.textContent = "🚩";
            } else if (i === 0) {
                square.textContent = "S";
            }

            board.appendChild(square);
        }

        $("g7RollBtn").disabled = available <= 0;

        var log = $("g7SugoLog");
        log.innerHTML = "";

        var entries = (state.log || []).slice().reverse().slice(0, 20);

        if (entries.length === 0) {
            log.innerHTML = '<p class="empty-note">まだサイコロを振っていません。</p>';
        }

        entries.forEach(function (entry) {
            var p = document.createElement("p");
            p.className = "sub";
            p.textContent = entry.at + "：🎲 " + entry.dice + "（ステージ" + entry.stage + "・" + entry.text + "）";
            log.appendChild(p);
        });
    }

    var rolling = false;

    $("g7RollBtn")?.addEventListener("click", function () {

        if (rolling || availableDice() <= 0) { return; }

        rolling = true;

        var faces = ["⚀", "⚁", "⚂", "⚃", "⚄", "⚅"];
        var frames = 0;

        var timer = setInterval(function () {

            $("g7DiceFace").textContent = faces[Math.floor(Math.random() * 6)];
            frames += 1;

            if (frames < 10) { return; }

            clearInterval(timer);

            var dice = 1 + Math.floor(Math.random() * 6);
            $("g7DiceFace").textContent = faces[dice - 1] + " " + dice;

            var state = sugoState();
            var size = stageSize(state.stage);
            var stageBefore = state.stage;
            var text;

            state.totalRolled = (state.totalRolled || 0) + 1;
            state.pos += dice;

            if (state.pos >= size) {
                state.stage += 1;
                state.pos = 0;
                text = "ゴール！";
                $("g7SugoMsg").textContent = "🏁 ゴール！ステージ " + state.stage + " へ進みます。";
            } else {
                text = state.pos + "マス目";
                $("g7SugoMsg").textContent = dice + " 進みました。ゴールまであと " + (size - state.pos) + " マス。";
            }

            state.log = (state.log || []).concat([{ at: nowText(), dice: dice, stage: stageBefore, text: text }]).slice(-100);

            saveJSON(K.sugo, state);

            if (typeof playChime === "function") { playChime(); }

            rolling = false;
            renderSugoroku();

        }, 70);
    });


    /* ---------------------------------------------------------
       作文一覧
       --------------------------------------------------------- */

    function renderEssayList() {

        var box = $("g7EssayList");

        if (!box) { return; }

        var filter = $("g7EssayFilter").value;
        var html = "";

        if (filter !== "review") {

            var list = loadJSON(K.essays, []).filter(function (e) {
                return filter === "all" || e.kind === filter;
            }).reverse().slice(0, 300);

            list.forEach(function (e) {
                html += '<details class="koma"><summary><b>' + esc(e.date) + " " + esc(e.time) + " " + esc(e.subject) + "</b>　" +
                    '<span class="koma-tag">' + (e.kind === "start" ? "開始" : "終了") + "</span> " + e.length + "字</summary>" +
                    '<div class="g7-essay-body">' + esc(e.text) + '</div><p class="sub">提出：' + esc(e.at) + "</p></details>";
            });

            if (list.length === 0) {
                html += '<p class="empty-note">この種類の作文はまだありません。</p>';
            }
        }

        if (filter === "all" || filter === "review") {

            Object.keys(weeklyPlanReviews).sort().reverse().forEach(function (weekKey) {

                var r = weeklyPlanReviews[weekKey];

                if (!r || !r.summaryText) { return; }

                html += '<details class="koma"><summary><b>' + esc(weeklyPlanWeekLabel(weekKey)) + "</b>　" +
                    '<span class="koma-tag">週次レビュー</span> ' + countChars(r.summaryText) + "字</summary>" +
                    '<div class="g7-essay-body">' + esc(r.summaryText) + "</div></details>";
            });
        }

        box.innerHTML = html;
    }

    $("g7EssayFilter")?.addEventListener("change", renderEssayList);


    /* ---------------------------------------------------------
       週次レビュー
       --------------------------------------------------------- */

    var reviewWeek = getWeekStartKey(todayKey());

    function isReviewWindow() {
        var now = new Date();
        return now.getDay() === 6 && now.getHours() >= 8 && now.getHours() < 10;
    }

    function collectWeek(weekKey) {

        var week = weeklyPlanTimetables[weekKey] || { slots: [] };
        var result = { done: [], forfeit: 0, late: 0, out: 0, notStarted: 0, changed: 0, slots: week.slots };

        week.slots.slice().sort(function (a, b) {
            return a.dayOfWeek - b.dayOfWeek || (a.time || "").localeCompare(b.time || "");
        }).forEach(function (slot) {

            var status = statusOf(weekKey, slot);
            var rec = recOf(weekKey, slot.id) || {};

            if (status === "done") { result.done.push({ slot: slot, rec: rec }); }
            if (status === "not_started") { result.notStarted += 1; }
            if (status === "plan_changed") { result.changed += 1; }
            if (isForfeit(weekKey, slot)) { result.forfeit += 1; }
            if (rec.penalty === "late") { result.late += 1; }
            if (rec.penalty === "out") { result.out += 1; }
        });

        return result;
    }

    function weekEssays(weekKey) {
        return loadJSON(K.essays, []).filter(function (e) { return e.weekKey === weekKey; });
    }

    function weekSummaryText(weekKey) {

        var data = collectWeek(weekKey);
        var life = loadJSON(K.life, {});
        var lines = [];

        lines.push("完了" + data.done.length + "コマ／棄権" + data.forfeit + "／遅刻" + data.late + "／アウト" + data.out +
            "／未着手" + data.notStarted + "／予定変更" + data.changed);

        for (var i = 0; i < 7; i++) {
            var date = addDaysToKey(weekKey, i);
            var l = life[date] || {};
            lines.push(formatShortDate(date) + " 起床 " + (l.wake ? clockOnly(l.wake) : "-") + " 就寝 " + (l.sleep ? clockOnly(l.sleep) : "-"));
        }

        data.done.forEach(function (d) {
            lines.push(DAYS[d.slot.dayOfWeek] + " " + d.slot.time + " " + d.slot.subject + "：" + (d.rec.actualContent || ""));
        });

        return lines.join("\n");
    }

    function renderG7Review() {

        var body = $("g7RvBody");

        if (!body) { return; }

        var weekKey = reviewWeek;
        var data = collectWeek(weekKey);
        var life = loadJSON(K.life, {});
        var essays = weekEssays(weekKey);

        $("g7RvWeek").textContent = weeklyPlanWeekLabel(weekKey);

        $("g7RvWindow").textContent =
            "週次レビューの実施時間：土曜 8:00〜10:00（" + (isReviewWindow() ? "今は実施時間内です" : "今は実施時間外です") + "）";

        $("g7RvStats").innerHTML =
            [["完了", data.done.length], ["棄権", data.forfeit], ["遅刻", data.late], ["アウト", data.out],
                ["未着手", data.notStarted], ["予定変更", data.changed]].map(function (p) {
                return '<div class="stat"><span class="stat-num">' + p[1] + '</span><span class="stat-label">' + p[0] + "</span></div>";
            }).join("");

        var html = "<h3>🌅🌙 おはよう／おやすみ</h3>";

        for (var i = 0; i < 7; i++) {
            var date = addDaysToKey(weekKey, i);
            var l = life[date] || {};
            html += '<p class="sub">' + esc(formatShortDate(date)) + "　起床 " + (l.wake ? esc(l.wake) : "未記録") +
                "　／　就寝 " + (l.sleep ? esc(l.sleep) : "未記録") + "</p>";
        }

        html += "<h3>📚 学習記録</h3>";

        if (data.done.length === 0) {
            html += '<p class="empty-note">完了した学習はまだありません。</p>';
        }

        data.done.forEach(function (d) {
            html += '<p class="sub">' + DAYS[d.slot.dayOfWeek] + "曜 " + esc(d.slot.time) + " " + esc(d.slot.subject) +
                "　" + esc(d.rec.startedAt || "") + "〜" + esc(d.rec.endedAt || "") +
                (d.rec.penalty === "late" ? "　【遅刻】" : "") + (d.rec.penalty === "out" ? "　【アウト】" : "") +
                (d.rec.actualContent ? "<br>" + esc(d.rec.actualContent) : "") + "</p>";
        });

        var startCount = essays.filter(function (e) { return e.kind === "start"; }).length;
        var endCount = essays.filter(function (e) { return e.kind === "end"; }).length;

        html += "<h3>✍️ 作文</h3><p class=\"sub\">開始の作文 " + startCount + "本／終了の作文 " + endCount +
            "本（全文は「作文一覧」で確認できます）</p>";

        var changes = loadJSON(K.planlog, []).filter(function (c) { return c.week === weekKey; });

        html += "<h3>🗓 時間割の変更</h3>";

        if (changes.length === 0) {
            html += '<p class="empty-note">今週の時間割の変更はありません。</p>';
        }

        changes.forEach(function (c) {
            html += '<p class="sub">' + esc(c.at) + "　" + esc(c.text) + "</p>";
        });

        body.innerHTML = html;

        /* AI */

        var cache = loadJSON(K.ai, {})[weekKey];

        $("g7AiEssay").textContent = cache ? cache.essaySummary : "まだ作成されていません。";
        $("g7AiOverall").textContent = cache ? cache.overall : "まだ作成されていません。";
        $("g7AiStatus").textContent = cache ? "作成：" + cache.at : "";

        /* 振り返り作文 */

        var review = weeklyPlanReviews[weekKey] || {};

        if (document.activeElement !== $("g7RvEssay")) {
            $("g7RvEssay").value = review.summaryText || "";
        }

        updateReviewCount();

        if (!cache && (essays.length > 0 || data.done.length > 0) && !renderG7Review.autoTried[weekKey]) {
            renderG7Review.autoTried[weekKey] = true;
            generateAi(weekKey);
        }
    }

    renderG7Review.autoTried = {};

    function updateReviewCount() {

        var n = countChars($("g7RvEssay").value);
        var ok = n >= MIN_CHARS;

        $("g7RvCount").textContent = n + " / " + MIN_CHARS + "字" + (ok ? "　✓ 保存できます" : "　あと" + (MIN_CHARS - n) + "字");
        $("g7RvCount").className = "g7-count " + (ok ? "ok" : "ng");
        $("g7RvSave").disabled = !ok;
    }

    async function askAi(message) {

        var response = await fetch(AICHAT_API_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ message: message, messages: [], knowledge: [] })
        });

        if (!response.ok) { throw new Error("HTTP " + response.status); }

        var data = await response.json();

        return (data && typeof data.reply === "string" && data.reply.trim()) ? data.reply.trim() : "";
    }

    var aiBusy = false;

    async function generateAi(weekKey) {

        if (aiBusy) { return; }

        aiBusy = true;
        $("g7AiStatus").textContent = "AIが作成中…";
        $("g7AiBtn").disabled = true;

        try {

            var essays = weekEssays(weekKey);
            var essaySummary = "今週の作文はありません。";

            if (essays.length > 0) {

                var joined = essays.map(function (e) {
                    return "【" + e.date + " " + e.subject + " " + (e.kind === "start" ? "開始" : "終了") + "】" + e.text.replace(/\s+/g, " ").slice(0, 400);
                }).join("\n").slice(0, 6000);

                essaySummary = await askAi(
                    "次は、中学生が今週の学習の開始時と終了時に書いた作文です。内容の要点を、日本語で300字以内に要約してください。\n\n" + joined
                ) || "要約を作れませんでした。";
            }

            var review = (weeklyPlanReviews[weekKey] || {}).summaryText || "（まだ書かれていません）";

            var overall = await askAi(
                "あなたは中学3年生の受験勉強を支える学習コーチです。次の今週の記録をもとに、" +
                "【今週の総まとめ】（200字程度）と、【翌週への改善提案】（具体的に3つ）を、日本語でやさしく書いてください。" +
                "責める言い方は避けてください。\n\n" +
                "■記録\n" + weekSummaryText(weekKey) +
                "\n\n■作文の要約\n" + essaySummary +
                "\n\n■本人の振り返り作文\n" + review.slice(0, 1500)
            ) || "総まとめを作れませんでした。";

            var all = loadJSON(K.ai, {});
            all[weekKey] = { essaySummary: essaySummary, overall: overall, at: nowText() };
            saveJSON(K.ai, all);

        } catch (error) {

            console.error("AI要約の作成に失敗しました:", error);
            $("g7AiStatus").textContent = "AIに接続できませんでした。あとで「AIで作る／作り直す」を押してください。";

        } finally {

            aiBusy = false;
            $("g7AiBtn").disabled = false;
            renderG7Review();
        }
    }

    $("g7AiBtn")?.addEventListener("click", function () { generateAi(reviewWeek); });
    $("g7RvEssay")?.addEventListener("input", updateReviewCount);

    $("g7RvPrev")?.addEventListener("click", function () {
        reviewWeek = addDaysToKey(reviewWeek, -7);
        renderG7Review();
    });

    $("g7RvNext")?.addEventListener("click", function () {
        reviewWeek = addDaysToKey(reviewWeek, 7);
        renderG7Review();
    });

    $("g7RvSave")?.addEventListener("click", function () {

        var text = $("g7RvEssay").value;

        if (countChars(text) < MIN_CHARS) { return; }

        saveWeeklyPlanReviewEntry(reviewWeek, {
            completed: true,
            completedAt: nowText(),
            summaryText: text,
            essayLength: countChars(text),
            inWindow: isReviewWindow()
        });

        $("g7RvSaveStatus").textContent = "✓ 保存しました" + (isReviewWindow() ? "" : "（実施時間外）");

        if (typeof playChime === "function") { playChime(); }

        renderG7Review();
    });

    $("g7RvNotDone")?.addEventListener("click", function () {

        var reason = prompt("週次レビューを実施できなかった理由", "") || "";
        var reschedule = prompt("再実施の予定（いつ行うか）", "") || "";

        saveWeeklyPlanReviewEntry(reviewWeek, { completed: false, notDoneReason: reason, rescheduledAt: reschedule });

        $("g7RvSaveStatus").textContent = "✓ 記録しました";
    });

    var previousRenderReviewScreen = window.renderWeeklyPlanReviewScreen;

    window.renderWeeklyPlanReviewScreen = function () {
        previousRenderReviewScreen();
        reviewWeek = getWeekStartKey(todayKey());
        renderG7Review();
    };


    /* ---------------------------------------------------------
       ホームのカード・画面名・最初の描画
       --------------------------------------------------------- */

    SCREEN_TITLES.sugoroku = "🎲 すごろく";
    SCREEN_TITLES.essays = "✍️ 作文一覧";

    HOME_CARDS.splice(1, 0,
        { screen: "sugoroku", icon: "🎲", label: "すごろく" },
        { screen: "essays", icon: "✍️", label: "作文一覧" }
    );

    renderHomeCards();

    var previousShowScreen = window.showScreen;

    window.showScreen = function (name) {

        previousShowScreen(name);

        if (name === "sugoroku") { renderSugoroku(); }
        if (name === "essays") { renderEssayList(); }
        if (name === "weeklyplan") { renderG7Table(); }
    };

    /* 既存の「戻る」「ホームカード」などは showScreen を名前で呼ぶので、そのまま新しい版が使われる */

    updateTemplateFlow();
    renderLifeStatus();
    renderG7Table();
    renderSugoroku();
    showScreen("home");

    setInterval(renderLifeStatus, 60 * 1000);

    console.log("PATGS27 第七次改革・追加機能（patgs27-gen7b.js）を適用しました。");

})();
