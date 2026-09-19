"use strict";

/* =========================================================
   PATGS27  script.js  （第五次改革版）
   =========================================================
   【新設】
     ・コマ予約（日時／科目／教材／内容／範囲／目標）
     ・予約一覧（今日・今週・来週以降）
     ・コマ実行（次の予約・開始・完了）
     ・未実行処理（開始15分経過で自動記録＋4分類）
     ・振替（同じ週の別コマへ）／債務（週末に残った未達分）
     ・LS記録（30分を超えた学習）
     ・週間コマ管理（必要・予約・完了・未実行・債務）
     ・過去問2コマ（30分×2）の一括予約
     ・2時間前ルール（以降の変更は記録に残る）
   【廃止】
     ・「今日○コマ」だけの旧コマ管理
     ・未実行＝違反という単純判定
   【縮小】
     ・連続日数／自己ベスト（残すがトップの主役から外す）
   【維持】
     ・模試・過去問・内申・弱点・予定・提出物・教材・生活リズム
     ・誘惑報告・違反ログ・週次レビュー・質問メモ・リンク
     ・バックアップ・憲法・PATGS代理
   ========================================================= */


/* =========================================================
   バージョン
   ---------------------------------------------------------
   index.html の ?v=... と sw.js に合わせて書き換えること。
   ========================================================= */

const PATGS_VERSION = "20260919a";


/* =========================================================
   共通関数
   ========================================================= */

function $(id) {
    return document.getElementById(id);
}

function pad2(value) {
    return String(value).padStart(2, "0");
}

function dateKeyOf(dateObject) {
    return (
        dateObject.getFullYear() +
        "-" +
        pad2(dateObject.getMonth() + 1) +
        "-" +
        pad2(dateObject.getDate())
    );
}

function todayKey() {
    return dateKeyOf(new Date());
}

function nowText() {
    const d = new Date();

    return (
        d.getFullYear() + "/" +
        pad2(d.getMonth() + 1) + "/" +
        pad2(d.getDate()) + " " +
        pad2(d.getHours()) + ":" +
        pad2(d.getMinutes())
    );
}

function getDateKeyOffset(offsetDays) {
    const d = new Date();
    d.setDate(d.getDate() + offsetDays);
    return dateKeyOf(d);
}

function addDaysToKey(dateKey, days) {
    const d = new Date(dateKey + "T00:00:00");
    d.setDate(d.getDate() + days);
    return dateKeyOf(d);
}

/* 週は月曜はじまり */
function getWeekStartKey(dateKey) {
    const d = new Date(dateKey + "T00:00:00");
    const offset = (d.getDay() + 6) % 7;
    d.setDate(d.getDate() - offset);
    return dateKeyOf(d);
}

function formatShortDate(dateKey) {
    if (!dateKey) {
        return "未設定";
    }

    const parts = dateKey.split("-");

    if (parts.length !== 3) {
        return dateKey;
    }

    const week = ["日", "月", "火", "水", "木", "金", "土"];
    const d = new Date(dateKey + "T00:00:00");

    return (
        Number(parts[1]) + "/" + Number(parts[2]) +
        "(" + week[d.getDay()] + ")"
    );
}

function loadJSON(key, fallback) {
    try {
        const data = localStorage.getItem(key);

        if (data === null) {
            return fallback;
        }

        return JSON.parse(data);

    } catch (error) {
        console.error("保存データ読み込みエラー:", key, error);
        return fallback;
    }
}

function saveJSON(key, data) {
    try {
        localStorage.setItem(key, JSON.stringify(data));
    } catch (error) {
        console.error("保存エラー:", key, error);
    }
}

function showSave(id, text = "✓ 自動保存") {
    const element = $(id);

    if (!element) {
        return;
    }

    element.textContent = text;

    clearTimeout(element._saveTimer);

    element._saveTimer = setTimeout(function () {
        element.textContent = "自動保存";
    }, 1500);
}

function makeButton(label, className) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.className = "small" + (className ? " " + className : "");
    return button;
}


/* =========================================================
   コマ制度：定数とデータ
   ========================================================= */

const KOMA_MINUTES = 30;

const KOMA_SUBJECTS = ["国語", "数学", "英語", "理科", "社会", "その他"];

const SUBJECT_COLORS = {
    "国語": "#c62828",
    "数学": "#1565c0",
    "英語": "#2e7d32",
    "理科": "#ef6c00",
    "社会": "#6a1b9a",
    "その他": "#546e7a"
};

const MISSED_CATEGORIES = [
    "正当な外部事情",
    "開始困難",
    "意図的サボり",
    "予定・制度上の問題"
];

/* 予約できるのは2週間先まで */
const RESERVATION_LIMIT_DAYS = 14;

/* 開始15分で未実行 */
const MISSED_AFTER_MINUTES = 15;

/* 通常変更ができるのは開始2時間前まで */
const FREE_CHANGE_HOURS = 2;


let reservations = loadJSON("patgs27_reservations", []);
let weekRequired = loadJSON("patgs27_week_required", {});
let debts = loadJSON("patgs27_debts", []);
let lsRecords = loadJSON("patgs27_ls_records", []);
let changeLogs = loadJSON("patgs27_change_logs", []);

let editingReservationId = null;
let transferFromId = null;


function saveReservations() {
    saveJSON("patgs27_reservations", reservations);
}

function saveWeekRequired() {
    saveJSON("patgs27_week_required", weekRequired);
}

function saveDebts() {
    saveJSON("patgs27_debts", debts);
}

function saveLsRecords() {
    saveJSON("patgs27_ls_records", lsRecords);
}

function saveChangeLogs() {
    saveJSON("patgs27_change_logs", changeLogs);
}


function reservationStart(record) {
    return new Date(record.date + "T" + (record.time || "00:00") + ":00");
}

function reservationEndText(record) {
    const end = new Date(reservationStart(record).getTime() + KOMA_MINUTES * 60000);
    return pad2(end.getHours()) + ":" + pad2(end.getMinutes());
}

function reservationTimeText(record) {
    return record.time + "〜" + reservationEndText(record);
}

function findReservation(id) {
    return reservations.find(function (item) {
        return item.id === id;
    });
}

function statusLabel(record) {
    if (record.status === "done") {
        return "完了";
    }

    if (record.status === "running") {
        return "実行中";
    }

    if (record.status === "missed") {
        return record.rescheduledTo ? "未実行（振替済）" : "未実行";
    }

    return "予約";
}


/* =========================================================
   時刻セレクト（30分刻み）
   ========================================================= */

function buildTimeOptions(selectElement) {
    if (!selectElement) {
        return;
    }

    selectElement.innerHTML = "";

    for (let hour = 6; hour <= 23; hour++) {
        for (let minute = 0; minute < 60; minute += KOMA_MINUTES) {

            const value = pad2(hour) + ":" + pad2(minute);

            const option = document.createElement("option");
            option.value = value;
            option.textContent = value;

            selectElement.appendChild(option);
        }
    }
}


/* =========================================================
   未実行の自動判定
   ========================================================= */

function processMissedReservations() {

    const now = Date.now();
    let changed = false;

    reservations.forEach(function (record) {

        if (record.status !== "reserved") {
            return;
        }

        const limit =
            reservationStart(record).getTime() +
            MISSED_AFTER_MINUTES * 60000;

        if (now >= limit) {

            record.status = "missed";
            record.missedCategory = record.missedCategory || "";
            record.missedAt = nowText();

            changed = true;

            sendPatgsNotification(
                "⏳ 未実行になりました",
                reservationTimeText(record) + " " +
                (record.subject || "") + " / " +
                (record.content || "内容未設定") +
                "　原因を記録して振り替えましょう。"
            );
        }
    });

    if (changed) {
        saveReservations();
    }

    return changed;
}


/* =========================================================
   週の集計
   ========================================================= */

function getWeekReservations(weekStartKey) {

    const endKey = addDaysToKey(weekStartKey, 6);

    return reservations.filter(function (record) {
        return record.date >= weekStartKey && record.date <= endKey;
    });
}

function getWeekStats(weekStartKey) {

    const list = getWeekReservations(weekStartKey);

    const done = list.filter(function (r) {
        return r.status === "done";
    }).length;

    const missed = list.filter(function (r) {
        return r.status === "missed";
    }).length;

    const moved = list.filter(function (r) {
        return !!r.rescheduledTo;
    }).length;

    const required = Number(weekRequired[weekStartKey]) || 0;

    return {
        week: weekStartKey,
        required: required,
        reserved: list.length,
        done: done,
        missed: missed,
        moved: moved,
        shortage: Math.max(0, required - done)
    };
}

function getDayStats(dateKey) {

    const list = reservations.filter(function (record) {
        return record.date === dateKey;
    });

    return {
        reserved: list.length,
        done: list.filter(function (r) { return r.status === "done"; }).length,
        missed: list.filter(function (r) { return r.status === "missed"; }).length,
        moved: list.filter(function (r) { return !!r.rescheduledTo; }).length
    };
}

function getDoneKomaForDate(dateKey) {

    const fromReservations = reservations.filter(function (record) {
        return record.date === dateKey && record.status === "done";
    }).length;

    /* 旧「教科別コマ数」の記録も、過去の分は表示に使う */
    const legacy = loadJSON("patgs27_subject_today_" + dateKey, {});

    let legacyTotal = 0;

    Object.keys(legacy).forEach(function (key) {
        legacyTotal += Number(legacy[key]) || 0;
    });

    return fromReservations + legacyTotal;
}


/* 週が終わったら、足りなかった分を債務として自動で記録する */

function closeFinishedWeeks() {

    const currentWeek = getWeekStartKey(todayKey());
    let changed = false;

    Object.keys(weekRequired).forEach(function (weekStartKey) {

        if (weekStartKey >= currentWeek) {
            return;
        }

        const already = debts.some(function (debt) {
            return debt.week === weekStartKey;
        });

        if (already) {
            return;
        }

        const stats = getWeekStats(weekStartKey);

        if (stats.shortage > 0) {

            debts.push({
                id: "debt_" + weekStartKey,
                week: weekStartKey,
                koma: stats.shortage,
                createdAt: nowText(),
                resolved: false
            });

            changed = true;
        }
    });

    if (changed) {
        saveDebts();
    }
}


/* =========================================================
   予約フォーム
   ========================================================= */

function readReservationForm() {
    return {
        date: $("resDate")?.value || "",
        time: $("resTime")?.value || "",
        subject: $("resSubject")?.value || "",
        material: $("resMaterial")?.value.trim() || "",
        content: $("resContent")?.value.trim() || "",
        range: $("resRange")?.value.trim() || "",
        goal: $("resGoal")?.value.trim() || ""
    };
}

function fillReservationForm(record) {
    if ($("resDate")) { $("resDate").value = record.date || ""; }
    if ($("resTime")) { $("resTime").value = record.time || "06:00"; }
    if ($("resSubject")) { $("resSubject").value = record.subject || ""; }
    if ($("resMaterial")) { $("resMaterial").value = record.material || ""; }
    if ($("resContent")) { $("resContent").value = record.content || ""; }
    if ($("resRange")) { $("resRange").value = record.range || ""; }
    if ($("resGoal")) { $("resGoal").value = record.goal || ""; }
}

function clearReservationForm() {
    if ($("resMaterial")) { $("resMaterial").value = ""; }
    if ($("resContent")) { $("resContent").value = ""; }
    if ($("resRange")) { $("resRange").value = ""; }
    if ($("resGoal")) { $("resGoal").value = ""; }
}

function setFormStatus(text, isError) {

    const element = $("reservationFormStatus");

    if (!element) {
        return;
    }

    element.textContent = text;
    element.className = isError ? "form-status error" : "form-status";
}

function resetReservationFormMode() {

    editingReservationId = null;
    transferFromId = null;

    if ($("addReservationBtn")) {
        $("addReservationBtn").textContent = "この内容で予約する";
    }

    if ($("cancelEditBtn")) {
        $("cancelEditBtn").style.display = "none";
    }
}


