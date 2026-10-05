"use strict";

/* =========================================================
   PATGS27  patgs27-gen7.js  （第七次改革）
   =========================================================
   js/script.js の「後」に読み込まれ、旧予約制度をメインから外して
   週間時間割を中心にするためのファイル。

   ・script.js は一切書き換えない（保存データの形式も変えない）
   ・ホームを「今日の時間割・次の学習」中心に変更
   ・旧コマ予約は「legacy」画面（過去の記録）へ移動
   ・毎時の通知を週間時間割ベースに変更
   ・予約不足の段階的介入（バナー・強制介入・重大事象）は使わない
   ・週間時間割で完了した学習も、成長・ヒートマップ・受験マップに反映
   ・週間時間割の「学習開始」で、平日35分／休日50分のタイマーが動く
   ========================================================= */

(function () {

    if (
        typeof showScreen !== "function" ||
        typeof weeklyPlanTimetables === "undefined" ||
        typeof getOrCreateWeeklyPlanWeek !== "function"
    ) {
        console.error("patgs27-gen7.js: script.js が先に読み込まれていないため、第七次改革の設定を適用できません。");
        return;
    }

    /* ---------------------------------------------------------
       共通：今日の時間割
       --------------------------------------------------------- */

    var STATUS_TEXT = {
        planned: "未記録",
        in_progress: "学習中",
        done: "完了",
        not_started: "未着手",
        plan_changed: "予定変更",
        empty: "空きコマ"
    };

    function slotStatusOf(weekKey, slot) {

        if (slot.isEmpty) {
            return "empty";
        }

        var store = weeklyPlanRecords[weekKey] || {};
        var record = store[slot.id];

        return record ? record.status : "planned";
    }

    function getTodayPlan() {

        var today = todayKey();
        var weekKey = getWeekStartKey(today);
        var week = getOrCreateWeeklyPlanWeek(weekKey);
        var dow = new Date(today + "T00:00:00").getDay();

        var slots = week.slots
            .filter(function (slot) { return slot.dayOfWeek === dow; })
            .sort(function (a, b) { return (a.time || "").localeCompare(b.time || ""); });

        return { today: today, weekKey: weekKey, slots: slots };
    }

    function slotEndText(slot, dateKey) {
        var minutes = weeklyPlanDurations(dateKey).study;
        return slot.time + "〜" + minutesToTime(timeToMinutes(slot.time) + minutes);
    }

    function buildSlotButtons(weekKey, slot, status, container) {

        if (status === "planned" || status === "not_started" || status === "plan_changed") {

            if (status === "planned") {
                var startButton = makeButton("学習開始", "primary");
                startButton.addEventListener("click", function () {
                    startWeeklyPlanSlot(weekKey, slot.id);
                });
                container.appendChild(startButton);
            }
        }

        if (status === "in_progress") {
            var finishButton = makeButton("終了して記録", "primary");
            finishButton.addEventListener("click", function () {
                finishWeeklyPlanSlot(weekKey, slot.id);
            });
            container.appendChild(finishButton);
        }
    }


    /* ---------------------------------------------------------
       ホーム：今日の時間割・次の学習・生活リズム
       --------------------------------------------------------- */

    function renderHomePlan() {

        var list = $("todayPlanList");
        var nextBox = $("homeNextPlan");

        if (!list || !nextBox) {
            return;
        }

        var plan = getTodayPlan();

        list.innerHTML = "";

        if (plan.slots.length === 0) {

            var empty = document.createElement("p");
            empty.className = "empty-note";
            empty.textContent = "今日の時間割はまだありません。「週間時間割」から追加できます。";
            list.appendChild(empty);

        } else {

            plan.slots.forEach(function (slot) {

                var status = slotStatusOf(plan.weekKey, slot);
                var record = (weeklyPlanRecords[plan.weekKey] || {})[slot.id] || {};

                var row = document.createElement("div");
                row.className = "koma" +
                    (status === "done" ? " done" : "") +
                    (status === "empty" || status === "not_started" ? " missed" : "") +
                    (status === "in_progress" ? " running" : "");

                var head = document.createElement("div");
                head.className = "koma-head";

                var time = document.createElement("span");
                time.className = "koma-time";
                time.textContent = slotEndText(slot, plan.today);

                var subject = document.createElement("span");
                subject.className = "koma-subject";
                subject.textContent = slot.subject || "（教科未設定）";

                var tag = document.createElement("span");
                tag.className = "koma-tag";
                tag.textContent = STATUS_TEXT[status] || "未記録";

                head.append(time, subject, tag);
                row.appendChild(head);

                var detailParts = [];

                if (slot.task) {
                    detailParts.push("課題：" + slot.task);
                }

                if (status === "done" && record.actualContent) {
                    detailParts.push("実施内容：" + record.actualContent);
                }

                if (status === "empty" && slot.emptyReason) {
                    detailParts.push("理由：" + slot.emptyReason);
                }

                if ((status === "not_started" || status === "plan_changed") && record.reasonCategory) {
                    detailParts.push("理由：" + record.reasonCategory +
                        (record.reasonDetail ? "・" + record.reasonDetail : ""));
                }

                if (detailParts.length > 0) {
                    var detail = document.createElement("p");
                    detail.className = "koma-detail";
                    detail.textContent = detailParts.join("　");
                    row.appendChild(detail);
                }

                var actions = document.createElement("div");
                actions.className = "koma-actions";
                buildSlotButtons(plan.weekKey, slot, status, actions);

                if (actions.childNodes.length > 0) {
                    row.appendChild(actions);
                }

                list.appendChild(row);
            });
        }

        /* 次の学習 */

        var now = new Date();
        var nowMinutes = now.getHours() * 60 + now.getMinutes();
        var studyMinutes = weeklyPlanDurations(plan.today).study;

        var next = plan.slots.find(function (slot) {
            return slotStatusOf(plan.weekKey, slot) === "in_progress";
        }) || plan.slots.find(function (slot) {
            return (
                slotStatusOf(plan.weekKey, slot) === "planned" &&
                timeToMinutes(slot.time) + studyMinutes >= nowMinutes
            );
        });

        nextBox.innerHTML = "";

        if (!next) {
            nextBox.className = "next-koma is-empty";
            nextBox.textContent = "次の学習はありません。週間時間割から追加できます。";
        } else {

            var nextStatus = slotStatusOf(plan.weekKey, next);

            nextBox.className = "next-koma";

            var nextHead = document.createElement("div");

            var nextTime = document.createElement("span");
            nextTime.className = "next-time";
            nextTime.textContent = next.time;

            var nextSubject = document.createElement("span");
            nextSubject.className = "next-subject";
            nextSubject.textContent = next.subject || "（教科未設定）";

            var nextInfo = document.createElement("span");
            nextInfo.className = "next-detail";
            nextInfo.textContent =
                "　" + slotEndText(next, plan.today) +
                (nextStatus === "in_progress" ? "　学習中" : "");

            nextHead.append(nextTime, nextSubject, nextInfo);

            var nextDetail = document.createElement("p");
            nextDetail.className = "next-detail";
            nextDetail.textContent = next.task ? "課題：" + next.task : "課題は未設定です。";

            var nextActions = document.createElement("div");
            nextActions.className = "koma-actions";
            buildSlotButtons(plan.weekKey, next, nextStatus, nextActions);

            nextBox.append(nextHead, nextDetail, nextActions);
        }

        /* 生活リズム */

        var life = loadJSON(lifeKey(), { wake: "", bath: "", sleep: "" });

        if ($("homeLifeSummary")) {
            $("homeLifeSummary").textContent =
                "🕐 起床 " + (life.wake || "未記録") +
                "／入浴 " + (life.bath || "未記録") +
                "／就寝 " + (life.sleep || "未記録");
        }
    }

    window.renderHomePlan = renderHomePlan;


    /* ---------------------------------------------------------
       週間時間割の関数にフックをかける
       --------------------------------------------------------- */

    /* 描画のたびにホームも更新する */
    var originalRenderWeeklyPlan = window.renderWeeklyPlan;

    window.renderWeeklyPlan = function () {
        originalRenderWeeklyPlan();
        renderHomePlan();
    };

    /* 「学習開始」で、平日35分／休日50分のタイマーも動かす */
    var originalStartWeeklyPlanSlot = window.startWeeklyPlanSlot;

    window.startWeeklyPlanSlot = function (weekStartKey, slotId) {

        originalStartWeeklyPlanSlot(weekStartKey, slotId);

        var week = weeklyPlanTimetables[weekStartKey];
        var slot = week && week.slots.find(function (s) { return s.id === slotId; });

        if (!slot || typeof startTimer !== "function") {
            return;
        }

        var dateKey = addDaysToKey(weekStartKey, slot.dayOfWeek);
        var minutes = weeklyPlanDurations(dateKey).study;

        startTimer(
            minutes,
            formatShortDate(dateKey) + " " + slot.time + " " + (slot.subject || ""),
            null
        );
    };

    /* 完了したら、成長・ヒートマップ・受験マップに反映する */
    var originalFinishWeeklyPlanSlot = window.finishWeeklyPlanSlot;

    window.finishWeeklyPlanSlot = function (weekStartKey, slotId) {

        var beforeRecord = (weeklyPlanRecords[weekStartKey] || {})[slotId];
        var before = beforeRecord ? beforeRecord.status : "";

        originalFinishWeeklyPlanSlot(weekStartKey, slotId);

        var afterRecord = (weeklyPlanRecords[weekStartKey] || {})[slotId];
        var after = afterRecord ? afterRecord.status : "";

        if (after === "done" && before !== "done") {

            var week = weeklyPlanTimetables[weekStartKey];
            var slot = week && week.slots.find(function (s) { return s.id === slotId; });

            if (slot && typeof growSubject === "function") {
                growSubject(slot.subject);
            }

            if (typeof playChime === "function") {
                playChime();
            }

            renderStudyHeatmap();
            renderMapBoard();
        }
    };

    /* 学習カレンダー・受験マップの集計に、週間時間割の完了も含める */
    var originalGetDoneKomaForDate = window.getDoneKomaForDate;

    window.getDoneKomaForDate = function (dateKey) {

        var total = originalGetDoneKomaForDate(dateKey);

        var weekKey = getWeekStartKey(dateKey);
        var week = weeklyPlanTimetables[weekKey];
        var store = weeklyPlanRecords[weekKey];

        if (!week || !store) {
            return total;
        }

        var dow = new Date(dateKey + "T00:00:00").getDay();

        week.slots.forEach(function (slot) {
            if (
                slot.dayOfWeek === dow &&
                store[slot.id] &&
                store[slot.id].status === "done"
            ) {
                total += 1;
            }
        });

        return total;
    };


    /* ---------------------------------------------------------
       通知：毎時の学習確認を、週間時間割ベースに
       --------------------------------------------------------- */

    window.checkHourlyNotifications = function () {

        if (!("Notification" in window) || Notification.permission !== "granted") {
            return;
        }

        var now = new Date();

        if (now.getMinutes() > 4) {
            return;
        }

        var hour = now.getHours();
        var fireKey = todayKey() + "-" + hour;

        if (localStorage.getItem("patgs27_last_hourly") === fireKey) {
            return;
        }

        if (now.getDay() === WEEKLY_REVIEW_REMINDER_DAY &&
            hour === WEEKLY_REVIEW_REMINDER_HOUR) {

            sendPatgsNotification(
                "📅 週次レビューの時間です",
                "今週の時間割・未着手・予定変更を振り返りましょう。"
            );

            localStorage.setItem("patgs27_last_hourly", fireKey);
            return;
        }

        if (hour < HOURLY_START_HOUR || hour > HOURLY_END_HOUR) {
            return;
        }

        var plan = getTodayPlan();
        var counts = { done: 0, planned: 0, notStarted: 0 };

        plan.slots.forEach(function (slot) {

            var status = slotStatusOf(plan.weekKey, slot);

            if (status === "done") { counts.done += 1; }
            if (status === "planned" || status === "in_progress") { counts.planned += 1; }
            if (status === "not_started") { counts.notStarted += 1; }
        });

        var nowMinutes = hour * 60 + now.getMinutes();

        var next = plan.slots.find(function (slot) {
            return (
                slotStatusOf(plan.weekKey, slot) === "planned" &&
                timeToMinutes(slot.time) >= nowMinutes
            );
        });

        sendPatgsNotification(
            "📚 学習していますか？",
            "今日：完了 " + counts.done + " ／ これから " + counts.planned +
            " ／ 未着手 " + counts.notStarted + "　" +
            (next
                ? "次は " + next.time + " " + (next.subject || "")
                : "今日の残りの時間割はありません。")
        );

        localStorage.setItem("patgs27_last_hourly", fireKey);
    };


    /* ---------------------------------------------------------
       予約不足の段階的介入：第七次改革では使わない（常に「通常」）
       --------------------------------------------------------- */

    window.evaluateInterventionState = function () {

        var today = todayKey();

        return {
            level: "normal",
            dayType: interventionDayTypeOf(today),
            date: today
        };
    };


    /* ---------------------------------------------------------
       画面の名前・ホームのカード・ボタン
       --------------------------------------------------------- */

    SCREEN_TITLES.home = "― 受験管理システム／第七次改革（週間時間割）―";
    SCREEN_TITLES.legacy = "📦 旧コマ予約（過去の記録）";

    HOME_CARDS.length = 0;

    [
        { screen: "weeklyplan", icon: "🗓", label: "週間時間割" },
        { screen: "study", icon: "📚", label: "学習" },
        { screen: "aichat", icon: "🤖", label: "AI相談" },
        { screen: "roadmap", icon: "🛤", label: "ロードマップ作成" },
        { screen: "growth", icon: "🌱", label: "成長" },
        { screen: "map", icon: "🗺️", label: "受験マップ" },
        { screen: "unresolved", icon: "❓", label: "未解決" },
        { screen: "achievements", icon: "🏆", label: "実績" },
        { screen: "schedule", icon: "📅", label: "予定" },
        { screen: "grades", icon: "📊", label: "成績" },
        { screen: "aiknowledge", icon: "🧠", label: "AI知識ベース" },
        { screen: "week", icon: "📈", label: "今週の記録" },
        { screen: "settings", icon: "⚙️", label: "設定・その他" }
    ].forEach(function (card) {
        HOME_CARDS.push(card);
    });

    renderHomeCards();
    renderFabMenu();

    /* クイックランチャーの先頭に「週間時間割」を追加 */
    var fabMenu = $("fabMenu");

    if (fabMenu) {

        var weeklyButton = makeButton("🗓 週間時間割", "ghost small");

        weeklyButton.addEventListener("click", function () {
            showScreen("weeklyplan");
        });

        fabMenu.insertBefore(weeklyButton, fabMenu.firstChild);
    }

    $("homeOpenWeeklyPlanBtn")?.addEventListener("click", function () {
        showScreen("weeklyplan");
    });

    $("legacyOpenBtn")?.addEventListener("click", function () {
        showScreen("legacy");
    });

    ["wakeStatus", "bathStatus", "sleepStatus"].forEach(function (id) {
        $(id)?.addEventListener("change", renderHomePlan);
    });

    showScreen("home");

    renderHomePlan();
    renderStudyHeatmap();
    renderMapBoard();

    if (typeof renderInterventionUI === "function") {
        renderInterventionUI();
    }

    setInterval(renderHomePlan, 60 * 1000);

    console.log("PATGS27 第七次改革（patgs27-gen7.js）を適用しました。");

})();