function validateReservation(values, ignoreId) {

    if (!values.date || !values.time) {
        return "日付と開始時刻を選んでください。";
    }

    if (!values.subject) {
        return "科目を選んでください。";
    }

    const today = todayKey();

    if (values.date < today) {
        return "過去の日付には予約できません。";
    }

    if (values.date > getDateKeyOffset(RESERVATION_LIMIT_DAYS)) {
        return "予約できるのは2週間先までです。";
    }

    const duplicate = reservations.some(function (record) {
        return (
            record.id !== ignoreId &&
            record.date === values.date &&
            record.time === values.time &&
            record.status !== "missed"
        );
    });

    if (duplicate) {
        return "その時間にはすでにコマがあります。";
    }

    return "";
}


function isWithinFreeChange(record) {

    const diff = reservationStart(record).getTime() - Date.now();

    return diff > FREE_CHANGE_HOURS * 60 * 60 * 1000;
}


function recordChangeLog(record, action) {

    changeLogs.push({
        dateTime: nowText(),
        target: formatShortDate(record.date) + " " + reservationTimeText(record) +
                " " + (record.subject || ""),
        action: action
    });

    if (changeLogs.length > 100) {
        changeLogs = changeLogs.slice(changeLogs.length - 100);
    }

    saveChangeLogs();
}


function submitReservationForm() {

    const values = readReservationForm();

    /* --- 編集 --- */

    if (editingReservationId) {

        const record = findReservation(editingReservationId);

        if (!record) {
            resetReservationFormMode();
            return;
        }

        const error = validateReservation(values, record.id);

        if (error) {
            setFormStatus(error, true);
            return;
        }

        if (!isWithinFreeChange(record)) {

            const ok = confirm(
                "開始2時間を切っています。変更内容は記録に残りますが、変更しますか？"
            );

            if (!ok) {
                return;
            }

            recordChangeLog(record, "2時間前以降の変更");
        }

        Object.assign(record, values);

        saveReservations();
        resetReservationFormMode();
        clearReservationForm();
        setFormStatus("予約を変更しました。", false);
        renderKomaAll();

        return;
    }

    /* --- 新規・振替 --- */

    const error = validateReservation(values, null);

    if (error) {
        setFormStatus(error, true);
        return;
    }

    let origin = null;

    if (transferFromId) {

        origin = findReservation(transferFromId);

        if (origin) {

            const sameWeek =
                getWeekStartKey(origin.date) === getWeekStartKey(values.date);

            if (!sameWeek) {
                setFormStatus("振替は同じ週の中だけです。別の日を選んでください。", true);
                return;
            }
        }
    }

    const record = {
        id: "res_" + Date.now() + "_" + Math.floor(Math.random() * 1000),
        date: values.date,
        time: values.time,
        subject: values.subject,
        material: values.material,
        content: values.content,
        range: values.range,
        goal: values.goal,
        type: "normal",
        status: "reserved",
        createdAt: nowText(),
        notified: {}
    };

    if (origin) {
        record.movedFrom = origin.id;
        origin.rescheduledTo = record.id;
    }

    reservations.push(record);

    saveReservations();

    setFormStatus(
        origin
            ? "振替のコマを予約しました。"
            : "予約しました。",
        false
    );

    resetReservationFormMode();
    clearReservationForm();
    renderKomaAll();
}


function addPastExamPair() {

    const values = readReservationForm();

    const error = validateReservation(values, null);

    if (error) {
        setFormStatus(error, true);
        return;
    }

    const secondStart = new Date(
        new Date(values.date + "T" + values.time + ":00").getTime() +
        KOMA_MINUTES * 60000
    );

    if (secondStart.getHours() === 0 && secondStart.getMinutes() === 0) {
        setFormStatus("2コマ目が日をまたぐため、別の時刻を選んでください。", true);
        return;
    }

    const secondValues = {
        date: dateKeyOf(secondStart),
        time: pad2(secondStart.getHours()) + ":" + pad2(secondStart.getMinutes()),
        subject: values.subject,
        material: values.material,
        content: values.content,
        range: values.range,
        goal: values.goal
    };

    const secondError = validateReservation(secondValues, null);

    if (secondError) {
        setFormStatus("2コマ目が取れません：" + secondError, true);
        return;
    }

    const pairId = "pair_" + Date.now();

    [values, secondValues].forEach(function (item, index) {

        reservations.push({
            id: "res_" + Date.now() + "_" + index,
            date: item.date,
            time: item.time,
            subject: item.subject,
            material: item.material,
            content: item.content,
            range: item.range,
            goal: item.goal,
            type: "past",
            pairId: pairId,
            pairIndex: index + 1,
            status: "reserved",
            createdAt: nowText(),
            notified: {}
        });
    });

    saveReservations();

    setFormStatus("過去問の2コマ（30分×2）を予約しました。", false);

    resetReservationFormMode();
    clearReservationForm();
    renderKomaAll();
}


/* =========================================================
   予約の操作
   ========================================================= */

function startReservation(record) {

    record.status = "running";
    record.startedAt = nowText();

    saveReservations();
    renderKomaAll();
}

function completeReservation(record) {

    record.status = "done";
    record.completedAt = nowText();

    saveReservations();
    renderKomaAll();
    renderStudyHeatmap();
}

function reopenReservation(record) {

    record.status = "reserved";
    record.completedAt = "";
    record.missedCategory = "";

    saveReservations();
    renderKomaAll();
}

function deleteReservation(record) {

    if (!isWithinFreeChange(record) && record.status === "reserved") {

        const ok = confirm(
            "開始2時間を切っています。取り消しは記録に残りますが、取り消しますか？"
        );

        if (!ok) {
            return;
        }

        recordChangeLog(record, "2時間前以降の取り消し");

    } else if (!confirm("このコマを削除しますか？")) {
        return;
    }

    reservations = reservations.filter(function (item) {
        return item.id !== record.id;
    });

    reservations.forEach(function (item) {
        if (item.rescheduledTo === record.id) {
            item.rescheduledTo = "";
        }
    });

    saveReservations();
    renderKomaAll();
}

function beginEditReservation(record) {

    editingReservationId = record.id;
    transferFromId = null;

    fillReservationForm(record);

    if ($("addReservationBtn")) {
        $("addReservationBtn").textContent = "この内容に変更する";
    }

    if ($("cancelEditBtn")) {
        $("cancelEditBtn").style.display = "inline-block";
    }

    setFormStatus("予約を編集しています。内容を直して「この内容に変更する」を押してください。", false);

    $("resDate")?.scrollIntoView({ behavior: "smooth", block: "center" });
}

function beginTransferReservation(record) {

    editingReservationId = null;
    transferFromId = record.id;

    fillReservationForm(record);

    if ($("addReservationBtn")) {
        $("addReservationBtn").textContent = "この内容で振り替える";
    }

    if ($("cancelEditBtn")) {
        $("cancelEditBtn").style.display = "inline-block";
    }

    setFormStatus(
        "振替先を選んでいます。同じ週（" +
        formatShortDate(getWeekStartKey(record.date)) + "〜" +
        formatShortDate(addDaysToKey(getWeekStartKey(record.date), 6)) +
        "）の日時を選んでください。",
        false
    );

    $("resDate")?.scrollIntoView({ behavior: "smooth", block: "center" });
}


/* =========================================================
   コマの表示
   ========================================================= */

function buildKomaCard(record, options) {

    const settings = options || {};

    const box = document.createElement("div");

    box.className =
        "koma " +
        (record.status === "done" ? "done" :
            record.status === "missed" ? "missed" :
                record.status === "running" ? "running" : "") +
        (record.rescheduledTo ? " moved" : "");

    const head = document.createElement("div");
    head.className = "koma-head";

    const time = document.createElement("span");
    time.className = "koma-time";
    time.textContent = formatShortDate(record.date) + " " + reservationTimeText(record);

    const subject = document.createElement("span");
    subject.className = "koma-subject";
    subject.textContent = record.subject || "科目未設定";

    const status = document.createElement("span");
    status.className = "koma-tag";
    status.textContent = statusLabel(record);

    head.append(time, subject, status);

    if (record.type === "past") {
        const tag = document.createElement("span");
        tag.className = "koma-tag";
        tag.textContent = "過去問 " + (record.pairIndex || 1) + "/2";
        head.appendChild(tag);
    }

    if (record.movedFrom) {
        const tag = document.createElement("span");
        tag.className = "koma-tag";
        tag.textContent = "振替";
        head.appendChild(tag);
    }

    const detail = document.createElement("p");
    detail.className = "koma-detail";

    detail.textContent = [
        record.material ? "教材：" + record.material : "",
        record.content ? "内容：" + record.content : "",
        record.range ? "範囲：" + record.range : "",
        record.goal ? "目標：" + record.goal : ""
    ].filter(Boolean).join("　") || "内容は未設定です。";

    box.append(head, detail);

    const actions = document.createElement("div");
    actions.className = "koma-actions";

    if (record.status === "reserved") {

        const startButton = makeButton("開始", "primary");
        startButton.addEventListener("click", function () {
            startReservation(record);
        });

        const doneButton = makeButton("完了");
        doneButton.addEventListener("click", function () {
            completeReservation(record);
        });

        const editButton = makeButton("編集");
        editButton.addEventListener("click", function () {
            beginEditReservation(record);
        });

        actions.append(startButton, doneButton, editButton);
    }

    if (record.status === "running") {

        const doneButton = makeButton("完了", "primary");
        doneButton.addEventListener("click", function () {
            completeReservation(record);
        });

        actions.append(doneButton);
    }

    if (record.status === "done") {

        const undoButton = makeButton("完了を取り消す", "ghost");
        undoButton.addEventListener("click", function () {
            reopenReservation(record);
        });

        actions.append(undoButton);
    }

    if (record.status === "missed" && settings.showMissedTools) {

        const select = document.createElement("select");

        const empty = document.createElement("option");
        empty.value = "";
        empty.textContent = "原因を選ぶ";
        select.appendChild(empty);

        MISSED_CATEGORIES.forEach(function (category) {
            const option = document.createElement("option");
            option.value = category;
            option.textContent = category;
            select.appendChild(option);
        });

        select.value = record.missedCategory || "";

        select.addEventListener("change", function () {
            record.missedCategory = select.value;
            saveReservations();
            renderKomaAll();
        });

        actions.appendChild(select);

        if (!record.rescheduledTo) {

            const transferButton = makeButton("振替する", "primary");
            transferButton.addEventListener("click", function () {
                beginTransferReservation(record);
            });

            actions.appendChild(transferButton);

        } else {

            const note = document.createElement("span");
            note.className = "sub";
            note.textContent = "振替済み";
            actions.appendChild(note);
        }
    }

    const deleteButton = makeButton("削除", "ghost");
    deleteButton.addEventListener("click", function () {
        deleteReservation(record);
    });

    actions.appendChild(deleteButton);

    box.appendChild(actions);

    return box;
}


function sortByStart(a, b) {
    return (a.date + a.time).localeCompare(b.date + b.time);
}


function renderReservationLists() {

    const today = todayKey();
    const weekStart = getWeekStartKey(today);
    const weekEnd = addDaysToKey(weekStart, 6);

    const groups = [
        {
            id: "todayReservationList",
            filter: function (r) { return r.date === today; },
            empty: "今日の予約はありません。"
        },
        {
            id: "weekReservationList",
            filter: function (r) {
                return r.date > today && r.date <= weekEnd;
            },
            empty: "今週の残りに予約はありません。"
        },
        {
            id: "futureReservationList",
            filter: function (r) { return r.date > weekEnd; },
            empty: "来週以降の予約はありません。"
        }
    ];

    groups.forEach(function (group) {

        const container = $(group.id);

        if (!container) {
            return;
        }

        container.innerHTML = "";

        const list = reservations.filter(group.filter).sort(sortByStart);

        if (list.length === 0) {
            const empty = document.createElement("p");
            empty.className = "empty-note";
            empty.textContent = group.empty;
            container.appendChild(empty);
            return;
        }

        list.forEach(function (record) {
            container.appendChild(buildKomaCard(record, {}));
        });
    });
}


function renderMissedList() {

    const container = $("missedList");

    if (!container) {
        return;
    }

    container.innerHTML = "";

    const list = reservations
        .filter(function (record) {
            return record.status === "missed";
        })
        .sort(sortByStart)
        .reverse();

    if (list.length === 0) {
        const empty = document.createElement("p");
        empty.className = "empty-note";
        empty.textContent = "未実行のコマはありません。";
        container.appendChild(empty);
        return;
    }

    list.forEach(function (record) {
        container.appendChild(buildKomaCard(record, { showMissedTools: true }));
    });

    /* 開始困難は内部記録のみ。カウントダウンは出さない。 */

    const weekStart = getWeekStartKey(todayKey());

    const hardCount = getWeekReservations(weekStart).filter(function (record) {
        return record.missedCategory === "開始困難";
    }).length;

    if (hardCount >= 3) {

        const note = document.createElement("p");
        note.className = "weekly-notice";
        note.textContent =
            "今週は開始困難が続いています。週次レビューで、コマの置き方や時間帯そのものを見直しましょう。";

        container.appendChild(note);
    }
}


function renderNextReservation() {

    const box = $("nextReservationBox");

    if (!box) {
        return;
    }

    box.innerHTML = "";

    const now = Date.now();

    const running = reservations.find(function (record) {
        return record.status === "running";
    });

    const next = running || reservations
        .filter(function (record) {
            return (
                record.status === "reserved" &&
                reservationStart(record).getTime() +
                MISSED_AFTER_MINUTES * 60000 >= now
            );
        })
        .sort(sortByStart)[0];

    if (!next) {
        box.className = "next-koma is-empty";
        box.textContent = "次の予約はありません。下のコマ予約から入れられます。";
        return;
    }

    box.className = "next-koma";

    const head = document.createElement("div");

    const time = document.createElement("span");
    time.className = "next-time";
    time.textContent = next.time;

    const subject = document.createElement("span");
    subject.className = "next-subject";
    subject.textContent = next.subject || "科目未設定";

    const day = document.createElement("span");
    day.className = "next-detail";
    day.textContent =
        "　" + formatShortDate(next.date) +
        "　" + reservationTimeText(next) +
        (next.status === "running" ? "　実行中" : "");

    head.append(time, subject, day);

    const detail = document.createElement("p");
    detail.className = "next-detail";
    detail.textContent = [
        next.material,
        next.content,
        next.range,
        next.goal ? "目標：" + next.goal : ""
    ].filter(Boolean).join("　／　") || "内容は未設定です。";

    const actions = document.createElement("div");
    actions.className = "koma-actions";

    if (next.status === "reserved") {

        const startButton = makeButton("開始", "primary");
        startButton.addEventListener("click", function () {
            startReservation(next);
        });

        actions.appendChild(startButton);
    }

    const doneButton = makeButton("完了", next.status === "running" ? "primary" : "");
    doneButton.addEventListener("click", function () {
        completeReservation(next);
    });

    actions.appendChild(doneButton);

    box.append(head, detail, actions);
}


function renderTopStats() {

    const today = todayKey();
    const weekStart = getWeekStartKey(today);
    const weekEnd = addDaysToKey(weekStart, 6);

    const day = getDayStats(today);
    const week = getWeekStats(weekStart);

    const openDebt = debts
        .filter(function (debt) { return !debt.resolved; })
        .reduce(function (sum, debt) { return sum + (Number(debt.koma) || 0); }, 0);

    if ($("todayReservedCount")) { $("todayReservedCount").textContent = day.reserved; }
    if ($("todayDoneCount")) { $("todayDoneCount").textContent = day.done; }
    if ($("todayMissedCount")) { $("todayMissedCount").textContent = day.missed; }
    if ($("todayMovedCount")) { $("todayMovedCount").textContent = day.moved; }

    if ($("weekRequiredCount")) { $("weekRequiredCount").textContent = week.required; }
    if ($("weekDoneCount")) { $("weekDoneCount").textContent = week.done; }
    if ($("weekMissedCount")) { $("weekMissedCount").textContent = week.missed; }
    if ($("weekDebtCount")) { $("weekDebtCount").textContent = openDebt; }

    if ($("weekRangeLabel")) {
        $("weekRangeLabel").textContent =
            formatShortDate(weekStart) + "〜" + formatShortDate(weekEnd);
    }
}


function renderWeekSummary() {

    const weekStart = getWeekStartKey(todayKey());
    const stats = getWeekStats(weekStart);

    if ($("weekRequiredInput") && document.activeElement !== $("weekRequiredInput")) {
        $("weekRequiredInput").value = weekRequired[weekStart] ?? "";
    }

    const box = $("weekKomaSummary");

    if (box) {

        const remaining = Math.max(0, stats.required - stats.done);

        box.innerHTML =
            "必要 <strong>" + stats.required + "</strong> コマ ／ " +
            "予約 <strong>" + stats.reserved + "</strong> ／ " +
            "完了 <strong>" + stats.done + "</strong> ／ " +
            "未実行 <strong>" + stats.missed + "</strong> ／ " +
            "振替 <strong>" + stats.moved + "</strong><br>" +
            "残り <strong>" + remaining + "</strong> コマ（約 " +
            (remaining * KOMA_MINUTES / 60).toFixed(1) + " 時間）";
    }

    /* 過去の週 */

    const history = $("weekHistoryList");

    if (history) {

        history.innerHTML = "";

        const weeks = Object.keys(weekRequired)
            .filter(function (key) { return key < weekStart; })
            .sort()
            .reverse()
            .slice(0, 8);

        if (weeks.length === 0) {

            const empty = document.createElement("p");
            empty.className = "empty-note";
            empty.textContent = "過去の週の記録はまだありません。";
            history.appendChild(empty);

        } else {

            weeks.forEach(function (key) {

                const stat = getWeekStats(key);

                const row = document.createElement("p");
                row.className = "sub";
                row.textContent =
                    formatShortDate(key) + "〜" + formatShortDate(addDaysToKey(key, 6)) +
                    "：必要 " + stat.required +
                    " ／ 完了 " + stat.done +
                    " ／ 未実行 " + stat.missed +
                    " ／ 債務 " + stat.shortage;

                history.appendChild(row);
            });
        }
    }
}


function renderDebts() {

    const container = $("debtList");

    if (!container) {
        return;
    }

    container.innerHTML = "";

    if (debts.length === 0) {
        const empty = document.createElement("p");
        empty.className = "empty-note";
        empty.textContent = "債務はありません。";
        container.appendChild(empty);
        return;
    }

    debts.slice().reverse().forEach(function (debt) {

        const row = document.createElement("div");
        row.className = "koma" + (debt.resolved ? " done" : " missed");

        const text = document.createElement("div");
        text.className = "koma-head";
        text.textContent =
            formatShortDate(debt.week) + "の週：" +
            debt.koma + "コマ" +
            (debt.resolved ? "（返済済み）" : "（未返済）");

        row.appendChild(text);

        const actions = document.createElement("div");
        actions.className = "koma-actions";

        const toggle = makeButton(
            debt.resolved ? "未返済に戻す" : "返済済みにする",
            debt.resolved ? "ghost" : "primary"
        );

        toggle.addEventListener("click", function () {
            debt.resolved = !debt.resolved;
            saveDebts();
            renderKomaAll();
        });

        const remove = makeButton("削除", "ghost");

        remove.addEventListener("click", function () {

            if (!confirm("この債務を削除しますか？")) {
                return;
            }

            debts = debts.filter(function (item) {
                return item.id !== debt.id;
            });

            saveDebts();
            renderKomaAll();
        });

        actions.append(toggle, remove);
        row.appendChild(actions);

        container.appendChild(row);
    });
}


function renderChangeLogs() {

    const container = $("changeLogList");

    if (!container) {
        return;
    }

    container.innerHTML = "";

    if (changeLogs.length === 0) {
        const empty = document.createElement("p");
        empty.className = "empty-note";
        empty.textContent = "記録はありません。";
        container.appendChild(empty);
        return;
    }

    changeLogs.slice().reverse().slice(0, 20).forEach(function (log) {

        const row = document.createElement("p");
        row.className = "sub";
        row.textContent = log.dateTime + "｜" + log.target + "｜" + log.action;

        container.appendChild(row);
    });
}


/* =========================================================
   LS記録
   ========================================================= */

function renderLsRecords() {

    const container = $("lsList");

    if (!container) {
        return;
    }

    container.innerHTML = "";

    if (lsRecords.length === 0) {
        const empty = document.createElement("p");
        empty.className = "empty-note";
        empty.textContent = "LSの記録はまだありません。";
        container.appendChild(empty);
        return;
    }

    lsRecords.slice().reverse().forEach(function (record) {

        const row = document.createElement("div");
        row.className = "koma";

        const head = document.createElement("div");
        head.className = "koma-head";

        const time = document.createElement("span");
        time.className = "koma-time";
        time.textContent = formatShortDate(record.date) + " " + record.minutes + "分";

        const subject = document.createElement("span");
        subject.className = "koma-subject";
        subject.textContent = record.subject || "科目未設定";

        head.append(time, subject);

        const detail = document.createElement("p");
        detail.className = "koma-detail";
        detail.textContent = record.content || "内容は未設定です。";

        const actions = document.createElement("div");
        actions.className = "koma-actions";

        const remove = makeButton("削除", "ghost");

        remove.addEventListener("click", function () {

            lsRecords = lsRecords.filter(function (item) {
                return item.id !== record.id;
            });

            saveLsRecords();
            renderLsRecords();
        });

        actions.appendChild(remove);

        row.append(head, detail, actions);

        container.appendChild(row);
    });
}


function addLsRecord() {

    const date = $("lsDate")?.value || todayKey();
    const subject = $("lsSubject")?.value || "";
    const minutes = Number($("lsMinutes")?.value) || 0;
    const content = $("lsContent")?.value.trim() || "";

    if (minutes <= KOMA_MINUTES) {
        alert("LSは30分を超えた学習の記録です。31分以上を入力してください。");
        return;
    }

    lsRecords.push({
        id: "ls_" + Date.now(),
        date: date,
        subject: subject,
        minutes: minutes,
        content: content,
        createdAt: nowText()
    });

    saveLsRecords();

    if ($("lsMinutes")) { $("lsMinutes").value = ""; }
    if ($("lsContent")) { $("lsContent").value = ""; }

    renderLsRecords();
}


/* =========================================================
   今週の完了コマ（教科別）グラフ
   ========================================================= */

function renderSubjectKomaChart() {

    const canvas = $("subjectKomaChart");

    if (!canvas) {
        return;
    }

    const ctx = canvas.getContext("2d");
    const width = canvas.width;
    const height = canvas.height;

    ctx.clearRect(0, 0, width, height);

    const weekStart = getWeekStartKey(todayKey());

    const counts = {};

    KOMA_SUBJECTS.forEach(function (subject) {
        counts[subject] = 0;
    });

    getWeekReservations(weekStart).forEach(function (record) {

        if (record.status !== "done") {
            return;
        }

        const subject = KOMA_SUBJECTS.includes(record.subject)
            ? record.subject
            : "その他";

        counts[subject] += 1;
    });

    const values = KOMA_SUBJECTS.map(function (subject) {
        return counts[subject];
    });

    const maxValue = Math.max(1, ...values);
    const padding = 34;
    const areaWidth = width - padding * 2;
    const gap = areaWidth / KOMA_SUBJECTS.length;
    const barWidth = gap * 0.55;

    ctx.strokeStyle = "#ccc";
    ctx.beginPath();
    ctx.moveTo(padding, padding / 2);
    ctx.lineTo(padding, height - padding);
    ctx.lineTo(width - padding, height - padding);
    ctx.stroke();

    KOMA_SUBJECTS.forEach(function (subject, index) {

        const value = values[index];
        const barHeight = (value / maxValue) * (height - padding * 1.6);
        const x = padding + gap * index + (gap - barWidth) / 2;
        const y = height - padding - barHeight;

        ctx.fillStyle = SUBJECT_COLORS[subject] || "#546e7a";
        ctx.fillRect(x, y, barWidth, barHeight);

        ctx.fillStyle = "#333";
        ctx.font = "11px sans-serif";
        ctx.fillText(subject, x, height - padding + 14);

        if (value > 0) {
            ctx.fillText(String(value), x + barWidth / 2 - 4, y - 4);
        }
    });
}


/* =========================================================
   コマ関連のまとめ描画
   ========================================================= */

function renderKomaAll() {

    closeFinishedWeeks();

    renderNextReservation();
    renderTopStats();
    renderReservationLists();
    renderMissedList();
    renderDebts();
    renderChangeLogs();
    renderWeekSummary();
    renderSubjectKomaChart();
    renderWeeklyKomaReport();
}


/* =========================================================
   予約フォームのイベント
   ========================================================= */

function setupReservationForm() {

    buildTimeOptions($("resTime"));

    if ($("resDate")) {
        $("resDate").value = todayKey();
        $("resDate").min = todayKey();
        $("resDate").max = getDateKeyOffset(RESERVATION_LIMIT_DAYS);
    }

    if ($("resTime")) {
        const now = new Date();
        const minute = now.getMinutes() < 30 ? 30 : 0;
        const hour = now.getMinutes() < 30 ? now.getHours() : now.getHours() + 1;
        const candidate = pad2(Math.min(hour, 23)) + ":" + pad2(minute);

        $("resTime").value = candidate;

        if (!$("resTime").value) {
            $("resTime").value = "19:00";
        }
    }

    if ($("lsDate")) {
        $("lsDate").value = todayKey();
    }

    $("addReservationBtn")?.addEventListener("click", submitReservationForm);

    $("addPastPairBtn")?.addEventListener("click", addPastExamPair);

    $("cancelEditBtn")?.addEventListener("click", function () {
        resetReservationFormMode();
        setFormStatus("", false);
    });

    $("addLsBtn")?.addEventListener("click", addLsRecord);

    $("weekRequiredInput")?.addEventListener("input", function () {

        const weekStart = getWeekStartKey(todayKey());
        const value = $("weekRequiredInput").value;

        if (value === "") {
            delete weekRequired[weekStart];
        } else {
            weekRequired[weekStart] = Number(value) || 0;
        }

        saveWeekRequired();
        renderTopStats();
        renderWeekSummary();
        renderWeeklyKomaReport();
    });
}


/* =========================================================
   週次レビュー日
   ========================================================= */

const WEEKLY_REVIEW_DATES = [
    "2026-08-15",
    "2026-08-22",
    "2026-08-29"
];

function updateWeeklyNotice() {

    const key = todayKey();
    const isSaturday = new Date().getDay() === 6;

    const message =
        (WEEKLY_REVIEW_DATES.includes(key) || isSaturday)
            ? "🔔 本日は週次レビュー日です。"
            : "";

    if ($("weeklyReviewNotice")) {
        $("weeklyReviewNotice").textContent = message;
    }

    if ($("weeklyReviewNoticeLarge")) {
        $("weeklyReviewNoticeLarge").textContent = message;
    }
}


/* 週次レビューにコマ制度の決算を出す */

function renderWeeklyKomaReport() {

    const box = $("weeklyKomaReport");

    if (!box) {
        return;
    }

    const weekStart = getWeekStartKey(todayKey());
    const stats = getWeekStats(weekStart);

    const lsCount = lsRecords.filter(function (record) {
        return (
            record.date >= weekStart &&
            record.date <= addDaysToKey(weekStart, 6)
        );
    }).length;

    const openDebt = debts
        .filter(function (debt) { return !debt.resolved; })
        .reduce(function (sum, debt) { return sum + (Number(debt.koma) || 0); }, 0);

    const categoryCounts = {};

    MISSED_CATEGORIES.forEach(function (category) {
        categoryCounts[category] = 0;
    });

    getWeekReservations(weekStart).forEach(function (record) {
        if (record.missedCategory && categoryCounts[record.missedCategory] !== undefined) {
            categoryCounts[record.missedCategory] += 1;
        }
    });

    const categoryText = MISSED_CATEGORIES.map(function (category) {
        return category + " " + categoryCounts[category];
    }).join("／");

    box.innerHTML =
        "今週のコマ決算（" + formatShortDate(weekStart) + "〜" +
        formatShortDate(addDaysToKey(weekStart, 6)) + "）<br>" +
        "必要 <strong>" + stats.required + "</strong>／" +
        "完了 <strong>" + stats.done + "</strong>／" +
        "未実行 <strong>" + stats.missed + "</strong>／" +
        "振替 <strong>" + stats.moved + "</strong>／" +
        "債務 <strong>" + openDebt + "</strong>／" +
        "LS <strong>" + lsCount + "</strong><br>" +
        "未実行の内訳：" + categoryText;
}


/* =========================================================
   生活リズム
   ========================================================= */

function lifeKey() {
    return "patgs27_life_" + todayKey();
}

function loadLife() {

    const data = loadJSON(lifeKey(), { wake: "", bath: "", sleep: "" });

    if ($("wakeStatus")) { $("wakeStatus").value = data.wake || ""; }
    if ($("bathStatus")) { $("bathStatus").value = data.bath || ""; }
    if ($("sleepStatus")) { $("sleepStatus").value = data.sleep || ""; }
}

function saveLife() {

    saveJSON(lifeKey(), {
        wake: $("wakeStatus")?.value || "",
        bath: $("bathStatus")?.value || "",
        sleep: $("sleepStatus")?.value || ""
    });

    showSave("lifeSaveStatus");
}

["wakeStatus", "bathStatus", "sleepStatus"].forEach(function (id) {
    $(id)?.addEventListener("change", saveLife);
});


/* =========================================================
   今日の目標・一言・実績
   ========================================================= */

function dailyKey() {
    return "patgs27_daily_" + todayKey();
}

function loadDaily() {

    const oldData = {
        goal: localStorage.getItem("goalText") || "",
        message: localStorage.getItem("messageText") || "",
        result: localStorage.getItem("resultText") || ""
    };

    const data = loadJSON(dailyKey(), oldData);

    if ($("goalText")) { $("goalText").value = data.goal || ""; }
    if ($("messageText")) { $("messageText").value = data.message || ""; }
    if ($("resultText")) { $("resultText").value = data.result || ""; }
}

function saveDaily() {

    const data = {
        goal: $("goalText")?.value || "",
        message: $("messageText")?.value || "",
        result: $("resultText")?.value || ""
    };

    saveJSON(dailyKey(), data);

    localStorage.setItem("goalText", data.goal);
    localStorage.setItem("messageText", data.message);
    localStorage.setItem("resultText", data.result);

    renderTodaySummary();
}

["goalText", "messageText", "resultText"].forEach(function (id) {
    $(id)?.addEventListener("input", saveDaily);
});


/* =========================================================
   今日の予定（ToDo）
   ========================================================= */

function todoKey() {
    return "patgs27_todos_" + todayKey();
}

let todos = loadJSON(todoKey(), null);

if (!Array.isArray(todos)) {
    todos = loadJSON("todos", []);
}

function saveTodos() {
    saveJSON(todoKey(), todos);
    saveJSON("todos", todos);
}

function updateTodoRate() {

    const total = todos.length;

    const done = todos.filter(function (todo) {
        return todo.checked;
    }).length;

    const rate = total === 0 ? 0 : Math.round(done / total * 100);

    if ($("todoRate")) {
        $("todoRate").textContent = "達成率 " + rate + "%";
    }

    if ($("todoBar")) {
        $("todoBar").value = rate;
    }

    if ($("todoComment")) {

        if (total === 0) {
            $("todoComment").textContent = "📝予定を追加しよう！";
        } else if (rate === 100) {
            $("todoComment").textContent = "🏆今日の予定達成！";
        } else if (rate >= 70) {
            $("todoComment").textContent = "🟢順調！";
        } else if (rate >= 40) {
            $("todoComment").textContent = "🟡あと少し！";
        } else {
            $("todoComment").textContent = "🔴ベースアップしよう！";
        }
    }

    renderTodaySummary();
}

function renderTodos() {

    const list = $("todoList");

    if (!list) {
        return;
    }

    list.innerHTML = "";

    todos.forEach(function (todo, index) {

        const row = document.createElement("div");

        const check = document.createElement("input");
        check.type = "checkbox";
        check.checked = !!todo.checked;

        const text = document.createElement("input");
        text.type = "text";
        text.value = todo.text || "";
        text.placeholder = "予定を入力";

        const deleteButton = makeButton("削除", "ghost");

        check.addEventListener("change", function () {
            todos[index].checked = check.checked;
            saveTodos();
            updateTodoRate();
        });

        text.addEventListener("input", function () {
            todos[index].text = text.value;
            saveTodos();
        });

        deleteButton.addEventListener("click", function () {
            todos.splice(index, 1);
            saveTodos();
            renderTodos();
        });

        row.append(check, text, deleteButton);

        list.appendChild(row);
    });

    updateTodoRate();
}

$("addTodoBtn")?.addEventListener("click", function () {
    todos.push({ text: "", checked: false });
    saveTodos();
    renderTodos();
});


/* =========================================================
   誘惑報告
   ========================================================= */

let temptations = loadJSON("patgs27_temptations", []);

function saveTemptations() {
    saveJSON("patgs27_temptations", temptations);
}

function renderTemptations() {

    const list = $("temptationList");

    if (!list) {
        return;
    }

    list.innerHTML = "";

    temptations.slice().reverse().forEach(function (item, reverseIndex) {

        const row = document.createElement("p");
        row.textContent = "⚠️ " + item.dateTime;

        const button = makeButton("削除", "ghost");

        button.addEventListener("click", function () {
            const index = temptations.length - 1 - reverseIndex;
            temptations.splice(index, 1);
            saveTemptations();
            renderTemptations();
        });

        row.append(" ", button);

        list.appendChild(row);
    });

    if ($("temptationStatus")) {
        $("temptationStatus").textContent =
            temptations.length > 0
                ? "累計 " + temptations.length + " 件"
                : "未報告";
    }
}

$("temptationBtn")?.addEventListener("click", function () {

    const record = { date: todayKey(), dateTime: nowText() };

    temptations.push(record);
    saveTemptations();
    renderTemptations();

    if ($("temptationStatus")) {
        $("temptationStatus").textContent = "✓ " + record.dateTime + " に記録しました";
    }
});


/* =========================================================
   模試結果
   ========================================================= */

let mockExams = loadJSON("patgs27_mock_exams", []);

const MOCK_FIELDS = [
    ["国語 得点", "japanese"],
    ["国語 偏差値", "japanese_deviation"],
    ["数学 得点", "math"],
    ["数学 偏差値", "math_deviation"],
    ["英語 得点", "english"],
    ["英語 偏差値", "english_deviation"],
    ["理科 得点", "science"],
    ["理科 偏差値", "science_deviation"],
    ["社会 得点", "social"],
    ["社会 偏差値", "social_deviation"],
    ["3科 得点", "three"],
    ["5科 得点", "five"],
    ["5科 偏差値", "henshenshi"]
];

const DEVIATION_TREND_FIELDS = [
    ["国語", "japanese_deviation", "#c62828"],
    ["数学", "math_deviation", "#1565c0"],
    ["英語", "english_deviation", "#2e7d32"],
    ["理科", "science_deviation", "#ef6c00"],
    ["社会", "social_deviation", "#6a1b9a"],
    ["5科", "henshenshi", "#455a64"]
];

function renderMockForm() {

    const form = $("mockExamForm");

    if (!form) {
        return;
    }

    form.innerHTML = "";

    const box = document.createElement("div");

    const name = document.createElement("input");
    name.type = "text";
    name.placeholder = "模試名（例：全県模試）";

    const date = document.createElement("input");
    date.type = "date";
    date.value = todayKey();

    box.append(
        document.createTextNode("模試名："), name,
        document.createTextNode(" 日付："), date,
        document.createElement("br")
    );

    const inputs = {};

    MOCK_FIELDS.forEach(function (field) {

        const label = document.createElement("label");
        label.textContent = field[0] + "：";

        const input = document.createElement("input");
        input.type = "number";
        input.min = "0";
        input.step = "0.1";

        label.appendChild(input);
        box.append(label, " ");

        inputs[field[1]] = input;
    });

    const memo = document.createElement("textarea");
    memo.rows = 3;
    memo.placeholder = "メモ";

    box.appendChild(memo);

    const save = makeButton("模試結果を保存", "primary");
    const cancel = makeButton("キャンセル", "ghost");

    save.addEventListener("click", function () {

        const exam = {
            id: Date.now(),
            name: name.value.trim() || "模試",
            date: date.value || todayKey(),
            scores: {},
            memo: memo.value
        };

        MOCK_FIELDS.forEach(function (field) {
            exam.scores[field[1]] = inputs[field[1]].value;
        });

        mockExams.push(exam);

        saveJSON("patgs27_mock_exams", mockExams);

        form.innerHTML = "";

        renderMockExams();
        renderScoreTrend();
    });

    cancel.addEventListener("click", function () {
        form.innerHTML = "";
    });

    box.append(document.createElement("br"), save, cancel);

    form.appendChild(box);
}

function renderMockExams() {

    const list = $("mockExamList");

    if (!list) {
        return;
    }

    list.innerHTML = "";

    mockExams
        .slice()
        .sort(function (a, b) {
            return (a.date || "").localeCompare(b.date || "");
        })
        .forEach(function (exam, index) {

            const box = document.createElement("div");
            box.className = "koma";

            const title = document.createElement("h4");
            title.textContent = exam.date + "｜" + exam.name;

            const scores = document.createElement("p");
            scores.className = "koma-detail";
            scores.textContent = MOCK_FIELDS.map(function (field) {
                return field[0] + ": " + (exam.scores?.[field[1]] ?? "");
            }).join("　");

            box.append(title, scores);

            if (exam.memo) {
                const memo = document.createElement("p");
                memo.className = "koma-detail";
                memo.textContent = "メモ：" + exam.memo;
                box.appendChild(memo);
            }

            const deleteButton = makeButton("削除", "ghost");

            deleteButton.addEventListener("click", function () {

                if (!confirm("この模試結果を削除しますか？")) {
                    return;
                }

                mockExams.splice(index, 1);
                saveJSON("patgs27_mock_exams", mockExams);
                renderMockExams();
                renderScoreTrend();
            });

            box.appendChild(deleteButton);

            list.appendChild(box);
        });
}

$("addMockBtn")?.addEventListener("click", renderMockForm);


/* =========================================================
   過去問記録
   ========================================================= */

let publicPast = loadJSON("patgs27_public_past", []);
let privatePast = loadJSON("patgs27_private_past", []);

function pastStorageKey(type) {
    return type === "public" ? "patgs27_public_past" : "patgs27_private_past";
}

function addPast(type) {

    const list = type === "public" ? publicPast : privatePast;

    list.push({
        id: Date.now(),
        date: todayKey(),
        subject: "",
        score: "",
        comparison: "",
        deviation: "",
        note: ""
    });

    saveJSON(pastStorageKey(type), list);

    renderPast(type);
}

function renderPast(type) {

    const container = type === "public" ? $("publicPastList") : $("privatePastList");

    if (!container) {
        return;
    }

    const list = type === "public" ? publicPast : privatePast;

    container.innerHTML = "";

    list.forEach(function (record, index) {

        const box = document.createElement("div");
        box.className = "koma";

        const date = document.createElement("input");
        date.type = "date";
        date.value = record.date || "";

        const subject = document.createElement("input");
        subject.type = "text";
        subject.placeholder = "教科";
        subject.value = record.subject || "";

        const score = document.createElement("input");
        score.type = "number";
        score.placeholder = "自分の得点";
        score.value = record.score || "";

        const comparison = document.createElement("input");
        comparison.type = "number";
        comparison.placeholder = type === "public" ? "平均点" : "前回得点";
        comparison.value = record.comparison || "";

        let deviation = null;

        if (type === "public") {
            deviation = document.createElement("input");
            deviation.type = "number";
            deviation.placeholder = "偏差値";
            deviation.value = record.deviation || "";
        }

        const note = document.createElement("textarea");
        note.rows = 2;
        note.placeholder = "メモ";
        note.value = record.note || "";

        function save() {

            record.date = date.value;
            record.subject = subject.value;
            record.score = score.value;
            record.comparison = comparison.value;

            if (deviation) {
                record.deviation = deviation.value;
            }

            record.note = note.value;

            saveJSON(pastStorageKey(type), list);

            renderPastChart(type);

            if (type === "public") {
                renderPublicDeviationTrend();
            }
        }

        const watchInputs = deviation
            ? [date, subject, score, comparison, deviation]
            : [date, subject, score, comparison];

        watchInputs.forEach(function (input) {
            input.addEventListener("input", save);
            input.addEventListener("change", save);
        });

        note.addEventListener("input", save);

        const deleteButton = makeButton("削除", "ghost");

        deleteButton.addEventListener("click", function () {
            list.splice(index, 1);
            saveJSON(pastStorageKey(type), list);
            renderPast(type);
        });

        box.append(date, subject, score, comparison);

        if (deviation) {
            box.append(deviation);
        }

        box.append(note, deleteButton);

        container.appendChild(box);
    });

    renderPastChart(type);

    if (type === "public") {
        renderPublicDeviationTrend();
    }
}

$("addPublicPastBtn")?.addEventListener("click", function () {
    addPast("public");
});

$("addPrivatePastBtn")?.addEventListener("click", function () {
    addPast("private");
});


/* =========================================================
   違反ログ
   ========================================================= */

let violations = loadJSON("patgs27_violations", []);

function saveViolations() {
    saveJSON("patgs27_violations", violations);
}

function renderViolations() {

    const list = $("violationList");

    if (!list) {
        return;
    }

    list.innerHTML = "";

    violations.slice().reverse().forEach(function (item, reverseIndex) {

        const row = document.createElement("p");
        row.textContent = item.dateTime + "｜" + item.level + "｜" + item.text;

        const button = makeButton("削除", "ghost");

        button.addEventListener("click", function () {
            const index = violations.length - 1 - reverseIndex;
            violations.splice(index, 1);
            saveViolations();
            renderViolations();
        });

        row.append(" ", button);

        list.appendChild(row);
    });
}

$("addViolationBtn")?.addEventListener("click", function () {

    const level = $("violationLevel")?.value || "";
    const text = $("violationText")?.value.trim() || "";

    if (!level || !text) {
        alert("判定と内容を入力してください。");
        return;
    }

    violations.push({
        date: todayKey(),
        dateTime: nowText(),
        level: level,
        text: text
    });

    saveViolations();

    $("violationLevel").value = "";
    $("violationText").value = "";

    renderViolations();
});


/* =========================================================
   週次レビュー
   ========================================================= */

let weeklyReviews = loadJSON("patgs27_weekly_reviews", []);

function saveWeeklyReviews() {
    saveJSON("patgs27_weekly_reviews", weeklyReviews);
}

function loadWeeklyReview() {

    const current = weeklyReviews.find(function (item) {
        return item.week === todayKey();
    });

    if ($("weeklyReviewText")) {
        $("weeklyReviewText").value = current?.text || "";
    }
}

function saveWeeklyReview() {

    if (!$("weeklyReviewText")) {
        return;
    }

    const key = todayKey();

    let current = weeklyReviews.find(function (item) {
        return item.week === key;
    });

    if (!current) {
        current = { week: key, dateTime: nowText(), text: "" };
        weeklyReviews.push(current);
    }

    current.text = $("weeklyReviewText").value;
    current.updatedAt = nowText();

    saveWeeklyReviews();

    showSave("weeklyReviewSaveStatus");

    renderWeeklyReviews();
}

function renderWeeklyReviews() {

    const list = $("weeklyReviewList");

    if (!list) {
        return;
    }

    list.innerHTML = "";

    weeklyReviews.slice().reverse().forEach(function (item) {

        const box = document.createElement("div");
        box.className = "koma";

        const title = document.createElement("strong");
        title.textContent = item.week + "｜" + (item.updatedAt || item.dateTime || "");

        const text = document.createElement("p");
        text.className = "koma-detail";
        text.textContent = item.text || "（未入力）";

        box.append(title, text);

        list.appendChild(box);
    });
}

$("weeklyReviewText")?.addEventListener("input", saveWeeklyReview);


/* =========================================================
   テスト・提出物
   ========================================================= */

let exams = loadJSON("exams", []);

function saveExams() {
    saveJSON("exams", exams);
}

function renderExams() {

    const list = $("examList");

    if (!list) {
        return;
    }

    list.innerHTML = "";

    exams.forEach(function (exam, index) {

        const row = document.createElement("div");

        const type = document.createElement("select");

        ["提出物", "テスト", "模試"].forEach(function (value) {
            const option = document.createElement("option");
            option.value = value;
            option.textContent = value;
            type.appendChild(option);
        });

        type.value = exam.type || "提出物";

        const date = document.createElement("input");
        date.type = "date";
        date.value = exam.date || "";

        const text = document.createElement("input");
        text.type = "text";
        text.value = exam.text || "";
        text.placeholder = "内容";

        const done = document.createElement("input");
        done.type = "checkbox";
        done.checked = !!exam.done;

        const deleteButton = makeButton("削除", "ghost");

        function save() {
            exam.type = type.value;
            exam.date = date.value;
            exam.text = text.value;
            exam.done = done.checked;
            saveExams();
        }

        type.addEventListener("change", save);
        date.addEventListener("change", save);
        text.addEventListener("input", save);
        done.addEventListener("change", save);

        deleteButton.addEventListener("click", function () {
            exams.splice(index, 1);
            saveExams();
            renderExams();
        });

        row.append(type, date, text, done, document.createTextNode("完了"), deleteButton);

        list.appendChild(row);
    });
}

$("addExamBtn")?.addEventListener("click", function () {
    exams.push({ type: "提出物", date: "", text: "", done: false });
    saveExams();
    renderExams();
});


/* =========================================================
   教材
   ========================================================= */

let materials = loadJSON("materials", []);

function saveMaterials() {
    saveJSON("materials", materials);
}

function renderMaterials() {

    const list = $("materialList");

    if (!list) {
        return;
    }

    list.innerHTML = "";

    materials.forEach(function (material, index) {

        const row = document.createElement("div");

        const check = document.createElement("input");
        check.type = "checkbox";
        check.checked = !!material.checked;

        const text = document.createElement("input");
        text.type = "text";
        text.value = material.text || "";
        text.placeholder = "教材名";

        const deleteButton = makeButton("削除", "ghost");

        check.addEventListener("change", function () {
            materials[index].checked = check.checked;
            saveMaterials();
        });

        text.addEventListener("input", function () {
            materials[index].text = text.value;
            saveMaterials();
        });

        deleteButton.addEventListener("click", function () {
            materials.splice(index, 1);
            saveMaterials();
            renderMaterials();
        });

        row.append(check, text, deleteButton);

        list.appendChild(row);
    });
}

$("addMaterialBtn")?.addEventListener("click", function () {
    materials.push({ text: "新しい教材", checked: false });
    saveMaterials();
    renderMaterials();
});


/* =========================================================
   学習以外の予定
   ========================================================= */

let otherSchedules = loadJSON("patgs27_other_schedule", []);

function saveOtherSchedules() {
    saveJSON("patgs27_other_schedule", otherSchedules);
}

function renderOtherSchedules() {

    const list = $("otherScheduleList");

    if (!list) {
        return;
    }

    list.innerHTML = "";

    otherSchedules.forEach(function (item, index) {

        const row = document.createElement("div");

        const check = document.createElement("input");
        check.type = "checkbox";
        check.checked = !!item.checked;

        const text = document.createElement("input");
        text.type = "text";
        text.value = item.text || "";
        text.placeholder = "予定を入力";

        const deleteButton = makeButton("削除", "ghost");

        check.addEventListener("change", function () {
            otherSchedules[index].checked = check.checked;
            saveOtherSchedules();
        });

        text.addEventListener("input", function () {
            otherSchedules[index].text = text.value;
            saveOtherSchedules();
        });

        deleteButton.addEventListener("click", function () {
            otherSchedules.splice(index, 1);
            saveOtherSchedules();
            renderOtherSchedules();
        });

        row.append(check, text, deleteButton);

        list.appendChild(row);
    });
}

$("addOtherScheduleBtn")?.addEventListener("click", function () {
    otherSchedules.push({ text: "", checked: false });
    saveOtherSchedules();
    renderOtherSchedules();
});


/* =========================================================
   バックアップ
   ========================================================= */

function exportAllData() {

    const data = {};

    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        data[key] = localStorage.getItem(key);
    }

    const blob = new Blob(
        [JSON.stringify(data, null, 2)],
        { type: "application/json" }
    );

    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.href = url;
    link.download = "patgs27_backup_" + todayKey() + ".json";

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    URL.revokeObjectURL(url);

    if ($("backupStatus")) {
        $("backupStatus").textContent = "✓ 書き出しました。";
    }
}

function importAllData(file) {

    const reader = new FileReader();

    reader.onload = function (event) {

        try {

            const data = JSON.parse(event.target.result);

            Object.keys(data).forEach(function (key) {
                localStorage.setItem(key, data[key]);
            });

            if ($("backupStatus")) {
                $("backupStatus").textContent = "✓ 読み込みました。ページを再読み込みします。";
            }

            setTimeout(function () {
                location.reload();
            }, 800);

        } catch (error) {

            console.error("インポートエラー:", error);

            if ($("backupStatus")) {
                $("backupStatus").textContent = "✗ 読み込みに失敗しました。ファイルを確認してください。";
            }
        }
    };

    reader.readAsText(file);
}

$("exportDataBtn")?.addEventListener("click", exportAllData);

$("importDataBtn")?.addEventListener("click", function () {
    $("importDataInput")?.click();
});

$("importDataInput")?.addEventListener("change", function (event) {

    const file = event.target.files[0];

    if (file) {
        importAllData(file);
    }
});


/* =========================================================
   内申点
   ========================================================= */

const NAISHIN_SUBJECTS = [
    "国語", "数学", "理科", "社会", "英語",
    "保健体育", "音楽", "技術家庭", "美術"
];

let naishinData = loadJSON("patgs27_naishin", {});

function saveNaishin() {
    saveJSON("patgs27_naishin", naishinData);
}

function updateNaishinTotal() {

    let currentSum = 0;
    let targetSum = 0;

    NAISHIN_SUBJECTS.forEach(function (subject) {
        const entry = naishinData[subject] || {};
        currentSum += Number(entry.current) || 0;
        targetSum += Number(entry.target) || 0;
    });

    if ($("naishinTotal")) {
        $("naishinTotal").textContent =
            "現在合計：" + currentSum + " ／ 目標合計：" + targetSum;
    }
}

function renderNaishin() {

    const list = $("naishinList");

    if (!list) {
        return;
    }

    list.innerHTML = "";

    NAISHIN_SUBJECTS.forEach(function (subject) {

        if (!naishinData[subject]) {
            naishinData[subject] = { current: "", target: "" };
        }

        const row = document.createElement("div");

        const label = document.createElement("span");
        label.textContent = subject;

        const current = document.createElement("input");
        current.type = "number";
        current.min = "1";
        current.max = "5";
        current.placeholder = "現在";
        current.value = naishinData[subject].current || "";

        const target = document.createElement("input");
        target.type = "number";
        target.min = "1";
        target.max = "5";
        target.placeholder = "目標";
        target.value = naishinData[subject].target || "";

        function save() {
            naishinData[subject].current = current.value;
            naishinData[subject].target = target.value;
            saveNaishin();
            updateNaishinTotal();
        }

        current.addEventListener("input", save);
        target.addEventListener("input", save);

        row.append(
            label,
            document.createTextNode("現在"), current,
            document.createTextNode("目標"), target
        );

        list.appendChild(row);
    });

    updateNaishinTotal();
}


/* =========================================================
   弱点単元
   ========================================================= */

let weakPoints = loadJSON("patgs27_weak_points", []);

function saveWeakPoints() {
    saveJSON("patgs27_weak_points", weakPoints);
}

function renderWeakPoints() {

    const list = $("weakPointList");

    if (!list) {
        return;
    }

    list.innerHTML = "";

    weakPoints.slice().reverse().forEach(function (item, reverseIndex) {

        const index = weakPoints.length - 1 - reverseIndex;

        const row = document.createElement("div");

        const check = document.createElement("input");
        check.type = "checkbox";
        check.checked = !!item.done;

        const label = document.createElement("span");
        label.textContent = "【" + (item.subject || "その他") + "】" + item.text;

        if (item.done) {
            label.style.textDecoration = "line-through";
        }

        const deleteButton = makeButton("削除", "ghost");

        check.addEventListener("change", function () {
            weakPoints[index].done = check.checked;
            saveWeakPoints();
            renderWeakPoints();
        });

        deleteButton.addEventListener("click", function () {
            weakPoints.splice(index, 1);
            saveWeakPoints();
            renderWeakPoints();
        });

        row.append(check, label, deleteButton);

        list.appendChild(row);
    });
}

$("addWeakPointBtn")?.addEventListener("click", function () {

    const subject = $("weakPointSubject")?.value || "";
    const text = $("weakPointText")?.value.trim() || "";

    if (!text) {
        alert("内容を入力してください。");
        return;
    }

    weakPoints.push({
        subject: subject,
        text: text,
        done: false,
        dateTime: nowText()
    });

    saveWeakPoints();

    $("weakPointText").value = "";
    $("weakPointSubject").value = "";

    renderWeakPoints();
});


/* =========================================================
   質問・確認事項メモ
   ========================================================= */

let questionNotes = loadJSON("patgs27_questions", []);

function saveQuestionNotes() {
    saveJSON("patgs27_questions", questionNotes);
}

function renderQuestionNotes() {

    const list = $("questionList");

    if (!list) {
        return;
    }

    list.innerHTML = "";

    questionNotes.slice().reverse().forEach(function (item, reverseIndex) {

        const index = questionNotes.length - 1 - reverseIndex;

        const row = document.createElement("div");

        const check = document.createElement("input");
        check.type = "checkbox";
        check.checked = !!item.done;

        const label = document.createElement("span");
        label.textContent =
            "【" + (item.category || "未分類") + "】(" +
            (item.target || "未指定") + ") " + item.text;

        if (item.done) {
            label.style.textDecoration = "line-through";
        }

        const deleteButton = makeButton("削除", "ghost");

        check.addEventListener("change", function () {
            questionNotes[index].done = check.checked;
            saveQuestionNotes();
            renderQuestionNotes();
        });

        deleteButton.addEventListener("click", function () {
            questionNotes.splice(index, 1);
            saveQuestionNotes();
            renderQuestionNotes();
        });

        row.append(check, label, deleteButton);

        list.appendChild(row);
    });
}

$("addQuestionBtn")?.addEventListener("click", function () {

    const target = $("questionTarget")?.value || "";
    const category = $("questionCategory")?.value || "";
    const text = $("questionText")?.value.trim() || "";

    if (!text) {
        alert("内容を入力してください。");
        return;
    }

    questionNotes.push({
        target: target,
        category: category,
        text: text,
        done: false,
        dateTime: nowText()
    });

    saveQuestionNotes();

    $("questionText").value = "";
    $("questionTarget").value = "";
    $("questionCategory").value = "";

    renderQuestionNotes();
});


/* =========================================================
   過去問 得点・偏差値のグラフ
   ========================================================= */

function renderPublicDeviationTrend() {

    const canvas = $("publicDeviationChart");

    if (!canvas) {
        return;
    }

    const ctx = canvas.getContext("2d");
    const width = canvas.width;
    const height = canvas.height;

    ctx.clearRect(0, 0, width, height);

    const sorted = publicPast
        .filter(function (record) {
            return record.deviation !== "" && record.deviation !== undefined;
        })
        .slice()
        .sort(function (a, b) {
            return (a.date || "").localeCompare(b.date || "");
        });

    if (sorted.length === 0) {
        ctx.fillStyle = "#888";
        ctx.font = "14px sans-serif";
        ctx.fillText("偏差値のデータがありません。", 10, height / 2);
        return;
    }

    const padding = 40;

    const values = sorted.map(function (record) {
        return Number(record.deviation) || 0;
    });

    const maxValue = Math.max(70, ...values);
    const minValue = Math.min(30, ...values);

    const stepX = sorted.length > 1
        ? (width - padding * 2) / (sorted.length - 1)
        : 0;

    function toX(i) {
        return padding + stepX * i;
    }

    function toY(value) {
        return height - padding -
            ((value - minValue) / (maxValue - minValue) * (height - padding * 2));
    }

    ctx.strokeStyle = "#ccc";
    ctx.beginPath();
    ctx.moveTo(padding, padding);
    ctx.lineTo(padding, height - padding);
    ctx.lineTo(width - padding, height - padding);
    ctx.stroke();

    ctx.strokeStyle = "#6a1b9a";
    ctx.lineWidth = 2;
    ctx.beginPath();

    sorted.forEach(function (record, i) {

        const x = toX(i);
        const y = toY(Number(record.deviation));

        if (i === 0) {
            ctx.moveTo(x, y);
        } else {
            ctx.lineTo(x, y);
        }
    });

    ctx.stroke();

    ctx.fillStyle = "#6a1b9a";
    ctx.font = "11px sans-serif";

    sorted.forEach(function (record, i) {

        const x = toX(i);
        const y = toY(Number(record.deviation));

        ctx.beginPath();
        ctx.arc(x, y, 3, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillText(String(record.deviation), x - 8, y - 8);

        ctx.save();
        ctx.translate(x, height - padding + 14);
        ctx.rotate(-Math.PI / 6);
        ctx.fillText((record.subject || "") + " " + (record.date || ""), 0, 0);
        ctx.restore();
    });
}


function renderPastChart(type) {

    const canvas = $(type === "public" ? "publicPastChart" : "privatePastChart");

    if (!canvas) {
        return;
    }

    const ctx = canvas.getContext("2d");
    const width = canvas.width;
    const height = canvas.height;

    ctx.clearRect(0, 0, width, height);

    const list = type === "public" ? publicPast : privatePast;

    const sorted = list
        .filter(function (record) {
            return record.score !== "" && record.score !== undefined;
        })
        .slice()
        .sort(function (a, b) {
            return (a.date || "").localeCompare(b.date || "");
        });

    if (sorted.length === 0) {
        ctx.fillStyle = "#888";
        ctx.font = "14px sans-serif";
        ctx.fillText("記録がありません。", 10, height / 2);
        return;
    }

    const padding = 40;

    let points = [];

    if (type === "private") {

        const first = sorted[0];

        if (first.comparison !== "" && first.comparison !== undefined) {
            points.push({ label: "前回", value: Number(first.comparison) });
        }

        sorted.forEach(function (record) {
            points.push({
                label: (record.subject || "") + " " + (record.date || ""),
                value: Number(record.score) || 0
            });
        });

    } else {

        points = sorted.map(function (record) {
            return {
                label: (record.subject || "") + " " + (record.date || ""),
                value: Number(record.score) || 0
            };
        });
    }

    const scoreValues = points.map(function (point) {
        return point.value;
    });

    const compareValues = type === "public"
        ? sorted
            .map(function (record) { return Number(record.comparison); })
            .filter(function (value) { return !Number.isNaN(value); })
        : [];

    const allValues = scoreValues.concat(compareValues);

    const maxValue = Math.max(100, ...allValues);
    const minValue = Math.min(0, ...allValues);

    const stepX = points.length > 1
        ? (width - padding * 2) / (points.length - 1)
        : 0;

    function toX(i) {
        return padding + stepX * i;
    }

    function toY(value) {
        return height - padding -
            ((value - minValue) / (maxValue - minValue) * (height - padding * 2));
    }

    ctx.strokeStyle = "#ccc";
    ctx.beginPath();
    ctx.moveTo(padding, padding);
    ctx.lineTo(padding, height - padding);
    ctx.lineTo(width - padding, height - padding);
    ctx.stroke();

    ctx.strokeStyle = "#1565c0";
    ctx.lineWidth = 2;
    ctx.beginPath();

    points.forEach(function (point, i) {

        const x = toX(i);
        const y = toY(point.value);

        if (i === 0) {
            ctx.moveTo(x, y);
        } else {
            ctx.lineTo(x, y);
        }
    });

    ctx.stroke();

    if (type === "public") {

        ctx.strokeStyle = "#e65100";
        ctx.setLineDash([4, 3]);
        ctx.beginPath();

        let started = false;

        sorted.forEach(function (record, i) {

            if (record.comparison === "" || record.comparison === undefined) {
                return;
            }

            const x = toX(i);
            const y = toY(Number(record.comparison));

            if (!started) {
                ctx.moveTo(x, y);
                started = true;
            } else {
                ctx.lineTo(x, y);
            }
        });

        ctx.stroke();
        ctx.setLineDash([]);
    }

    ctx.font = "10px sans-serif";

    points.forEach(function (point, i) {

        const x = toX(i);
        const y = toY(point.value);

        ctx.fillStyle = "#1565c0";
        ctx.beginPath();
        ctx.arc(x, y, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillText(String(point.value), x - 8, y - 8);

        ctx.save();
        ctx.translate(x, height - padding + 14);
        ctx.rotate(-Math.PI / 6);
        ctx.fillText(point.label, 0, 0);
        ctx.restore();
    });

    ctx.fillStyle = "#1565c0";
    ctx.fillText("● 自分の得点", padding, 14);

    if (type === "public") {
        ctx.fillStyle = "#e65100";
        ctx.fillText("- - 平均点", padding + 90, 14);
    }
}


/* =========================================================
   模試 偏差値の推移グラフ
   ========================================================= */

function renderScoreTrend() {

    const canvas = $("scoreTrendChart");

    if (!canvas) {
        return;
    }

    const ctx = canvas.getContext("2d");
    const width = canvas.width;
    const height = canvas.height;

    ctx.clearRect(0, 0, width, height);

    const sortedExams = mockExams.slice().sort(function (a, b) {
        return (a.date || "").localeCompare(b.date || "");
    });

    const activeFields = DEVIATION_TREND_FIELDS.filter(function (field) {

        const key = field[1];

        return sortedExams.some(function (exam) {
            return exam.scores?.[key] !== undefined && exam.scores?.[key] !== "";
        });
    });

    if (activeFields.length === 0) {
        ctx.fillStyle = "#888";
        ctx.font = "14px sans-serif";
        ctx.fillText("模試の偏差値データがありません。", 10, height / 2);
        return;
    }

    const padding = 40;

    let allValues = [];

    activeFields.forEach(function (field) {

        const key = field[1];

        sortedExams.forEach(function (exam) {
            if (exam.scores?.[key] !== undefined && exam.scores?.[key] !== "") {
                allValues.push(Number(exam.scores[key]));
            }
        });
    });

    const maxValue = Math.max(70, ...allValues);
    const minValue = Math.min(30, ...allValues);

    const stepX = sortedExams.length > 1
        ? (width - padding * 2) / (sortedExams.length - 1)
        : 0;

    function toX(i) {
        return padding + stepX * i;
    }

    function toY(value) {
        return height - padding -
            ((value - minValue) / (maxValue - minValue) * (height - padding * 2));
    }

    ctx.strokeStyle = "#ccc";
    ctx.beginPath();
    ctx.moveTo(padding, padding);
    ctx.lineTo(padding, height - padding);
    ctx.lineTo(width - padding, height - padding);
    ctx.stroke();

    activeFields.forEach(function (field) {

        const key = field[1];
        const color = field[2];

        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.beginPath();

        let started = false;

        sortedExams.forEach(function (exam, i) {

            if (exam.scores?.[key] === undefined || exam.scores?.[key] === "") {
                return;
            }

            const x = toX(i);
            const y = toY(Number(exam.scores[key]));

            if (!started) {
                ctx.moveTo(x, y);
                started = true;
            } else {
                ctx.lineTo(x, y);
            }
        });

        ctx.stroke();

        ctx.fillStyle = color;

        sortedExams.forEach(function (exam, i) {

            if (exam.scores?.[key] === undefined || exam.scores?.[key] === "") {
                return;
            }

            const x = toX(i);
            const y = toY(Number(exam.scores[key]));

            ctx.beginPath();
            ctx.arc(x, y, 3, 0, Math.PI * 2);
            ctx.fill();
        });
    });

    ctx.fillStyle = "#333";
    ctx.font = "10px sans-serif";

    sortedExams.forEach(function (exam, i) {

        const x = toX(i);

        ctx.save();
        ctx.translate(x, height - padding + 14);
        ctx.rotate(-Math.PI / 6);
        ctx.fillText(exam.date || "", 0, 0);
        ctx.restore();
    });

    ctx.font = "11px sans-serif";

    activeFields.forEach(function (field, i) {
        ctx.fillStyle = field[2];
        ctx.fillText("● " + field[0], padding + i * 60, 14);
    });
}


/* =========================================================
   PATGS代理ローテーション
   ========================================================= */

const PATGS_PROXY_ORDER = ["総裁", "ChatGPT", "Gemini", "Claude"];

function getPatgsArbiter(proxy) {

    const index = PATGS_PROXY_ORDER.indexOf(proxy);

    if (index === -1) {
        return "";
    }

    return PATGS_PROXY_ORDER[(index + 1) % PATGS_PROXY_ORDER.length];
}

function updatePatgsProxyResult() {

    if (!$("patgsProxyResult")) {
        return;
    }

    const proxy = $("patgsProxySelect")?.value || "";

    if (!proxy) {
        $("patgsProxyResult").textContent = "";
        return;
    }

    $("patgsProxyResult").textContent =
        "今週のPATGS代理：" + proxy +
        "／自己判断の裁定者：" + getPatgsArbiter(proxy);
}

function loadPatgsProxy() {

    const saved = localStorage.getItem("patgs27_proxy_selection") || "";

    if ($("patgsProxySelect")) {
        $("patgsProxySelect").value = saved;
    }

    updatePatgsProxyResult();
}

$("patgsProxySelect")?.addEventListener("change", function () {

    localStorage.setItem("patgs27_proxy_selection", $("patgsProxySelect").value);

    updatePatgsProxyResult();
});


/* =========================================================
   教科別 学習法メモ
   ========================================================= */

const SUBJECT_PLAN_SUBJECTS = ["国語", "数学", "英語", "理科", "社会"];

let subjectPlanNotes = loadJSON("patgs27_subject_notes", {});

function saveSubjectPlanNotes() {
    saveJSON("patgs27_subject_notes", subjectPlanNotes);
}

function renderSubjectPlan() {

    const list = $("subjectPlanList");

    if (!list) {
        return;
    }

    list.innerHTML = "";

    SUBJECT_PLAN_SUBJECTS.forEach(function (subject) {

        const row = document.createElement("div");

        const title = document.createElement("h4");
        title.textContent = subject;

        const note = document.createElement("textarea");
        note.rows = 2;
        note.placeholder = subject + "で効果的な学習法メモ";
        note.value = subjectPlanNotes[subject] || "";

        note.addEventListener("input", function () {
            subjectPlanNotes[subject] = note.value;
            saveSubjectPlanNotes();
            showSave("subjectPlanSaveStatus");
        });

        row.append(title, note);

        list.appendChild(row);
    });
}


/* =========================================================
   通知（予約連動）
   ========================================================= */

const WEEKLY_REVIEW_REMINDER_DAY = 6; /* 0=日 … 6=土 */
const WEEKLY_REVIEW_REMINDER_HOUR = 8;

let patgsServiceWorkerReady = null;

if ("serviceWorker" in navigator) {

    const patgsHadController = !!navigator.serviceWorker.controller;

    patgsServiceWorkerReady = navigator.serviceWorker
        .register("/sw.js?v=" + PATGS_VERSION)
        .then(function (registration) {
            return registration;
        })
        .catch(function (error) {
            console.error("Service Workerの登録に失敗しました:", error);
            return null;
        });

    if (patgsHadController) {

        let patgsSwRefreshing = false;

        navigator.serviceWorker.addEventListener("controllerchange", function () {

            if (patgsSwRefreshing) {
                return;
            }

            patgsSwRefreshing = true;
            window.location.reload();
        });
    }
}

function getNotificationStatus() {

    if (!("Notification" in window)) {
        return "notsupported";
    }

    return Notification.permission;
}

function updateNotificationStatus() {

    if (!$("notificationStatus")) {
        return;
    }

    const status = getNotificationStatus();

    if (status === "granted") {
        $("notificationStatus").textContent =
            "✓ 通知は有効です。このページを開いている間、予約に合わせて届きます。";
    } else if (status === "denied") {
        $("notificationStatus").textContent =
            "✗ 通知がブロックされています。ブラウザのサイト設定から許可してください。";
    } else if (status === "notsupported") {
        $("notificationStatus").textContent =
            "このブラウザは通知に対応していません。";
    } else {
        $("notificationStatus").textContent =
            "通知はまだ許可されていません。上のボタンから許可してください。";
    }
}

$("enableNotificationBtn")?.addEventListener("click", function () {

    if (!("Notification" in window)) {
        alert("このブラウザは通知に対応していません。");
        return;
    }

    Notification.requestPermission().then(function () {
        updateNotificationStatus();
    });
});

function sendPatgsNotification(title, body) {

    if (!("Notification" in window) || Notification.permission !== "granted") {
        return;
    }

    if (patgsServiceWorkerReady) {

        patgsServiceWorkerReady
            .then(function (registration) {

                if (registration && registration.showNotification) {
                    registration.showNotification(title, { body: body });
                } else {
                    new Notification(title, { body: body });
                }
            })
            .catch(function (error) {
                console.error("通知の送信に失敗しました:", error);
            });

        return;
    }

    try {
        new Notification(title, { body: body });
    } catch (error) {
        console.error("通知の送信に失敗しました:", error);
    }
}


/* 予約の15分前・開始時刻に通知する */

function checkReservationNotifications() {

    if (!("Notification" in window) || Notification.permission !== "granted") {
        return;
    }

    const now = Date.now();
    let changed = false;

    reservations.forEach(function (record) {

        if (record.status !== "reserved") {
            return;
        }

        const start = reservationStart(record).getTime();

        record.notified = record.notified || {};

        if (!record.notified.pre && now >= start - 15 * 60000 && now < start) {

            sendPatgsNotification(
                "⏰ まもなくコマの時間です",
                reservationTimeText(record) + " " + (record.subject || "") +
                "　" + (record.content || "") + "　" + (record.range || "")
            );

            record.notified.pre = true;
            changed = true;
        }

        if (!record.notified.start && now >= start && now < start + 5 * 60000) {

            sendPatgsNotification(
                "▶ コマの開始時刻です",
                reservationTimeText(record) + " " + (record.subject || "") +
                "　" + (record.goal ? "目標：" + record.goal : "開始を押してはじめましょう。")
            );

            record.notified.start = true;
            changed = true;
        }
    });

    if (changed) {
        saveReservations();
    }
}


function checkWeeklyReviewNotification() {

    if (!("Notification" in window) || Notification.permission !== "granted") {
        return;
    }

    const now = new Date();

    if (now.getDay() !== WEEKLY_REVIEW_REMINDER_DAY) {
        return;
    }

    if (now.getHours() !== WEEKLY_REVIEW_REMINDER_HOUR || now.getMinutes() > 4) {
        return;
    }

    const fireKey = todayKey() + "-weekly";

    if (localStorage.getItem("patgs27_last_notification") === fireKey) {
        return;
    }

    sendPatgsNotification(
        "📅 週次レビューの時間です",
        "今週の必要・完了・未実行・振替・債務を確認しましょう。"
    );

    localStorage.setItem("patgs27_last_notification", fireKey);
}


function tick() {

    const changed = processMissedReservations();

    checkReservationNotifications();
    checkWeeklyReviewNotification();

    renderNextReservation();
    renderTopStats();

    if (changed) {
        renderKomaAll();
    }
}

setInterval(tick, 30 * 1000);


/* =========================================================
   継続日数・学習カレンダー（縮小表示）
   ========================================================= */

function recordOpenedDate(dateKey) {

    let openedDates = loadJSON("patgs27_opened_dates", []);

    if (!openedDates.includes(dateKey)) {

        openedDates.push(dateKey);

        if (openedDates.length > 120) {
            openedDates = openedDates.slice(openedDates.length - 120);
        }

        saveJSON("patgs27_opened_dates", openedDates);
    }
}

function renderStudyHeatmap() {

    const container = $("studyHeatmap");

    if (!container) {
        return;
    }

    container.innerHTML = "";

    const openedDates = loadJSON("patgs27_opened_dates", []);

    for (let i = 29; i >= 0; i--) {

        const dateKey = getDateKeyOffset(-i);
        const total = getDoneKomaForDate(dateKey);
        const opened = openedDates.includes(dateKey);

        let bgColor = "#ebedf0";

        if (total > 0) {
            if (total >= 6) {
                bgColor = "#196127";
            } else if (total >= 3) {
                bgColor = "#39a637";
            } else {
                bgColor = "#9be9a8";
            }
        } else if (opened) {
            bgColor = "#c9e3f5";
        }

        const cell = document.createElement("div");

        cell.title =
            dateKey + "：" + total + "コマ" +
            (opened ? "（開いた）" : "（未訪問）");

        cell.style.width = "16px";
        cell.style.height = "16px";
        cell.style.borderRadius = "2px";
        cell.style.backgroundColor = bgColor;

        container.appendChild(cell);
    }
}

function updateStreak() {

    const today = todayKey();
    const yesterday = getDateKeyOffset(-1);
    const lastOpened = localStorage.getItem("patgs27_last_opened") || "";

    let streak = Number(localStorage.getItem("patgs27_streak")) || 0;

    if (lastOpened === today) {
        /* 今日は記録済み */
    } else if (lastOpened === yesterday) {
        streak += 1;
        localStorage.setItem("patgs27_last_opened", today);
        localStorage.setItem("patgs27_streak", String(streak));
    } else {
        streak = 1;
        localStorage.setItem("patgs27_last_opened", today);
        localStorage.setItem("patgs27_streak", String(streak));
    }

    let bestStreak = Number(localStorage.getItem("patgs27_best_streak")) || 0;

    if (streak > bestStreak) {
        bestStreak = streak;
        localStorage.setItem("patgs27_best_streak", String(bestStreak));
    }

    recordOpenedDate(today);

    if ($("streakCount")) {
        $("streakCount").textContent = String(streak);
    }

    if ($("bestStreakCount")) {
        $("bestStreakCount").textContent = String(bestStreak);
    }
}


/* =========================================================
   開いたときの一言
   ========================================================= */

const PATGS_RANDOM_MESSAGES = [
    "予約したコマを、ひとつずつ。",
    "机に座るところまでが本番。",
    "できた分だけ、ちゃんと数えよう。",
    "未実行は失敗じゃなく、材料。",
    "30分だけ、まず始めよう。",
    "今日の自分が、未来の自分を助ける。",
    "焦らず、でも止まらず。",
    "完璧じゃなくていい、続けよう。"
];

function renderRandomMessage() {

    if (!$("randomMessage")) {
        return;
    }

    const index = Math.floor(Math.random() * PATGS_RANDOM_MESSAGES.length);

    $("randomMessage").textContent = PATGS_RANDOM_MESSAGES[index];
}


/* =========================================================
   今日のサマリー（目標・予定達成率）
   ========================================================= */

function renderTodaySummary() {

    if ($("summaryGoal")) {
        const goalValue = $("goalText")?.value.trim() || "";
        $("summaryGoal").textContent = goalValue || "未設定";
    }

    if ($("summaryTodoRate")) {

        const total = todos.length;

        const done = todos.filter(function (todo) {
            return todo.checked;
        }).length;

        const rate = total === 0 ? 0 : Math.round(done / total * 100);

        $("summaryTodoRate").textContent = rate + "%";
    }
}


/* =========================================================
   重要予定（日付管理）
   ========================================================= */

const DEFAULT_PATGS_SCHEDULE = [
    { id: "summerVacationEnd", name: "夏休み終了", date: "2026-08-26", icon: "🌻", fixed: true },
    { id: "mockExam1", name: "第1回模試", date: "", icon: "📝", fixed: false },
    { id: "regularTest", name: "定期テスト", date: "", icon: "📚", fixed: false },
    { id: "entranceExam", name: "入試", date: "2027-02-16", icon: "🎓", fixed: true },
    { id: "resultAnnouncement", name: "合格発表", date: "2027-02-26", icon: "🏆", fixed: true }
];

let patgsSchedule = loadJSON("patgs27_schedule", null);

if (!Array.isArray(patgsSchedule)) {

    patgsSchedule = DEFAULT_PATGS_SCHEDULE.map(function (item) {
        return { ...item };
    });

    saveJSON("patgs27_schedule", patgsSchedule);
}

function getPATGSToday() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return today;
}

function getPATGSTargetDate(dateString) {

    if (!dateString) {
        return null;
    }

    const target = new Date(dateString + "T00:00:00");
    target.setHours(0, 0, 0, 0);
    return target;
}

function formatScheduleDate(dateString) {

    if (!dateString) {
        return "未設定";
    }

    const parts = dateString.split("-");

    if (parts.length !== 3) {
        return dateString;
    }

    return Number(parts[0]) + "/" + Number(parts[1]) + "/" + Number(parts[2]);
}

function updatePATGSTodayDate() {

    const element = $("todayDate");

    if (!element) {
        return;
    }

    const today = getPATGSToday();

    element.textContent =
        today.getFullYear() + "/" +
        (today.getMonth() + 1) + "/" +
        today.getDate();
}

function renderScheduleSettings() {

    const container = $("patgsDateSettings");

    if (!container) {
        return;
    }

    container.innerHTML = "";

    patgsSchedule.forEach(function (event, index) {

        const row = document.createElement("div");
        row.className = "schedule-setting-row";

        const icon = document.createElement("input");
        icon.type = "text";
        icon.value = event.icon || "📅";
        icon.placeholder = "アイコン";

        const name = document.createElement("input");
        name.type = "text";
        name.value = event.name || "";
        name.placeholder = "予定名";

        const date = document.createElement("input");
        date.type = "date";
        date.value = event.date || "";

        function saveScheduleItem() {

            event.name = name.value.trim();
            event.date = date.value;
            event.icon = icon.value.trim() || "📅";

            saveJSON("patgs27_schedule", patgsSchedule);

            updatePATGSTodayDate();
            updateSchedule();
        }

        name.addEventListener("input", saveScheduleItem);
        date.addEventListener("change", saveScheduleItem);
        icon.addEventListener("input", saveScheduleItem);

        const deleteButton = makeButton("削除", "ghost");

        deleteButton.addEventListener("click", function () {

            const title = event.name || "この予定";

            if (!confirm("「" + title + "」を削除しますか？")) {
                return;
            }

            patgsSchedule.splice(index, 1);

            saveJSON("patgs27_schedule", patgsSchedule);

            renderScheduleSettings();
            updateSchedule();
        });

        row.append(icon, name, date, deleteButton);

        container.appendChild(row);
    });
}

function addPATGSSchedule() {

    patgsSchedule.push({
        id: "schedule_" + Date.now(),
        name: "新しい予定",
        date: "",
        icon: "📅",
        fixed: false
    });

    saveJSON("patgs27_schedule", patgsSchedule);

    renderScheduleSettings();
    updateSchedule();
}

function updateSchedule() {

    const container = $("upcomingScheduleList");

    if (!container) {
        return;
    }

    container.innerHTML = "";

    const today = getPATGSToday();

    const upcoming = patgsSchedule
        .filter(function (event) {
            return !!event.date;
        })
        .map(function (event) {

            const target = getPATGSTargetDate(event.date);

            if (!target) {
                return null;
            }

            return {
                ...event,
                diff: Math.round(
                    (target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
                )
            };
        })
        .filter(function (event) {
            return event !== null && event.diff >= 0;
        })
        .sort(function (a, b) {
            return a.diff - b.diff;
        });

    if (upcoming.length === 0) {

        const empty = document.createElement("p");
        empty.className = "empty-note";
        empty.textContent = "今後の重要予定はありません。";
        container.appendChild(empty);
        return;
    }

    upcoming.forEach(function (event) {

        const item = document.createElement("div");
        item.className = "schedule-item";

        const name = document.createElement("div");
        name.className = "schedule-name";
        name.textContent = (event.icon || "📅") + " " + (event.name || "名称未設定");

        const date = document.createElement("div");
        date.className = "schedule-date";
        date.textContent = formatScheduleDate(event.date);

        const days = document.createElement("div");
        days.className = "schedule-days";
        days.textContent = event.diff === 0 ? "今日" : "あと " + event.diff + " 日";

        item.append(name, date, days);

        container.appendChild(item);
    });
}

$("addScheduleSettingBtn")?.addEventListener("click", addPATGSSchedule);

setInterval(function () {
    updatePATGSTodayDate();
    updateSchedule();
}, 60 * 1000);


/* =========================================================
   初期化
   ========================================================= */

function initializePATGS27() {

    /* コマ制度 */
    setupReservationForm();
    processMissedReservations();
    renderKomaAll();
    renderLsRecords();

    /* 日々の記録 */
    loadLife();
    loadDaily();
    renderTodos();
    renderTemptations();

    /* 成績 */
    renderMockExams();
    renderPast("public");
    renderPast("private");
    renderScoreTrend();
    renderNaishin();
    renderWeakPoints();

    /* 記録・レビュー */
    renderViolations();
    updateWeeklyNotice();
    loadWeeklyReview();
    renderWeeklyReviews();

    /* 予定・教材・メモ */
    renderExams();
    renderMaterials();
    renderOtherSchedules();
    renderQuestionNotes();
    renderScheduleSettings();
    updatePATGSTodayDate();
    updateSchedule();

    /* その他 */
    loadPatgsProxy();
    renderSubjectPlan();
    updateNotificationStatus();
    updateStreak();
    renderStudyHeatmap();
    renderTodaySummary();
    renderRandomMessage();

    console.log("PATGS27 script.js (" + PATGS_VERSION + ") loaded successfully.");
}

initializePATGS27();
