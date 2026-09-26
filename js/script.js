"use strict";

/* =========================================================
   PATGS27  script.js  （第五次改革・改良版）
   =========================================================
   【コマ制度】
     ・開始時刻は固定枠（平日／土休日 × 通常学習／模試・過去問）
     ・通常学習：30分学習＋10分休憩＝40分周期
     ・模試・過去問：50分実施＋20分採点分析＝70分（80分周期）
     ・模試と通常コマが時間的に重なる枠は予約できない
     ・予約 → 実行 → 完了。開始15分で未実行、4分類で記録
     ・開始困難は原因を記録。回数は3回・5回・10回で到達表示
     ・振替（同じ週）／債務（週末に残った未達分）
     ・取り消しは理由を記録
     ・空き枠検索
   【通知】
     ・予約の5分前／開始時刻／未実行（いずれも内容つき）
     ・毎時00分（6:00〜23:00）の学習確認
     ・土曜8:00の週次レビュー
   ========================================================= */


const PATGS_VERSION = "20260923a";

/* =========================================================
   アカウントごとのデータ分離（Firebase Authのuser.uidに基づく）
   =========================================================
   firebase.js が Google ログインでユーザーを確定すると
   window.PATGS_BOOT(uid) を呼び出す。それまでは
   PATGS_UID は null のままで、画面もまだ描画されない。
   ========================================================= */

let PATGS_UID = null;

function patgsNamespacedKey(rawKey) {
    if (!PATGS_UID) {
        return rawKey;
    }
    return "patgs27_u_" + PATGS_UID + "__" + rawKey;
}

function patgsHasNamespacedData(uid) {

    const prefix = "patgs27_u_" + uid + "__";

    for (let i = 0; i < localStorage.length; i++) {
        if ((localStorage.key(i) || "").indexOf(prefix) === 0) {
            return true;
        }
    }

    return false;
}

/* 旧・共有（アカウント分離前）のデータは、最初にログインした
   1アカウントだけに一度だけ引き継ぐ。それ以降に初めてログインする
   別アカウントは、古いデータを勝手に受け取らず空の状態から始まる
   （クラウド同期があるので、以後は各アカウントがSupabase上に
   自分のデータを持つ）。
   元のキーは削除しない。 */
const PATGS_LEGACY_MIGRATION_FLAG = "patgs27_legacy_migration_done";

function patgsMigrateLegacyDataForUser(uid) {

    if (!uid || patgsHasNamespacedData(uid)) {
        return;
    }

    if (localStorage.getItem(PATGS_LEGACY_MIGRATION_FLAG)) {
        /* 既に別のアカウントが旧データを引き継ぎ済み。
           このアカウントは空の状態から始める。 */
        return;
    }

    const ownedPrefix = "patgs27_u_";
    const keysToCopy = [];

    for (let i = 0; i < localStorage.length; i++) {

        const key = localStorage.key(i);

        if (!key || key.indexOf(ownedPrefix) === 0 || key === PATGS_LEGACY_MIGRATION_FLAG) {
            continue;
        }

        keysToCopy.push(key);
    }

    keysToCopy.forEach(function (key) {

        const value = localStorage.getItem(key);

        if (value !== null) {
            localStorage.setItem("patgs27_u_" + uid + "__" + key, value);
        }
    });

    /* 旧データが1件もなくても、二度と別アカウントへコピーしないよう
       必ずフラグを立てる。 */
    localStorage.setItem(PATGS_LEGACY_MIGRATION_FLAG, "1");
}


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
        dateObject.getFullYear() + "-" +
        pad2(dateObject.getMonth() + 1) + "-" +
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

/* 週は日曜はじまり・土曜おわり */
function getWeekStartKey(dateKey) {
    const d = new Date(dateKey + "T00:00:00");
    d.setDate(d.getDate() - d.getDay());
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

    return Number(parts[1]) + "/" + Number(parts[2]) + "(" + week[d.getDay()] + ")";
}

function timeToMinutes(time) {
    const parts = (time || "00:00").split(":");
    return Number(parts[0]) * 60 + Number(parts[1]);
}

function minutesToTime(minutes) {
    const total = ((minutes % 1440) + 1440) % 1440;
    return pad2(Math.floor(total / 60)) + ":" + pad2(total % 60);
}

function loadJSON(key, fallback) {
    try {
        const data = localStorage.getItem(patgsNamespacedKey(key));

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
        localStorage.setItem(patgsNamespacedKey(key), JSON.stringify(data));
        patgsScheduleSync();
    } catch (error) {
        console.error("保存エラー:", key, error);
    }
}


/* =========================================================
   Supabaseへのクラウド同期（既存のUI・機能・データ構造には
   影響しません。localStorageの読み書きはこれまで通りです）
   ========================================================= */

let patgsSyncTimer = null;

/* 保存のたびに毎回すぐ送るのではなく、少し待ってまとめて送る。 */
function patgsScheduleSync() {

    if (!PATGS_UID || !window.PATGS_SUPABASE) {
        return;
    }

    clearTimeout(patgsSyncTimer);
    patgsSyncTimer = setTimeout(patgsPushToSupabase, 2000);
}

/* 現在ログイン中のアカウントに属するlocalStorageデータだけを
   1つのオブジェクトにまとめる（exportAllDataと同じ絞り込み）。 */
function patgsCollectAllLocalDataForSync() {

    const data = {};
    const ownPrefix = patgsNamespacedKey("");

    for (let i = 0; i < localStorage.length; i++) {

        const key = localStorage.key(i);

        if (key && key.indexOf(ownPrefix) === 0) {
            data[key] = localStorage.getItem(key);
        }
    }

    return data;
}

async function patgsPushToSupabase() {

    if (!PATGS_UID || !window.PATGS_SUPABASE) {
        return;
    }

    const payload = patgsCollectAllLocalDataForSync();
    const nowIso = new Date().toISOString();

    try {

        const { error } = await window.PATGS_SUPABASE
            .from("patgs27_user_data")
            .upsert({ user_id: PATGS_UID, data: payload, updated_at: nowIso });

        if (!error) {
            localStorage.setItem(patgsNamespacedKey("patgs27_cloud_synced_at"), nowIso);
        } else {
            console.error("Supabase同期エラー(push):", error);
        }

    } catch (error) {
        console.error("Supabase同期エラー(push):", error);
    }
}

/* ログイン直後に一度だけ呼ばれる。クラウド側の方が新しければ、
   クラウドのデータでlocalStorageを上書きしてから起動する
   （最終更新優先・項目ごとのマージはしない）。 */
async function patgsPullFromSupabaseAndMerge(uid) {

    if (!uid || !window.PATGS_SUPABASE) {
        return;
    }

    try {

        const { data: row, error } = await window.PATGS_SUPABASE
            .from("patgs27_user_data")
            .select("data, updated_at")
            .eq("user_id", uid)
            .maybeSingle();

        if (error || !row) {
            return;
        }

        const localSyncedAt = localStorage.getItem(patgsNamespacedKey("patgs27_cloud_synced_at")) || "";
        const cloudUpdatedAt = row.updated_at || "";

        if (cloudUpdatedAt && cloudUpdatedAt > localSyncedAt) {

            const cloudData = row.data || {};

            Object.keys(cloudData).forEach(function (key) {
                if (cloudData[key] !== null && cloudData[key] !== undefined) {
                    localStorage.setItem(key, cloudData[key]);
                }
            });

            localStorage.setItem(patgsNamespacedKey("patgs27_cloud_synced_at"), cloudUpdatedAt);
        }

    } catch (error) {
        console.error("Supabase同期エラー(pull):", error);
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
   固定枠の定義
   ========================================================= */

/* 通常学習：30分学習＋10分休憩＝40分周期 */

const NORMAL_SLOTS = {

    weekday: [
        "06:30",
        "13:30", "14:10", "14:50", "15:30", "16:10", "16:50",
        "17:30", "18:10", "18:50", "19:30", "20:10", "20:50",
        "21:30", "22:10"
    ],

    holiday: [
        "09:00", "09:40", "10:20", "11:00", "11:40", "12:20",
        "13:00", "13:40", "14:20", "15:00", "15:40", "16:20",
        "17:00", "17:40", "18:20", "19:00", "19:40", "20:20",
        "21:00", "21:40", "22:20"
    ]
};

/* 模試・過去問：50分実施＋20分採点分析＝70分（80分周期） */

const EXAM_SLOTS = {

    weekday: [
        "13:30", "14:50", "16:10", "17:30", "18:50", "20:10", "21:30"
    ],

    holiday: [
        "09:00", "10:20", "11:40", "13:00", "14:20",
        "15:40", "17:00", "18:20", "19:40", "21:00"
    ]
};

const TYPE_LABEL = {
    normal: "通常学習",
    exam: "模試・過去問"
};

const TYPE_DURATION = {
    normal: 30,
    exam: 70
};

/* 模試・過去問は2コマ分として数える */
const TYPE_KOMA = {
    normal: 1,
    exam: 2
};

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

const CANCEL_REASONS = [
    "学校・予定",
    "体調・休養",
    "緊急事態",
    "計画変更",
    "その他"
];

const HARD_START_MILESTONES = [3, 5, 10];

const RESERVATION_LIMIT_DAYS = 14;
const MISSED_AFTER_MINUTES = 15;
const FREE_CHANGE_HOURS = 2;


/* =========================================================
   コマ制度のデータ
   ========================================================= */

let reservations = loadJSON("patgs27_reservations", []);
let weekRequired = loadJSON("patgs27_week_required", {});
let debts = loadJSON("patgs27_debts", []);
let lsRecords = loadJSON("patgs27_ls_records", []);
let changeLogs = loadJSON("patgs27_change_logs", []);
let cancelLogs = loadJSON("patgs27_cancel_logs", []);
let dayTypeOverrides = loadJSON("patgs27_day_type_overrides", {});

let editingReservationId = null;
let transferFromId = null;

/* 学習結果の記録フォームを開いているコマのID */
let expandedLogIds = new Set();


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

function saveCancelLogs() {
    saveJSON("patgs27_cancel_logs", cancelLogs);
}

function saveDayTypeOverrides() {
    saveJSON("patgs27_day_type_overrides", dayTypeOverrides);
}


function dayTypeOf(dateKey) {

    if (dayTypeOverrides[dateKey]) {
        return dayTypeOverrides[dateKey];
    }

    const day = new Date(dateKey + "T00:00:00").getDay();

    return (day === 0 || day === 6) ? "holiday" : "weekday";
}

function dayTypeLabel(dateKey) {
    return dayTypeOf(dateKey) === "holiday" ? "土休日" : "平日";
}

function slotListFor(dateKey, type) {
    const table = type === "exam" ? EXAM_SLOTS : NORMAL_SLOTS;
    return table[dayTypeOf(dateKey)] || [];
}

function reservationType(record) {
    return record.type === "exam" ? "exam" : "normal";
}

function reservationDuration(record) {
    return TYPE_DURATION[reservationType(record)];
}

function komaValue(record) {
    return TYPE_KOMA[reservationType(record)];
}

function reservationStart(record) {
    return new Date(record.date + "T" + (record.time || "00:00") + ":00");
}

function reservationTimeText(record) {
    const start = timeToMinutes(record.time);
    return record.time + "〜" + minutesToTime(start + reservationDuration(record));
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


/* 重なりの判定（模試と通常が重なる枠は取れない） */

function isSlotBusy(dateKey, time, type, ignoreId) {

    const start = timeToMinutes(time);
    const end = start + TYPE_DURATION[type];

    return reservations.some(function (record) {

        if (record.date !== dateKey) {
            return false;
        }

        if (record.id === ignoreId) {
            return false;
        }

        if (record.status === "missed") {
            return false;
        }

        const otherStart = timeToMinutes(record.time);
        const otherEnd = otherStart + reservationDuration(record);

        return start < otherEnd && otherStart < end;
    });
}


/* =========================================================
   予約フォーム
   ========================================================= */

function currentFormDate() {
    return $("resDate")?.value || todayKey();
}

function currentFormType() {
    return $("resType")?.value === "exam" ? "exam" : "normal";
}

function syncDayTypeControls() {

    const dateKey = currentFormDate();
    const type = dayTypeOf(dateKey);

    if ($("resDayType")) {
        $("resDayType").value = type;
    }

    if ($("resHolidayCheck")) {
        $("resHolidayCheck").checked = (type === "holiday");
    }
}

function setDayTypeOverride(dateKey, type) {

    const day = new Date(dateKey + "T00:00:00").getDay();
    const natural = (day === 0 || day === 6) ? "holiday" : "weekday";

    if (type === natural) {
        delete dayTypeOverrides[dateKey];
    } else {
        dayTypeOverrides[dateKey] = type;
    }

    saveDayTypeOverrides();
}


function renderTimeOptions() {

    const select = $("resTime");

    if (!select) {
        return;
    }

    const previous = select.value;
    const dateKey = currentFormDate();
    const type = currentFormType();
    const slots = slotListFor(dateKey, type);

    select.innerHTML = "";

    const nowMinutes = new Date().getHours() * 60 + new Date().getMinutes();
    const isToday = dateKey === todayKey();

    slots.forEach(function (time) {

        const option = document.createElement("option");
        option.value = time;

        const busy = isSlotBusy(dateKey, time, type, editingReservationId);
        const past = isToday && timeToMinutes(time) < nowMinutes;

        option.textContent =
            time + "〜" + minutesToTime(timeToMinutes(time) + TYPE_DURATION[type]) +
            (busy ? "（予約済）" : past ? "（過ぎた枠）" : "");

        option.disabled = busy;

        select.appendChild(option);
    });

    if (slots.includes(previous)) {
        select.value = previous;
    } else {

        const firstFree = slots.find(function (time) {
            return (
                !isSlotBusy(dateKey, time, type, editingReservationId) &&
                !(isToday && timeToMinutes(time) < nowMinutes)
            );
        });

        select.value = firstFree || slots[0] || "";
    }
}


function readReservationForm() {
    return {
        date: $("resDate")?.value || "",
        time: $("resTime")?.value || "",
        type: currentFormType(),
        subject: $("resSubject")?.value || "",
        material: $("resMaterial")?.value.trim() || "",
        content: $("resContent")?.value.trim() || "",
        range: $("resRange")?.value.trim() || "",
        goal: $("resGoal")?.value.trim() || ""
    };
}

function fillReservationForm(record) {

    if ($("resDate")) { $("resDate").value = record.date || ""; }
    if ($("resType")) { $("resType").value = reservationType(record); }

    syncDayTypeControls();
    renderTimeOptions();

    if ($("resTime")) { $("resTime").value = record.time || $("resTime").value; }
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

    renderTimeOptions();
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

    if (!slotListFor(values.date, values.type).includes(values.time)) {
        return (
            "その時刻は" + dayTypeLabel(values.date) + "の" +
            TYPE_LABEL[values.type] + "の固定枠にありません。"
        );
    }

    if (isSlotBusy(values.date, values.time, values.type, ignoreId)) {
        return "その時間帯にはすでに別のコマがあります（模試と通常コマは重ねられません）。";
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
        target:
            formatShortDate(record.date) + " " + reservationTimeText(record) +
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

            if (!confirm("開始2時間を切っています。変更は記録に残りますが、変更しますか？")) {
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
        type: values.type,
        subject: values.subject,
        material: values.material,
        content: values.content,
        range: values.range,
        goal: values.goal,
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

    setFormStatus(origin ? "振替のコマを予約しました。" : "予約しました。", false);

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

    if (reservationType(record) === "normal") {

        startTimer(
            TYPE_DURATION.normal,
            formatShortDate(record.date) + " " + record.time + " " + (record.subject || ""),
            record.id
        );
    }
}

function celebrateCompletion() {

    const box = $("nextReservationBox");

    if (!box) {
        return;
    }

    box.classList.add("celebrate");

    setTimeout(function () {
        box.classList.remove("celebrate");
    }, 700);
}

function completeReservation(record) {

    record.status = "done";
    record.completedAt = nowText();

    saveReservations();
    renderKomaAll();
    renderStudyHeatmap();
    celebrateCompletion();

    if (typeof growSubject === "function" && reservationType(record) === "normal") {
        growSubject(record.subject);
    }

    if (typeof checkBadges === "function") {
        checkBadges();
    }
}

function reopenReservation(record) {

    record.status = "reserved";
    record.completedAt = "";

    saveReservations();
    renderKomaAll();
}

function removeReservation(record, reason) {

    if (reason) {

        cancelLogs.push({
            dateTime: nowText(),
            target:
                formatShortDate(record.date) + " " + reservationTimeText(record) +
                " " + (record.subject || "") + "（" + TYPE_LABEL[reservationType(record)] + "）",
            reason: reason
        });

        if (cancelLogs.length > 100) {
            cancelLogs = cancelLogs.slice(cancelLogs.length - 100);
        }

        saveCancelLogs();
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

    setFormStatus("予約を編集しています。直したら「この内容に変更する」を押してください。", false);

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
        "）の枠を選んでください。",
        false
    );

    $("resDate")?.scrollIntoView({ behavior: "smooth", block: "center" });
}


/* =========================================================
   コマの表示
   ========================================================= */

function buildCancelPanel(record, box) {

    const panel = document.createElement("div");
    panel.className = "koma-actions";

    const select = document.createElement("select");

    const empty = document.createElement("option");
    empty.value = "";
    empty.textContent = "取り消す理由を選ぶ";
    select.appendChild(empty);

    CANCEL_REASONS.forEach(function (reason) {
        const option = document.createElement("option");
        option.value = reason;
        option.textContent = reason;
        select.appendChild(option);
    });

    const confirmButton = makeButton("取り消しを確定", "primary");

    confirmButton.addEventListener("click", function () {

        if (!select.value) {
            alert("理由を選んでください。");
            return;
        }

        if (!isWithinFreeChange(record) && record.status === "reserved") {
            recordChangeLog(record, "2時間前以降の取り消し");
        }

        removeReservation(record, select.value);
    });

    const backButton = makeButton("やめる", "ghost");

    backButton.addEventListener("click", function () {
        renderKomaAll();
    });

    panel.append(select, confirmButton, backButton);

    box.appendChild(panel);
}


function buildLogForm(record) {

    const form = document.createElement("div");
    form.className = "koma-log-form";

    const content = document.createElement("input");
    content.type = "text";
    content.placeholder = "今回の学習内容（例：二次関数 問題1〜10）";
    content.value = record.log?.content || "";

    const scoreRow = document.createElement("div");
    scoreRow.className = "koma-log-score-row";

    const totalLabel = document.createElement("label");
    totalLabel.className = "koma-log-num-label";
    totalLabel.textContent = "総問題数";

    const total = document.createElement("input");
    total.type = "number";
    total.min = "0";
    total.step = "1";
    total.value = record.log?.totalQuestions || "";

    totalLabel.appendChild(total);

    const correctLabel = document.createElement("label");
    correctLabel.className = "koma-log-num-label";
    correctLabel.textContent = "正解数";

    const correct = document.createElement("input");
    correct.type = "number";
    correct.min = "0";
    correct.step = "1";
    correct.value = record.log?.correctCount || "";

    correctLabel.appendChild(correct);

    scoreRow.append(totalLabel, correctLabel);

    const rateNote = document.createElement("p");
    rateNote.className = "sub koma-log-rate-note";

    function updateRateNote() {

        const t = Number(total.value) || 0;
        const c = Number(correct.value) || 0;

        if (t <= 0) {
            rateNote.textContent = "";
            return;
        }

        const rate = Math.round((c / t) * 100);

        rateNote.textContent =
            "正答率 " + rate + "%" +
            (rate < 60 ? "（60%未満のため、理解・解決が必要な状態として判定されます）" : "");
    }

    total.addEventListener("input", updateRateNote);
    correct.addEventListener("input", updateRateNote);
    updateRateNote();

    const result = document.createElement("input");
    result.type = "text";
    result.placeholder = "結果（例：8/10正解。空欄なら上の数字から自動作成）";
    result.value = record.log?.result || "";

    const learned = document.createElement("textarea");
    learned.rows = 2;
    learned.placeholder = "分かったこと・できるようになったこと";
    learned.value = record.log?.learned || "";

    const unresolved = document.createElement("textarea");
    unresolved.rows = 2;
    unresolved.placeholder = "未解決・まだ分からないこと（例：8・9番）";
    unresolved.value = record.log?.unresolved || "";

    const resolveSelect = document.createElement("select");

    const noneOption = document.createElement("option");
    noneOption.value = "";
    noneOption.textContent = "この未解決を解決する（任意）";
    resolveSelect.appendChild(noneOption);

    reservations
        .filter(function (item) {
            return (
                item.id !== record.id &&
                item.log && item.log.unresolved && !item.log.resolved
            );
        })
        .sort(sortByStart)
        .forEach(function (item) {

            const option = document.createElement("option");
            option.value = item.id;
            option.textContent =
                formatShortDate(item.date) + " " + (item.subject || "") +
                "：未解決 " + item.log.unresolved;

            resolveSelect.appendChild(option);
        });

    resolveSelect.value = record.log?.resolvesId || "";

    const saveButton = makeButton("保存", "primary");
    const closeButton = makeButton("閉じる", "ghost");

    saveButton.addEventListener("click", function () {

        const resolvesId = resolveSelect.value || null;

        const totalQuestions = Number(total.value) || 0;
        const correctCount = Number(correct.value) || 0;
        const hasScore = totalQuestions > 0;
        const rate = hasScore ? Math.round((correctCount / totalQuestions) * 100) : null;
        const needsReview = hasScore ? rate < 60 : false;

        let resultText = result.value.trim();

        if (!resultText && hasScore) {
            resultText = correctCount + "/" + totalQuestions + "正解（" + rate + "%）";
        }

        record.log = {
            content: content.value.trim(),
            totalQuestions: totalQuestions,
            correctCount: correctCount,
            rate: rate,
            needsReview: needsReview,
            result: resultText,
            learned: learned.value.trim(),
            unresolved: unresolved.value.trim(),
            resolved: record.log?.resolved || false,
            resolvesId: resolvesId,
            loggedAt: nowText()
        };

        if (resolvesId) {

            const target = findReservation(resolvesId);

            if (target && target.log) {
                target.log.resolved = true;

                if (typeof checkBadges === "function") {
                    checkBadges();
                }
            }
        }

        saveReservations();

        if (typeof playChime === "function") {
            playChime("save");
        }

        if (typeof checkBadges === "function") {
            checkBadges();
        }

        expandedLogIds.delete(record.id);

        /* 通常演習コマで結果を入力した場合は、保存後に進行選択を出す */
        if (reservationType(record) === "normal" && hasScore) {
            postSaveChoiceId = record.id;
        }

        renderKomaAll();
    });

    closeButton.addEventListener("click", function () {
        expandedLogIds.delete(record.id);
        renderKomaAll();
    });

    form.append(content, scoreRow, rateNote, result, learned, unresolved, resolveSelect);

    const btnRow = document.createElement("div");
    btnRow.className = "btn-row";
    btnRow.append(saveButton, closeButton);

    form.appendChild(btnRow);

    return form;
}


/* =========================================================
   結果判定後の進行選択（理解・解決枠へ／次へ／同じ内容を再予約）
   ========================================================= */

let postSaveChoiceId = null;

function prefillReservationForm(subject, material, content, range, goal) {

    if ($("resSubject")) { $("resSubject").value = subject || ""; }
    if ($("resMaterial")) { $("resMaterial").value = material || ""; }
    if ($("resContent")) { $("resContent").value = content || ""; }
    if ($("resRange")) { $("resRange").value = range || ""; }
    if ($("resGoal")) { $("resGoal").value = goal || ""; }

    setFormStatus("日時を選んで予約してください。", false);

    $("resDate")?.scrollIntoView({ behavior: "smooth", block: "center" });
}

function buildPostSaveChoice(record) {

    const box = document.createElement("div");
    box.className = "koma-post-choice";

    const needsReview = !!record.log?.needsReview;

    const heading = document.createElement("p");
    heading.className = "sub";
    heading.textContent = needsReview
        ? "正答率60%未満でした。理解・解決枠へ進むのがおすすめです。"
        : "結果を記録しました。次の行動を選んでください。";

    box.appendChild(heading);

    const actions = document.createElement("div");
    actions.className = "btn-row";

    const reviewButton = makeButton("理解・解決枠へ進む", needsReview ? "primary" : "");
    reviewButton.addEventListener("click", function () {

        prefillReservationForm(
            record.subject,
            record.material,
            "理解・解決：" + (record.log?.content || record.content || ""),
            record.range,
            "未解決（" + (record.log?.unresolved || "") + "）を解決する"
        );

        postSaveChoiceId = null;
        renderKomaAll();
    });

    const nextButton = makeButton("次に進む", needsReview ? "" : "primary");
    nextButton.addEventListener("click", function () {
        postSaveChoiceId = null;
        renderKomaAll();
    });

    const rebookButton = makeButton("同じ内容を再度予約する");
    rebookButton.addEventListener("click", function () {

        prefillReservationForm(
            record.subject,
            record.material,
            record.content,
            record.range,
            record.goal
        );

        postSaveChoiceId = null;
        renderKomaAll();
    });

    actions.append(reviewButton, nextButton, rebookButton);
    box.appendChild(actions);

    return box;
}


function buildKomaCard(record, options) {

    const settings = options || {};

    const box = document.createElement("div");
    box.dataset.resId = record.id;

    box.className =
        "koma " +
        (record.status === "done" ? "done" :
            record.status === "missed" ? "missed" :
                record.status === "running" ? "running" : "") +
        (record.rescheduledTo ? " moved" : "");

    const head = document.createElement("div");
    head.className = "koma-head";

    if (record.status === "reserved" && SUBJECT_COLORS[record.subject]) {
        box.style.borderLeftColor = SUBJECT_COLORS[record.subject];
    }

    const time = document.createElement("span");
    time.className = "koma-time";
    time.textContent = formatShortDate(record.date) + " " + reservationTimeText(record);

    const subject = document.createElement("span");
    subject.className = "koma-subject";
    subject.textContent = record.subject || "科目未設定";

    const typeTag = document.createElement("span");
    typeTag.className = "koma-tag";
    typeTag.textContent = TYPE_LABEL[reservationType(record)];

    const status = document.createElement("span");
    status.className = "koma-tag";
    status.textContent = statusLabel(record);

    head.append(time, subject, typeTag, status);

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

        const cancelButton = makeButton("取り消す", "ghost");
        cancelButton.addEventListener("click", function () {
            actions.remove();
            buildCancelPanel(record, box);
        });

        actions.append(startButton, doneButton, editButton, cancelButton);
    }

    if (record.status === "running") {

        const doneButton = makeButton("完了", "primary");
        doneButton.addEventListener("click", function () {
            completeReservation(record);
        });

        const cancelButton = makeButton("取り消す", "ghost");
        cancelButton.addEventListener("click", function () {
            actions.remove();
            buildCancelPanel(record, box);
        });

        actions.append(doneButton, cancelButton);
    }

    if (record.status === "done") {

        const undoButton = makeButton("完了を取り消す", "ghost");
        undoButton.addEventListener("click", function () {
            reopenReservation(record);
        });

        const deleteButton = makeButton("削除", "ghost");
        deleteButton.addEventListener("click", function () {

            if (confirm("この記録を削除しますか？")) {
                removeReservation(record, "");
            }
        });

        actions.append(undoButton, deleteButton);
    }

    if (record.status === "missed") {

        if (settings.showMissedTools) {

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

            if (confirm("この未実行の記録を削除しますか？")) {
                removeReservation(record, "");
            }
        });

        actions.appendChild(deleteButton);
    }

    box.appendChild(actions);

    /* 開始困難のときだけ、原因を書ける欄を出す */

    if (record.status === "missed" &&
        record.missedCategory === "開始困難" &&
        settings.showMissedTools) {

        const reasonLabel = document.createElement("label");
        reasonLabel.className = "hard-reason";
        reasonLabel.textContent = "何が原因で始められなかった？";

        const reasonInput = document.createElement("input");
        reasonInput.type = "text";
        reasonInput.placeholder = "例：スマホを触っていた／気分が重かった";
        reasonInput.value = record.hardReason || "";

        reasonInput.addEventListener("input", function () {
            record.hardReason = reasonInput.value;
            saveReservations();
        });

        reasonLabel.appendChild(reasonInput);

        box.appendChild(reasonLabel);
    }

    /* =========================================================
       学習結果の記録（コマ終了時の記録・未解決の紐付け）
       ========================================================= */

    const logSection = document.createElement("div");
    logSection.className = "koma-log";

    if (record.log && (record.log.content || record.log.result || record.log.learned || record.log.unresolved)) {

        const summary = document.createElement("p");
        summary.className = "koma-log-summary";

        summary.textContent = [
            record.log.content ? "内容：" + record.log.content : "",
            record.log.result ? "結果：" + record.log.result : "",
            record.log.learned ? "わかったこと：" + record.log.learned : "",
            record.log.unresolved
                ? "未解決：" + record.log.unresolved + (record.log.resolved ? "（解決済み）" : "")
                : ""
        ].filter(Boolean).join("\n");

        logSection.appendChild(summary);

        if (record.log.rate !== null && record.log.rate !== undefined) {

            const rateTag = document.createElement("span");
            rateTag.className = "koma-tag" + (record.log.needsReview ? " kind-exam" : " kind-personal");
            rateTag.textContent =
                "正答率 " + record.log.rate + "%" +
                (record.log.needsReview ? "・理解解決が必要" : "");

            logSection.appendChild(rateTag);
        }

        if (record.log.resolvesId) {

            const source = findReservation(record.log.resolvesId);

            if (source && source.log) {

                const refTag = document.createElement("p");
                refTag.className = "sub";
                refTag.textContent =
                    "解決対象：" + formatShortDate(source.date) + " " +
                    (source.subject || "") + "の未解決（" + (source.log.unresolved || "") + "）";

                logSection.appendChild(refTag);
            }
        }
    }

    if (postSaveChoiceId === record.id) {
        logSection.appendChild(buildPostSaveChoice(record));
    }

    const logToggle = makeButton(
        (record.log && record.log.loggedAt) ? "学習結果を編集" : "📝 学習結果を記録",
        "ghost"
    );

    logToggle.addEventListener("click", function () {

        if (expandedLogIds.has(record.id)) {
            expandedLogIds.delete(record.id);
        } else {
            expandedLogIds.add(record.id);
        }

        renderKomaAll();
    });

    logSection.appendChild(logToggle);

    if (expandedLogIds.has(record.id)) {
        logSection.appendChild(buildLogForm(record));
    }

    box.appendChild(logSection);

    return box;
}


function sortByStart(a, b) {
    return (a.date + a.time).localeCompare(b.date + b.time);
}


function renderReservationLists() {

    const today = todayKey();
    const weekEnd = addDaysToKey(getWeekStartKey(today), 6);

    const groups = [
        {
            id: "todayReservationList",
            filter: function (r) { return r.date === today; },
            empty: "今日の予約はありません。"
        },
        {
            id: "weekReservationList",
            filter: function (r) { return r.date > today && r.date <= weekEnd; },
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


function renderHardStartNotice() {

    const container = $("hardStartNotice");

    if (!container) {
        return;
    }

    container.innerHTML = "";

    const count = reservations.filter(function (record) {
        return record.missedCategory === "開始困難";
    }).length;

    const reached = HARD_START_MILESTONES
        .filter(function (milestone) { return count >= milestone; })
        .pop();

    if (!reached) {
        return;
    }

    const note = document.createElement("p");
    note.className = "weekly-notice";

    note.textContent =
        "開始困難 " + reached + "回到達。" +
        (reached >= 10
            ? "枠の置き方そのものを組み直す段階です。週次レビューで作り直しましょう。"
            : reached >= 5
                ? "同じ時間帯が続いていないか、週次レビューで確認しましょう。"
                : "原因の記録を見返して、始めやすい形に変えてみましょう。");

    container.appendChild(note);
}


function renderMissedList() {

    const container = $("missedList");

    if (!container) {
        return;
    }

    container.innerHTML = "";

    const list = reservations
        .filter(function (record) { return record.status === "missed"; })
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
                reservationStart(record).getTime() + MISSED_AFTER_MINUTES * 60000 >= now
            );
        })
        .sort(sortByStart)[0];

    if (!next) {
        box.className = "next-koma is-empty";
        box.textContent = "次の予約はありません。コマ予約か空き枠検索から入れられます。";
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
        "　" + TYPE_LABEL[reservationType(next)] +
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


/* =========================================================
   集計
   ========================================================= */

function getWeekReservations(weekStartKey) {

    const endKey = addDaysToKey(weekStartKey, 6);

    return reservations.filter(function (record) {
        return record.date >= weekStartKey && record.date <= endKey;
    });
}

function sumKoma(list, status) {

    return list
        .filter(function (record) {
            return status ? record.status === status : true;
        })
        .reduce(function (total, record) {
            return total + komaValue(record);
        }, 0);
}

function getWeekStats(weekStartKey) {

    const list = getWeekReservations(weekStartKey);

    const required = Number(weekRequired[weekStartKey]) || 0;
    const done = sumKoma(list, "done");

    return {
        week: weekStartKey,
        required: required,
        reserved: sumKoma(list, null),
        done: done,
        missed: sumKoma(list, "missed"),
        moved: list.filter(function (r) { return !!r.rescheduledTo; }).length,
        shortage: Math.max(0, required - done)
    };
}

function getDayStats(dateKey) {

    const list = reservations.filter(function (record) {
        return record.date === dateKey;
    });

    return {
        reserved: sumKoma(list, null),
        done: sumKoma(list, "done"),
        missed: sumKoma(list, "missed"),
        moved: list.filter(function (r) { return !!r.rescheduledTo; }).length
    };
}

function getDoneKomaForDate(dateKey) {

    const fromReservations = reservations
        .filter(function (record) {
            return record.date === dateKey && record.status === "done";
        })
        .reduce(function (total, record) {
            return total + komaValue(record);
        }, 0);

    const legacy = loadJSON("patgs27_subject_today_" + dateKey, {});

    let legacyTotal = 0;

    Object.keys(legacy).forEach(function (key) {
        legacyTotal += Number(legacy[key]) || 0;
    });

    return fromReservations + legacyTotal;
}

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


function renderTopStats() {

    const today = todayKey();
    const weekStart = getWeekStartKey(today);

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
            formatShortDate(weekStart) + "〜" + formatShortDate(addDaysToKey(weekStart, 6));
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
            formatShortDate(debt.week) + "の週：" + debt.koma + "コマ" +
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


function renderLogList(containerId, list, emptyText, formatter) {

    const container = $(containerId);

    if (!container) {
        return;
    }

    container.innerHTML = "";

    if (list.length === 0) {
        const empty = document.createElement("p");
        empty.className = "empty-note";
        empty.textContent = emptyText;
        container.appendChild(empty);
        return;
    }

    list.slice().reverse().slice(0, 20).forEach(function (item) {

        const row = document.createElement("p");
        row.className = "sub";
        row.textContent = formatter(item);

        container.appendChild(row);
    });
}


function renderCancelLogs() {

    renderLogList(
        "cancelLogList",
        cancelLogs,
        "取り消しの記録はありません。",
        function (log) {
            return log.dateTime + "｜" + log.target + "｜" + log.reason;
        }
    );
}

function renderChangeLogs() {

    renderLogList(
        "changeLogList",
        changeLogs,
        "記録はありません。",
        function (log) {
            return log.dateTime + "｜" + log.target + "｜" + log.action;
        }
    );
}


/* =========================================================
   空き枠検索
   ========================================================= */

function renderSlotSearch() {

    const container = $("searchResult");

    if (!container) {
        return;
    }

    container.innerHTML = "";

    const dateKey = $("searchDate")?.value || todayKey();
    const type = $("searchType")?.value === "exam" ? "exam" : "normal";

    if (dateKey < todayKey()) {
        const note = document.createElement("p");
        note.className = "form-status error";
        note.textContent = "過去の日付は検索できません。";
        container.appendChild(note);
        return;
    }

    const heading = document.createElement("p");
    heading.className = "sub";
    heading.textContent =
        formatShortDate(dateKey) + "／" + dayTypeLabel(dateKey) + "／" +
        TYPE_LABEL[type] + " の空き枠";

    container.appendChild(heading);

    const isToday = dateKey === todayKey();
    const nowMinutes = new Date().getHours() * 60 + new Date().getMinutes();

    const free = slotListFor(dateKey, type).filter(function (time) {
        return (
            !isSlotBusy(dateKey, time, type, null) &&
            !(isToday && timeToMinutes(time) < nowMinutes)
        );
    });

    if (free.length === 0) {
        const empty = document.createElement("p");
        empty.className = "empty-note";
        empty.textContent = "空いている枠はありません。";
        container.appendChild(empty);
        return;
    }

    const grid = document.createElement("div");
    grid.className = "slot-grid";

    free.forEach(function (time) {

        const button = makeButton(
            time + "〜" + minutesToTime(timeToMinutes(time) + TYPE_DURATION[type])
        );

        button.addEventListener("click", function () {

            if ($("resDate")) { $("resDate").value = dateKey; }
            if ($("resType")) { $("resType").value = type; }

            syncDayTypeControls();
            renderTimeOptions();

            if ($("resTime")) { $("resTime").value = time; }

            setFormStatus(
                formatShortDate(dateKey) + " " + time + " を選びました。科目と内容を入れて予約してください。",
                false
            );

            $("resDate")?.scrollIntoView({ behavior: "smooth", block: "center" });
        });

        grid.appendChild(button);
    });

    container.appendChild(grid);
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
            reservationStart(record).getTime() + MISSED_AFTER_MINUTES * 60000;

        if (now >= limit) {

            record.status = "missed";
            record.missedCategory = record.missedCategory || "";
            record.missedAt = nowText();

            changed = true;

            sendPatgsNotification(
                "⏳ 未実行になりました",
                formatShortDate(record.date) + " " + reservationTimeText(record) + "　" +
                (record.subject || "") + "　" +
                (record.content || "内容未設定") +
                (record.range ? "　" + record.range : "") +
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
   教科別 完了コマのグラフ
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

        const subject = KOMA_SUBJECTS.includes(record.subject) ? record.subject : "その他";

        counts[subject] += komaValue(record);
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
   コマ関連のまとめ描画
   ========================================================= */

function renderUnresolvedList() {

    const container = $("unresolvedList");

    if (!container) {
        return;
    }

    container.innerHTML = "";

    const items = reservations
        .filter(function (record) {
            return record.log && record.log.unresolved && !record.log.resolved;
        })
        .sort(sortByStart)
        .reverse();

    if (items.length === 0) {
        const empty = document.createElement("p");
        empty.className = "empty-note";
        empty.textContent = "未解決の記録はありません。";
        container.appendChild(empty);
        return;
    }

    items.forEach(function (record) {

        const row = document.createElement("p");
        row.className = "sub";
        row.textContent =
            formatShortDate(record.date) + " " + (record.subject || "") +
            "：未解決 " + record.log.unresolved;

        container.appendChild(row);
    });
}


/* =========================================================
   学習メモ
   ========================================================= */

let studyMemos = loadJSON("patgs27_study_memos", []);

function saveStudyMemos() {
    saveJSON("patgs27_study_memos", studyMemos);
}

function renderMemos() {

    const list = $("memoList");

    if (!list) {
        return;
    }

    list.innerHTML = "";

    if (studyMemos.length === 0) {
        const empty = document.createElement("p");
        empty.className = "empty-note";
        empty.textContent = "メモはまだありません。";
        list.appendChild(empty);
        return;
    }

    studyMemos.slice().reverse().forEach(function (item, reverseIndex) {

        const index = studyMemos.length - 1 - reverseIndex;

        const row = document.createElement("div");
        row.className = "koma";

        const head = document.createElement("div");
        head.className = "koma-head";

        const tag = document.createElement("span");
        tag.className = "koma-tag";
        tag.textContent = item.category || "その他";

        const dateTag = document.createElement("span");
        dateTag.className = "sub";
        dateTag.textContent = clockOnly(item.dateTime);

        head.append(tag, dateTag);

        const text = document.createElement("p");
        text.className = "koma-detail";
        text.textContent = item.text || "";

        const deleteButton = makeButton("削除", "ghost");

        deleteButton.addEventListener("click", function () {
            studyMemos.splice(index, 1);
            saveStudyMemos();
            renderMemos();
        });

        row.append(head, text, deleteButton);

        list.appendChild(row);
    });
}

$("addMemoBtn")?.addEventListener("click", function () {

    const category = $("memoCategory")?.value || "その他";
    const text = $("memoText")?.value.trim() || "";

    if (!text) {
        alert("内容を入力してください。");
        return;
    }

    studyMemos.push({
        category: category,
        text: text,
        dateTime: nowText()
    });

    saveStudyMemos();

    if ($("memoText")) { $("memoText").value = ""; }

    renderMemos();

    if (typeof playChime === "function") {
        playChime("save");
    }

    if (typeof checkBadges === "function") {
        checkBadges();
    }
});

function renderKomaAll() {

    closeFinishedWeeks();

    renderNextReservation();
    renderTopStats();
    renderReservationLists();
    renderHardStartNotice();
    renderMissedList();
    renderDebts();
    renderCancelLogs();
    renderChangeLogs();
    renderWeekSummary();
    renderSubjectKomaChart();
    renderWeeklyKomaReport();
    renderTimeOptions();
    renderUnresolvedList();

    if (typeof renderCalendarAll === "function") {
        renderCalendarAll();
    }

    if (typeof renderMapBoard === "function") {
        renderMapBoard();
    }
}


/* =========================================================
   予約フォームのイベント
   ========================================================= */

function setupReservationForm() {

    if ($("resDate")) {
        $("resDate").value = todayKey();
        $("resDate").min = todayKey();
        $("resDate").max = getDateKeyOffset(RESERVATION_LIMIT_DAYS);
    }

    if ($("searchDate")) {
        $("searchDate").value = todayKey();
        $("searchDate").min = todayKey();
        $("searchDate").max = getDateKeyOffset(RESERVATION_LIMIT_DAYS);
    }

    if ($("lsDate")) {
        $("lsDate").value = todayKey();
    }

    syncDayTypeControls();
    renderTimeOptions();

    $("resDate")?.addEventListener("change", function () {
        syncDayTypeControls();
        renderTimeOptions();
    });

    $("resType")?.addEventListener("change", renderTimeOptions);

    $("resDayType")?.addEventListener("change", function () {
        setDayTypeOverride(currentFormDate(), $("resDayType").value);
        syncDayTypeControls();
        renderTimeOptions();
    });

    $("resHolidayCheck")?.addEventListener("change", function () {
        setDayTypeOverride(
            currentFormDate(),
            $("resHolidayCheck").checked ? "holiday" : "weekday"
        );
        syncDayTypeControls();
        renderTimeOptions();
    });

    $("addReservationBtn")?.addEventListener("click", submitReservationForm);

    $("cancelEditBtn")?.addEventListener("click", function () {
        resetReservationFormMode();
        setFormStatus("", false);
    });

    $("searchSlotBtn")?.addEventListener("click", renderSlotSearch);

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
   週次レビュー
   ========================================================= */

function updateWeeklyNotice() {

    const isSaturday = new Date().getDay() === 6;

    const message = isSaturday ? "🔔 本日は週次レビュー日です。" : "";

    if ($("weeklyReviewNoticeLarge")) {
        $("weeklyReviewNoticeLarge").textContent = message;
    }
}

function renderWeeklyKomaReport() {

    const box = $("weeklyKomaReport");

    if (!box) {
        return;
    }

    const weekStart = getWeekStartKey(todayKey());
    const weekEnd = addDaysToKey(weekStart, 6);
    const stats = getWeekStats(weekStart);

    const lsCount = lsRecords.filter(function (record) {
        return record.date >= weekStart && record.date <= weekEnd;
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

    const cancelCount = cancelLogs.filter(function (log) {
        return true;
    }).length;

    box.innerHTML =
        "今週のコマ決算（" + formatShortDate(weekStart) + "〜" +
        formatShortDate(weekEnd) + "）<br>" +
        "必要 <strong>" + stats.required + "</strong>／" +
        "完了 <strong>" + stats.done + "</strong>／" +
        "未実行 <strong>" + stats.missed + "</strong>／" +
        "振替 <strong>" + stats.moved + "</strong>／" +
        "債務 <strong>" + openDebt + "</strong>／" +
        "LS <strong>" + lsCount + "</strong><br>" +
        "未実行の内訳：" + categoryText + "<br>" +
        "取り消しの記録：" + cancelCount + "件（理由は「取り消し・変更の記録」で確認）";
}


/* =========================================================
   通知
   ========================================================= */

const HOURLY_START_HOUR = 6;
const HOURLY_END_HOUR = 23;
const WEEKLY_REVIEW_REMINDER_DAY = 6; /* 0=日 … 6=土 */
const WEEKLY_REVIEW_REMINDER_HOUR = 8;
const PRE_NOTICE_MINUTES = 5;

let patgsServiceWorkerReady = null;

if ("serviceWorker" in navigator) {

    const patgsHadController = !!navigator.serviceWorker.controller;

    patgsServiceWorkerReady = navigator.serviceWorker
        .register("sw.js?v=" + PATGS_VERSION)
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
            "✓ 通知は有効です。このページを開いている間、予約と毎時00分に届きます。";
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

function reservationBody(record) {

    return [
        formatShortDate(record.date) + " " + reservationTimeText(record),
        TYPE_LABEL[reservationType(record)],
        record.subject || "科目未設定",
        record.material,
        record.content,
        record.range,
        record.goal ? "目標：" + record.goal : ""
    ].filter(Boolean).join("　");
}


/* 予約の5分前・開始時刻 */

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

        if (!record.notified.pre &&
            now >= start - PRE_NOTICE_MINUTES * 60000 &&
            now < start) {

            sendPatgsNotification("⏰ 5分後にコマが始まります", reservationBody(record));

            record.notified.pre = true;
            changed = true;
        }

        if (!record.notified.start && now >= start && now < start + 5 * 60000) {

            sendPatgsNotification("▶ コマの開始時刻です", reservationBody(record));

            record.notified.start = true;
            changed = true;
        }
    });

    if (changed) {
        saveReservations();
    }
}


/* 毎時00分（6:00〜23:00）の学習確認、土曜8:00の週次レビュー */

function checkHourlyNotifications() {

    if (!("Notification" in window) || Notification.permission !== "granted") {
        return;
    }

    const now = new Date();

    if (now.getMinutes() > 4) {
        return;
    }

    const hour = now.getHours();
    const fireKey = todayKey() + "-" + hour;

    if (localStorage.getItem(patgsNamespacedKey("patgs27_last_hourly")) === fireKey) {
        return;
    }

    if (now.getDay() === WEEKLY_REVIEW_REMINDER_DAY &&
        hour === WEEKLY_REVIEW_REMINDER_HOUR) {

        sendPatgsNotification(
            "📅 週次レビューの時間です",
            "今週の必要・完了・未実行・振替・債務を確認しましょう。"
        );

        localStorage.setItem(patgsNamespacedKey("patgs27_last_hourly"), fireKey);
        return;
    }

    if (hour < HOURLY_START_HOUR || hour > HOURLY_END_HOUR) {
        return;
    }

    const day = getDayStats(todayKey());

    const next = reservations
        .filter(function (record) {
            return (
                record.status === "reserved" &&
                reservationStart(record).getTime() >= Date.now()
            );
        })
        .sort(sortByStart)[0];

    sendPatgsNotification(
        "📚 学習していますか？",
        "今日：完了 " + day.done + " ／ 予約 " + day.reserved +
        " ／ 未実行 " + day.missed + "　" +
        (next
            ? "次の予約 " + next.time + " " + (next.subject || "")
            : "次の予約はありません。空き枠検索から入れられます。")
    );

    localStorage.setItem(patgsNamespacedKey("patgs27_last_hourly"), fireKey);
}


function tick() {

    const changed = processMissedReservations();

    checkReservationNotifications();
    checkHourlyNotifications();

    renderNextReservation();
    renderTopStats();

    if (changed) {
        renderKomaAll();
    }
}

setInterval(tick, 30 * 1000);


$("enableNotificationBtn")?.addEventListener("click", function () {

    if (!("Notification" in window)) {
        alert("このブラウザは通知に対応していません。");
        return;
    }

    Notification.requestPermission().then(function () {
        updateNotificationStatus();
    });
});


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
        goal: localStorage.getItem(patgsNamespacedKey("goalText")) || "",
        message: localStorage.getItem(patgsNamespacedKey("messageText")) || "",
        result: localStorage.getItem(patgsNamespacedKey("resultText")) || ""
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

    localStorage.setItem(patgsNamespacedKey("goalText"), data.goal);
    localStorage.setItem(patgsNamespacedKey("messageText"), data.message);
    localStorage.setItem(patgsNamespacedKey("resultText"), data.result);

    patgsScheduleSync();
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
            temptations.length > 0 ? "累計 " + temptations.length + " 件" : "未報告";
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
   週次レビュー本文
   ========================================================= */

let weeklyReviews = loadJSON("patgs27_weekly_reviews", []);
let weeklyReviewEditingWeek = null;

function saveWeeklyReviews() {
    saveJSON("patgs27_weekly_reviews", weeklyReviews);
}

/* "YYYY/MM/DD HH:MM" から時刻部分だけを取り出す（例：20:00） */
function clockOnly(text) {

    if (!text) {
        return "";
    }

    const parts = text.split(" ");
    return parts[parts.length - 1] || text;
}

function loadWeeklyReview() {

    weeklyReviewEditingWeek = null;

    const current = weeklyReviews.find(function (item) {
        return item.week === todayKey();
    });

    if ($("weeklyReviewText")) {
        $("weeklyReviewText").value = current?.text || "";
    }

    if ($("weeklyReviewCancelEditBtn")) {
        $("weeklyReviewCancelEditBtn").style.display = "none";
    }
}

function saveWeeklyReview() {

    if (!$("weeklyReviewText")) {
        return;
    }

    const key = weeklyReviewEditingWeek || todayKey();

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

    showSave("weeklyReviewSaveStatus", "✓ 保存しました");

    weeklyReviewEditingWeek = null;

    if ($("weeklyReviewCancelEditBtn")) {
        $("weeklyReviewCancelEditBtn").style.display = "none";
    }

    loadWeeklyReview();
    renderWeeklyReviews();
}

function editWeeklyReview(item) {

    weeklyReviewEditingWeek = item.week;

    if ($("weeklyReviewText")) {
        $("weeklyReviewText").value = item.text || "";
        $("weeklyReviewText").scrollIntoView({ behavior: "smooth", block: "center" });
    }

    if ($("weeklyReviewCancelEditBtn")) {
        $("weeklyReviewCancelEditBtn").style.display = "inline-block";
    }
}

function deleteWeeklyReview(item) {

    if (!confirm("このレビューを削除しますか？")) {
        return;
    }

    weeklyReviews = weeklyReviews.filter(function (i) {
        return i.week !== item.week;
    });

    saveWeeklyReviews();

    if (weeklyReviewEditingWeek === item.week) {
        loadWeeklyReview();
    }

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
        title.textContent = item.week + "｜" + clockOnly(item.updatedAt || item.dateTime || "");

        const text = document.createElement("p");
        text.className = "koma-detail";
        text.textContent = item.text || "（未入力）";

        const actions = document.createElement("div");
        actions.className = "koma-actions";

        const editButton = makeButton("編集", "ghost");
        editButton.addEventListener("click", function () {
            editWeeklyReview(item);
        });

        const deleteButton = makeButton("削除", "ghost");
        deleteButton.addEventListener("click", function () {
            deleteWeeklyReview(item);
        });

        actions.append(editButton, deleteButton);

        box.append(title, text, actions);

        list.appendChild(box);
    });
}

$("weeklyReviewSaveBtn")?.addEventListener("click", saveWeeklyReview);

$("weeklyReviewCancelEditBtn")?.addEventListener("click", function () {
    loadWeeklyReview();
});


/* =========================================================
   予定（カレンダー統合データ）
   ========================================================= */

const DEFAULT_PATGS_SCHEDULE = [
    { id: "summerVacationEnd", name: "夏休み終了", date: "2026-08-26", icon: "🌻" },
    { id: "mockExam1", name: "第1回模試", date: "", icon: "📝" },
    { id: "regularTest", name: "定期テスト", date: "", icon: "📚" },
    { id: "entranceExam", name: "入試", date: "2027-02-16", icon: "🎓" },
    { id: "resultAnnouncement", name: "合格発表", date: "2027-02-26", icon: "🏆" }
];

const CALENDAR_KIND_LABEL = {
    school: "学校行事",
    exam: "テスト・提出物",
    personal: "私用",
    important: "重要予定"
};

const EXAM_TYPE_ICON = {
    "提出物": "📮",
    "テスト": "📝",
    "模試": "📊"
};

function calendarEventIcon(event) {

    if (event.kind === "important") {
        return event.icon || "📅";
    }

    if (event.kind === "school") {
        return "🏫";
    }

    if (event.kind === "exam") {
        return EXAM_TYPE_ICON[event.examType] || "📝";
    }

    return "🧩";
}

function newCalendarEventId() {
    return "cal_" + Date.now() + "_" + Math.floor(Math.random() * 100000);
}

let calendarEvents = loadJSON("patgs27_calendar_events", []);

function saveCalendarEvents() {
    saveJSON("patgs27_calendar_events", calendarEvents);
}

function migrateToCalendarEvents() {

    if (localStorage.getItem(patgsNamespacedKey("patgs27_calendar_migrated"))) {
        return;
    }

    const legacySchedule = loadJSON("patgs27_schedule", null);
    const legacyExams = loadJSON("exams", []);
    const legacyOther = loadJSON("patgs27_other_schedule", []);

    const migrated = [];

    (Array.isArray(legacySchedule) ? legacySchedule : DEFAULT_PATGS_SCHEDULE).forEach(function (item) {

        migrated.push({
            id: newCalendarEventId(),
            date: item.date || "",
            time: "",
            kind: "important",
            icon: item.icon || "📅",
            examType: "",
            title: item.name || "名称未設定",
            done: false
        });
    });

    legacyExams.forEach(function (item) {

        migrated.push({
            id: newCalendarEventId(),
            date: item.date || "",
            time: "",
            kind: "exam",
            icon: "",
            examType: item.type || "提出物",
            title: item.text || "",
            done: !!item.done
        });
    });

    legacyOther.forEach(function (item) {

        migrated.push({
            id: newCalendarEventId(),
            date: "",
            time: "",
            kind: "personal",
            icon: "",
            examType: "",
            title: item.text || "",
            done: !!item.checked
        });
    });

    calendarEvents = calendarEvents.concat(migrated);

    saveCalendarEvents();

    localStorage.setItem(patgsNamespacedKey("patgs27_calendar_migrated"), "1");
}

function eventsForDate(dateKey) {

    return calendarEvents
        .filter(function (event) {
            return event.date === dateKey;
        })
        .sort(function (a, b) {
            return (a.time || "").localeCompare(b.time || "");
        });
}

function refreshAllScheduleViews() {
    renderExams();
    renderOtherSchedules();
    renderScheduleSettings();
    updateSchedule();

    if (typeof renderCalendarAll === "function") {
        renderCalendarAll();
    }
}


/* =========================================================
   テスト・提出物
   ========================================================= */

function renderExams() {

    const list = $("examList");

    if (!list) {
        return;
    }

    list.innerHTML = "";

    const items = calendarEvents.filter(function (event) {
        return event.kind === "exam";
    });

    items.forEach(function (event) {

        const row = document.createElement("div");

        const type = document.createElement("select");

        ["提出物", "テスト", "模試"].forEach(function (value) {
            const option = document.createElement("option");
            option.value = value;
            option.textContent = value;
            type.appendChild(option);
        });

        type.value = event.examType || "提出物";

        const date = document.createElement("input");
        date.type = "date";
        date.value = event.date || "";

        const text = document.createElement("input");
        text.type = "text";
        text.value = event.title || "";
        text.placeholder = "内容";

        const done = document.createElement("input");
        done.type = "checkbox";
        done.checked = !!event.done;

        const deleteButton = makeButton("削除", "ghost");

        function save() {
            event.examType = type.value;
            event.date = date.value;
            event.title = text.value;
            event.done = done.checked;
            saveCalendarEvents();

            if (typeof renderCalendarAll === "function") {
                renderCalendarAll();
            }
        }

        type.addEventListener("change", save);
        date.addEventListener("change", save);
        text.addEventListener("input", save);
        done.addEventListener("change", save);

        deleteButton.addEventListener("click", function () {

            calendarEvents = calendarEvents.filter(function (item) {
                return item.id !== event.id;
            });

            saveCalendarEvents();
            refreshAllScheduleViews();
        });

        row.append(type, date, text, done, document.createTextNode("完了"), deleteButton);

        list.appendChild(row);
    });
}

$("addExamBtn")?.addEventListener("click", function () {

    calendarEvents.push({
        id: newCalendarEventId(),
        date: "",
        time: "",
        kind: "exam",
        icon: "",
        examType: "提出物",
        title: "",
        done: false
    });

    saveCalendarEvents();
    refreshAllScheduleViews();
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

function renderOtherSchedules() {

    const list = $("otherScheduleList");

    if (!list) {
        return;
    }

    list.innerHTML = "";

    const items = calendarEvents.filter(function (event) {
        return event.kind === "personal";
    });

    items.forEach(function (event) {

        const row = document.createElement("div");

        const date = document.createElement("input");
        date.type = "date";
        date.value = event.date || "";
        date.title = "日付（空欄可）";

        const check = document.createElement("input");
        check.type = "checkbox";
        check.checked = !!event.done;

        const text = document.createElement("input");
        text.type = "text";
        text.value = event.title || "";
        text.placeholder = "予定を入力";

        const deleteButton = makeButton("削除", "ghost");

        function save() {
            event.date = date.value;
            event.done = check.checked;
            event.title = text.value;
            saveCalendarEvents();

            if (typeof renderCalendarAll === "function") {
                renderCalendarAll();
            }
        }

        date.addEventListener("change", save);
        check.addEventListener("change", save);
        text.addEventListener("input", save);

        deleteButton.addEventListener("click", function () {

            calendarEvents = calendarEvents.filter(function (item) {
                return item.id !== event.id;
            });

            saveCalendarEvents();
            refreshAllScheduleViews();
        });

        row.append(date, check, text, deleteButton);

        list.appendChild(row);
    });
}

$("addOtherScheduleBtn")?.addEventListener("click", function () {

    calendarEvents.push({
        id: newCalendarEventId(),
        date: "",
        time: "",
        kind: "personal",
        icon: "",
        examType: "",
        title: "",
        done: false
    });

    saveCalendarEvents();
    refreshAllScheduleViews();
});


/* =========================================================
   カレンダー（月・週・日表示）
   ========================================================= */

let calCursorDate = todayKey();
let calSelectedDate = todayKey();
let calViewMode = "month";

const CAL_WEEK_LABELS = ["日", "月", "火", "水", "木", "金", "土"];

function addMonthsToKey(dateKey, delta) {
    const d = new Date(dateKey + "T00:00:00");
    d.setDate(1);
    d.setMonth(d.getMonth() + delta);
    return dateKeyOf(d);
}

function calRangeLabelText() {

    if (calViewMode === "month") {
        const d = new Date(calCursorDate + "T00:00:00");
        return d.getFullYear() + "年" + (d.getMonth() + 1) + "月";
    }

    if (calViewMode === "week") {
        const start = getWeekStartKey(calCursorDate);
        return formatShortDate(start) + "〜" + formatShortDate(addDaysToKey(start, 6));
    }

    return formatShortDate(calCursorDate);
}

function calNavigate(delta) {

    if (calViewMode === "month") {
        calCursorDate = addMonthsToKey(calCursorDate, delta);
    } else if (calViewMode === "week") {
        calCursorDate = addDaysToKey(calCursorDate, delta * 7);
    } else {
        calCursorDate = addDaysToKey(calCursorDate, delta);
    }

    calSelectedDate = calCursorDate;

    renderCalendarAll();
}

function calGoToday() {
    calCursorDate = todayKey();
    calSelectedDate = todayKey();
    renderCalendarAll();
}

function calSelectDate(dateKey) {

    calSelectedDate = dateKey;

    if ($("calAddDate")) {
        $("calAddDate").value = dateKey;
    }

    renderCalendarGrid();
    renderCalendarDayDetail();
}

function calDayKomaCount(dateKey) {

    return reservations.filter(function (record) {
        return record.date === dateKey;
    }).length;
}

function buildCalCell(dateKey, options) {

    const settings = options || {};

    const cell = document.createElement("div");
    cell.className = "cal-cell";

    if (dateKey === todayKey()) {
        cell.classList.add("is-today");
    }

    if (dateKey === calSelectedDate) {
        cell.classList.add("is-selected");
    }

    const dayNumber = document.createElement("div");
    dayNumber.className = "cal-day-num";
    dayNumber.textContent = String(Number(dateKey.split("-")[2]));

    cell.appendChild(dayNumber);

    const events = eventsForDate(dateKey);
    const limit = settings.limit || 3;

    events.slice(0, limit).forEach(function (event) {

        const pill = document.createElement("div");
        pill.className = "cal-pill kind-" + event.kind + (event.done ? " is-done" : "");
        pill.textContent =
            calendarEventIcon(event) + " " + (event.title || CALENDAR_KIND_LABEL[event.kind]);

        cell.appendChild(pill);
    });

    if (events.length > limit) {
        const more = document.createElement("div");
        more.className = "cal-more";
        more.textContent = "+" + (events.length - limit);
        cell.appendChild(more);
    }

    const komaCount = calDayKomaCount(dateKey);

    if (komaCount > 0) {
        const badge = document.createElement("div");
        badge.className = "cal-koma-badge";
        badge.textContent = "🔷 コマ " + komaCount;
        cell.appendChild(badge);
    }

    cell.addEventListener("click", function () {
        calSelectDate(dateKey);
    });

    return cell;
}

function renderCalendarMonthGrid(container) {

    container.className = "cal-grid cal-grid-month";
    container.innerHTML = "";

    CAL_WEEK_LABELS.forEach(function (label) {
        const head = document.createElement("div");
        head.className = "cal-head";
        head.textContent = label;
        container.appendChild(head);
    });

    const first = new Date(calCursorDate + "T00:00:00");
    first.setDate(1);

    const leading = first.getDay();
    const daysInMonth = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
    const totalCells = Math.ceil((leading + daysInMonth) / 7) * 7;

    for (let i = 0; i < totalCells; i++) {

        const dayNumber = i - leading + 1;

        if (dayNumber < 1 || dayNumber > daysInMonth) {
            const pad = document.createElement("div");
            pad.className = "cal-cell cal-cell-pad";
            container.appendChild(pad);
            continue;
        }

        const dateKey =
            first.getFullYear() + "-" +
            pad2(first.getMonth() + 1) + "-" +
            pad2(dayNumber);

        container.appendChild(buildCalCell(dateKey, { limit: 2 }));
    }
}

function renderCalendarWeekGrid(container) {

    container.className = "cal-grid cal-grid-week";
    container.innerHTML = "";

    const start = getWeekStartKey(calCursorDate);

    for (let i = 0; i < 7; i++) {

        const dateKey = addDaysToKey(start, i);

        const head = document.createElement("div");
        head.className = "cal-head";
        head.textContent = CAL_WEEK_LABELS[i] + " " + formatShortDate(dateKey).replace(/\(.*\)/, "");
        container.appendChild(head);
    }

    for (let i = 0; i < 7; i++) {
        container.appendChild(buildCalCell(addDaysToKey(start, i), { limit: 4 }));
    }
}

function renderCalendarDayGrid(container) {

    container.className = "cal-grid cal-grid-day";
    container.innerHTML = "";

    const card = document.createElement("div");
    card.className = "cal-day-big";
    card.textContent = formatShortDate(calCursorDate);

    container.appendChild(card);
}

function renderCalendarGrid() {

    const container = $("calGrid");

    if (!container) {
        return;
    }

    if (calViewMode === "month") {
        renderCalendarMonthGrid(container);
    } else if (calViewMode === "week") {
        renderCalendarWeekGrid(container);
    } else {
        renderCalendarDayGrid(container);
    }

    if ($("calRangeLabel")) {
        $("calRangeLabel").textContent = calRangeLabelText();
    }

    [
        ["calViewMonthBtn", "month"],
        ["calViewWeekBtn", "week"],
        ["calViewDayBtn", "day"]
    ].forEach(function (pair) {

        if ($(pair[0])) {
            $(pair[0]).className = "small" + (calViewMode === pair[1] ? " primary" : "");
        }
    });
}

function buildEventEditRow(event) {

    const row = document.createElement("div");
    row.className = "cal-event-row";

    const icon = document.createElement("span");
    icon.className = "cal-event-icon";
    icon.textContent = calendarEventIcon(event);

    const kindTag = document.createElement("span");
    kindTag.className = "koma-tag kind-" + event.kind;
    kindTag.textContent =
        CALENDAR_KIND_LABEL[event.kind] + (event.kind === "exam" ? "・" + (event.examType || "") : "");

    const time = document.createElement("input");
    time.type = "time";
    time.value = event.time || "";

    const title = document.createElement("input");
    title.type = "text";
    title.value = event.title || "";
    title.placeholder = "内容";

    const done = document.createElement("input");
    done.type = "checkbox";
    done.checked = !!event.done;

    function save() {
        event.time = time.value;
        event.title = title.value;
        event.done = done.checked;
        saveCalendarEvents();
        refreshAllScheduleViews();
    }

    time.addEventListener("change", save);
    title.addEventListener("input", save);
    done.addEventListener("change", save);

    const deleteButton = makeButton("削除", "ghost");

    deleteButton.addEventListener("click", function () {

        calendarEvents = calendarEvents.filter(function (item) {
            return item.id !== event.id;
        });

        saveCalendarEvents();
        refreshAllScheduleViews();
    });

    row.append(icon, kindTag, time, title, done, deleteButton);

    return row;
}

function renderCalendarDayDetail() {

    const container = $("calDayDetail");

    if (!container) {
        return;
    }

    if ($("calSelectedLabel")) {
        $("calSelectedLabel").textContent =
            formatShortDate(calSelectedDate) + (calSelectedDate === todayKey() ? "（今日）" : "");
    }

    container.innerHTML = "";

    const heading = document.createElement("p");
    heading.className = "sub";
    heading.textContent =
        formatShortDate(calSelectedDate) + (calSelectedDate === todayKey() ? "（今日）" : "");

    container.appendChild(heading);

    const eventsHeading = document.createElement("h4");
    eventsHeading.textContent = "予定";
    container.appendChild(eventsHeading);

    const events = eventsForDate(calSelectedDate);

    if (events.length === 0) {

        const empty = document.createElement("p");
        empty.className = "empty-note";
        empty.textContent = "予定はありません。";
        container.appendChild(empty);

    } else {

        events.forEach(function (event) {
            container.appendChild(buildEventEditRow(event));
        });
    }

    const komaHeading = document.createElement("h4");
    komaHeading.textContent = "コマ";
    container.appendChild(komaHeading);

    const komas = reservations
        .filter(function (record) {
            return record.date === calSelectedDate;
        })
        .sort(sortByStart);

    if (komas.length === 0) {

        const empty = document.createElement("p");
        empty.className = "empty-note";
        empty.textContent = "この日のコマはありません。";
        container.appendChild(empty);

    } else {

        komas.forEach(function (record) {
            container.appendChild(buildKomaCard(record, { showMissedTools: record.status === "missed" }));
        });
    }
}

function renderCalendarAll() {
    renderCalendarGrid();
    renderCalendarDayDetail();
}

function syncCalAddKindFields() {

    const kind = $("calAddKind")?.value || "school";

    if ($("calAddExamTypeWrap")) {
        $("calAddExamTypeWrap").style.display = (kind === "exam") ? "flex" : "none";
    }

    if ($("calAddIconWrap")) {
        $("calAddIconWrap").style.display = (kind === "important") ? "flex" : "none";
    }
}

function setupCalendar() {

    if ($("calAddDate")) {
        $("calAddDate").value = calSelectedDate;
    }

    syncCalAddKindFields();

    $("calPrevBtn")?.addEventListener("click", function () { calNavigate(-1); });
    $("calNextBtn")?.addEventListener("click", function () { calNavigate(1); });
    $("calTodayBtn")?.addEventListener("click", calGoToday);

    $("calViewMonthBtn")?.addEventListener("click", function () {
        calViewMode = "month";
        renderCalendarGrid();
    });

    $("calViewWeekBtn")?.addEventListener("click", function () {
        calViewMode = "week";
        renderCalendarGrid();
    });

    $("calViewDayBtn")?.addEventListener("click", function () {
        calViewMode = "day";
        calCursorDate = calSelectedDate;
        renderCalendarGrid();
    });

    $("calAddKind")?.addEventListener("change", syncCalAddKindFields);

    $("calAddBtn")?.addEventListener("click", function () {

        const date = $("calAddDate")?.value || "";
        const kind = $("calAddKind")?.value || "school";
        const title = $("calAddTitle")?.value.trim() || "";

        if (!date || !title) {
            alert("日付と内容を入力してください。");
            return;
        }

        calendarEvents.push({
            id: newCalendarEventId(),
            date: date,
            time: $("calAddTime")?.value || "",
            kind: kind,
            icon: kind === "important" ? ($("calAddIcon")?.value.trim() || "📅") : "",
            examType: kind === "exam" ? ($("calAddExamType")?.value || "提出物") : "",
            title: title,
            done: false
        });

        saveCalendarEvents();

        if ($("calAddTitle")) { $("calAddTitle").value = ""; }
        if ($("calAddTime")) { $("calAddTime").value = ""; }

        refreshAllScheduleViews();
    });
}


/* =========================================================
   PATGS27内蔵タイマー
   ========================================================= */

const TIMER_QUICK_MINUTES = [3, 5, 10, 30, 50, 60];

let activeTimer = loadJSON("patgs27_active_timer", null);

function saveActiveTimer() {

    if (activeTimer) {
        saveJSON("patgs27_active_timer", activeTimer);
    } else {
        localStorage.removeItem(patgsNamespacedKey("patgs27_active_timer"));
    }
}

function startTimer(durationMinutes, label, reservationId) {

    const now = Date.now();

    activeTimer = {
        id: "timer_" + now,
        label: label,
        reservationId: reservationId || null,
        durationMinutes: durationMinutes,
        startedAt: now,
        endsAt: now + durationMinutes * 60000,
        notifiedEnd: false
    };

    saveActiveTimer();
    renderTimer();
}

function stopTimer() {
    activeTimer = null;
    saveActiveTimer();
    renderTimer();
}

function formatTimerClock(ms) {

    const totalSeconds = Math.max(0, Math.round(ms / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;

    return pad2(minutes) + ":" + pad2(seconds);
}

function openReservationLog(reservationId) {

    expandedLogIds.add(reservationId);

    renderKomaAll();

    setTimeout(function () {

        const target = document.querySelector('[data-res-id="' + reservationId + '"]');

        if (target) {
            target.scrollIntoView({ behavior: "smooth", block: "center" });
        }

    }, 50);
}

function renderTimer() {

    const display = $("timerDisplay");

    if (!display) {
        return;
    }

    display.innerHTML = "";

    if (!activeTimer) {

        const idle = document.createElement("p");
        idle.className = "empty-note";
        idle.textContent = "タイマーは動いていません。下のボタンか、コマの「開始」から始められます。";
        display.appendChild(idle);
        return;
    }

    const remaining = activeTimer.endsAt - Date.now();

    if (remaining > 0) {

        const clock = document.createElement("div");
        clock.className = "timer-clock";
        clock.textContent = formatTimerClock(remaining);

        const label = document.createElement("p");
        label.className = "timer-label";
        label.textContent = activeTimer.label + "（" + activeTimer.durationMinutes + "分）";

        const stopButton = makeButton("タイマーを止める", "ghost");
        stopButton.addEventListener("click", stopTimer);

        display.append(clock, label, stopButton);

        return;
    }

    if (!activeTimer.notifiedEnd) {

        sendPatgsNotification(
            "⏰ コマ終了の時間です",
            activeTimer.label + "（" + activeTimer.durationMinutes + "分）が終了しました。"
        );

        activeTimer.notifiedEnd = true;
        saveActiveTimer();
    }

    const doneMessage = document.createElement("div");
    doneMessage.className = "timer-clock timer-clock-done";
    doneMessage.textContent = "⏰ 終了";

    const label = document.createElement("p");
    label.className = "timer-label";
    label.textContent = activeTimer.label + "（" + activeTimer.durationMinutes + "分）";

    display.append(doneMessage, label);

    if (activeTimer.reservationId) {

        const logButton = makeButton("この学習を記録する", "primary");

        logButton.addEventListener("click", function () {
            const id = activeTimer.reservationId;
            stopTimer();
            openReservationLog(id);
        });

        display.appendChild(logButton);
    }

    const closeButton = makeButton("閉じる", "ghost");
    closeButton.addEventListener("click", stopTimer);
    display.appendChild(closeButton);
}

function setupTimer() {

    document.querySelectorAll(".timer-quick").forEach(function (button) {

        button.addEventListener("click", function () {

            const minutes = Number(button.dataset.minutes) || 0;

            if (minutes <= 0) {
                return;
            }

            startTimer(minutes, minutes + "分 自由タイマー", null);
        });
    });

    renderTimer();

    setInterval(renderTimer, 1000);
}


/* =========================================================
   バックアップ
   ========================================================= */

function exportAllData() {

    const data = {};
    const ownPrefix = PATGS_UID ? patgsNamespacedKey("") : "";

    for (let i = 0; i < localStorage.length; i++) {

        const key = localStorage.key(i);

        if (!key) {
            continue;
        }

        if (PATGS_UID) {
            if (key.indexOf(ownPrefix) === 0) {
                data[key] = localStorage.getItem(key);
            }
        } else {
            data[key] = localStorage.getItem(key);
        }
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

    const stepX = sorted.length > 1 ? (width - padding * 2) / (sorted.length - 1) : 0;

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

    const stepX = points.length > 1 ? (width - padding * 2) / (points.length - 1) : 0;

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
        "今週のPATGS代理：" + proxy + "／自己判断の裁定者：" + getPatgsArbiter(proxy);
}

function loadPatgsProxy() {

    const saved = localStorage.getItem(patgsNamespacedKey("patgs27_proxy_selection")) || "";

    if ($("patgsProxySelect")) {
        $("patgsProxySelect").value = saved;
    }

    updatePatgsProxyResult();
}

$("patgsProxySelect")?.addEventListener("change", function () {

    localStorage.setItem(patgsNamespacedKey("patgs27_proxy_selection"), $("patgsProxySelect").value);
    patgsScheduleSync();

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
   学習カレンダー・継続日数
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
            dateKey + "：" + total + "コマ" + (opened ? "（開いた）" : "（未訪問）");

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
    const lastOpened = localStorage.getItem(patgsNamespacedKey("patgs27_last_opened")) || "";

    let streak = Number(localStorage.getItem(patgsNamespacedKey("patgs27_streak"))) || 0;

    if (lastOpened === today) {
        /* 今日は記録済み */
    } else if (lastOpened === yesterday) {
        streak += 1;
        localStorage.setItem(patgsNamespacedKey("patgs27_last_opened"), today);
        localStorage.setItem(patgsNamespacedKey("patgs27_streak"), String(streak));
    } else {
        streak = 1;
        localStorage.setItem(patgsNamespacedKey("patgs27_last_opened"), today);
        localStorage.setItem(patgsNamespacedKey("patgs27_streak"), String(streak));
    }

    let bestStreak = Number(localStorage.getItem(patgsNamespacedKey("patgs27_best_streak"))) || 0;

    if (streak > bestStreak) {
        bestStreak = streak;
        localStorage.setItem(patgsNamespacedKey("patgs27_best_streak"), String(bestStreak));
    }

    patgsScheduleSync();

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
    "今日も1コマ、たしかに積み上がる。",
    "始めた瞬間に、もう半分終わってる。",
    "できた分だけ、ちゃんと数えよう。",
    "未実行は失敗じゃなく、材料。",
    "30分だけ、まず座ろう。",
    "今日の自分が、未来の自分を助ける。",
    "焦らず、でも止まらず。",
    "完璧じゃなくていい、続けよう。",
    "昨日の自分より、ちょっとだけ前へ。",
    "積み重ねは裏切らない。",
    "迷ったら、とりあえず開始ボタン。",
    "小さく始めて、大きく伸ばす。"
];

function renderRandomMessage() {

    if (!$("randomMessage")) {
        return;
    }

    const index = Math.floor(Math.random() * PATGS_RANDOM_MESSAGES.length);

    $("randomMessage").textContent = PATGS_RANDOM_MESSAGES[index];
}


/* =========================================================
   今日のサマリー
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
   重要予定
   ========================================================= */

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

    const items = calendarEvents.filter(function (event) {
        return event.kind === "important";
    });

    items.forEach(function (event) {

        const row = document.createElement("div");
        row.className = "schedule-setting-row";

        const icon = document.createElement("input");
        icon.type = "text";
        icon.value = event.icon || "📅";
        icon.placeholder = "アイコン";

        const name = document.createElement("input");
        name.type = "text";
        name.value = event.title || "";
        name.placeholder = "予定名";

        const date = document.createElement("input");
        date.type = "date";
        date.value = event.date || "";

        function saveScheduleItem() {

            event.title = name.value.trim();
            event.date = date.value;
            event.icon = icon.value.trim() || "📅";

            saveCalendarEvents();

            updatePATGSTodayDate();
            updateSchedule();

            if (typeof renderCalendarAll === "function") {
                renderCalendarAll();
            }
        }

        name.addEventListener("input", saveScheduleItem);
        date.addEventListener("change", saveScheduleItem);
        icon.addEventListener("input", saveScheduleItem);

        const deleteButton = makeButton("削除", "ghost");

        deleteButton.addEventListener("click", function () {

            const title = event.title || "この予定";

            if (!confirm("「" + title + "」を削除しますか？")) {
                return;
            }

            calendarEvents = calendarEvents.filter(function (item) {
                return item.id !== event.id;
            });

            saveCalendarEvents();
            refreshAllScheduleViews();
        });

        row.append(icon, name, date, deleteButton);

        container.appendChild(row);
    });
}

function addPATGSSchedule() {

    calendarEvents.push({
        id: newCalendarEventId(),
        date: "",
        time: "",
        kind: "important",
        icon: "📅",
        examType: "",
        title: "新しい予定",
        done: false
    });

    saveCalendarEvents();
    refreshAllScheduleViews();
}

function updateSchedule() {

    const container = $("upcomingScheduleList");

    if (!container) {
        return;
    }

    container.innerHTML = "";

    const today = getPATGSToday();

    const upcoming = calendarEvents
        .filter(function (event) {
            return event.kind === "important" && !!event.date;
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
        name.textContent = (event.icon || "📅") + " " + (event.title || "名称未設定");

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
   ⑥-1 育成・成長
   ========================================================= */

const GROWTH_SUBJECT_EMOJI = {
    "国語": "📖",
    "数学": "🔢",
    "英語": "🌍",
    "理科": "🔬",
    "社会": "🗺",
    "その他": "🌾"
};

const GROWTH_STAGES = [
    { min: 0, icon: "🌰", label: "たね" },
    { min: 3, icon: "🌱", label: "芽" },
    { min: 8, icon: "🌿", label: "若葉" },
    { min: 15, icon: "🌸", label: "花" },
    { min: 25, icon: "🌳", label: "木" },
    { min: 40, icon: "🌴", label: "大木" }
];

let growthData = loadJSON("patgs27_growth", {});

function saveGrowthData() {
    saveJSON("patgs27_growth", growthData);
}

function growSubject(subject) {

    const key = KOMA_SUBJECTS.includes(subject) ? subject : "その他";

    if (!growthData[key]) {
        growthData[key] = { points: 0, lastGrowDate: "" };
    }

    growthData[key].points += 1;
    growthData[key].lastGrowDate = todayKey();

    saveGrowthData();
    renderGrowthList();
}

function growthStageFor(points) {

    let stage = GROWTH_STAGES[0];

    GROWTH_STAGES.forEach(function (s) {
        if (points >= s.min) {
            stage = s;
        }
    });

    return stage;
}

function renderGrowthList() {

    const container = $("growthList");

    if (!container) {
        return;
    }

    container.innerHTML = "";

    KOMA_SUBJECTS.forEach(function (subject) {

        const data = growthData[subject] || { points: 0, lastGrowDate: "" };
        const stage = growthStageFor(data.points);

        const card = document.createElement("div");
        card.className = "growth-card";

        const icon = document.createElement("div");
        icon.className = "growth-icon";
        icon.textContent = stage.icon;

        const subjectLabel = document.createElement("div");
        subjectLabel.className = "growth-subject";
        subjectLabel.textContent = (GROWTH_SUBJECT_EMOJI[subject] || "") + " " + subject;

        const stageLabel = document.createElement("div");
        stageLabel.className = "growth-stage";
        stageLabel.textContent = stage.label;

        const points = document.createElement("div");
        points.className = "growth-points";
        points.textContent = data.points + "コマ育成中";

        card.append(icon, subjectLabel, stageLabel, points);
        container.appendChild(card);
    });
}


/* =========================================================
   ⑥-2 受験マップ
   ========================================================= */

const MAP_PAST_DAYS = 13;
const MAP_FUTURE_CAP = 30;

function mapGoalCandidates() {

    return calendarEvents
        .filter(function (event) {
            return event.kind === "important" && !!event.date && event.date >= todayKey();
        })
        .sort(function (a, b) {
            return a.date.localeCompare(b.date);
        });
}

function renderMapGoalSelect() {

    const select = $("mapGoalSelect");

    if (!select) {
        return;
    }

    const candidates = mapGoalCandidates();
    const saved = localStorage.getItem(patgsNamespacedKey("patgs27_map_goal_id")) || "";

    select.innerHTML = "";

    if (candidates.length === 0) {

        const option = document.createElement("option");
        option.value = "";
        option.textContent = "重要予定に日付を登録してください";
        select.appendChild(option);
        return;
    }

    candidates.forEach(function (event) {

        const option = document.createElement("option");
        option.value = event.id;
        option.textContent =
            (event.icon || "📅") + " " + (event.title || "名称未設定") + "（" + event.date + "）";

        select.appendChild(option);
    });

    const preferred =
        candidates.find(function (e) { return e.id === saved; }) ||
        candidates.find(function (e) { return (e.title || "").indexOf("入試") !== -1; }) ||
        candidates[0];

    select.value = preferred.id;
}

function renderMapBoard() {

    const board = $("mapBoard");
    const summary = $("mapSummary");

    if (!board) {
        return;
    }

    board.innerHTML = "";

    const goalId = $("mapGoalSelect")?.value || "";
    const goal = calendarEvents.find(function (e) { return e.id === goalId; });

    if (!goal) {

        board.textContent = "";

        const empty = document.createElement("p");
        empty.className = "empty-note";
        empty.textContent = "受験マップを表示するには、重要予定に日付を登録してください。";
        board.appendChild(empty);

        if (summary) {
            summary.textContent = "";
        }

        return;
    }

    const today = todayKey();
    const daysUntil = Math.max(
        0,
        Math.round(
            (new Date(goal.date + "T00:00:00").getTime() - new Date(today + "T00:00:00").getTime()) /
            (1000 * 60 * 60 * 24)
        )
    );

    /* 過去14日分：学習カレンダーと同じ集計を再利用して色付け */
    for (let i = MAP_PAST_DAYS; i >= 0; i--) {

        const dateKey = getDateKeyOffset(-i);
        const total = getDoneKomaForDate(dateKey);

        const square = document.createElement("div");
        square.className = "map-square";
        square.title = dateKey + "：" + total + "コマ";

        let bg = "#ebedf0";

        if (total >= 6) { bg = "#196127"; }
        else if (total >= 3) { bg = "#39a637"; }
        else if (total > 0) { bg = "#9be9a8"; }

        square.style.background = bg;

        if (dateKey === today) {
            square.classList.add("is-today");
            square.textContent = "🚩";
        }

        board.appendChild(square);
    }

    /* 未来：ゴールまでの日数（長い場合は間を省略） */
    const futureDays = daysUntil;
    const showDays = Math.min(futureDays, MAP_FUTURE_CAP);

    for (let i = 1; i <= showDays; i++) {

        const square = document.createElement("div");
        square.className = "map-square";
        board.appendChild(square);
    }

    if (futureDays > MAP_FUTURE_CAP) {

        const ellipsis = document.createElement("div");
        ellipsis.className = "map-square is-ellipsis";
        ellipsis.textContent = "…";
        board.appendChild(ellipsis);
    }

    const goalSquare = document.createElement("div");
    goalSquare.className = "map-square is-goal";
    goalSquare.textContent = goal.icon || "🎓";
    goalSquare.title = goal.title + "（" + goal.date + "）";
    board.appendChild(goalSquare);

    if (summary) {
        summary.textContent =
            (goal.title || "目標") + "まで、あと " + daysUntil + " 日。" +
            "🚩が今日の位置、色の濃いマスは学習をよく実施できた日です。";
    }
}

function renderMapAll() {
    renderMapGoalSelect();
    renderMapBoard();
}

function setupMap() {

    $("mapGoalSelect")?.addEventListener("change", function () {

        localStorage.setItem(patgsNamespacedKey("patgs27_map_goal_id"), $("mapGoalSelect").value);
        patgsScheduleSync();
        renderMapBoard();
    });

    renderMapAll();
}


/* =========================================================
   ⑥-3 週次振り返り自動生成
   ========================================================= */

function getWeekSubjectCounts(weekStartKey) {

    const counts = {};

    KOMA_SUBJECTS.forEach(function (subject) {
        counts[subject] = 0;
    });

    getWeekReservations(weekStartKey).forEach(function (record) {

        if (record.status !== "done") {
            return;
        }

        const subject = KOMA_SUBJECTS.includes(record.subject) ? record.subject : "その他";
        counts[subject] += komaValue(record);
    });

    return counts;
}

function generateWeeklyReportText() {

    const weekStart = getWeekStartKey(todayKey());
    const weekEnd = addDaysToKey(weekStart, 6);
    const stats = getWeekStats(weekStart);

    const weekRecords = getWeekReservations(weekStart);

    const scored = weekRecords.filter(function (r) {
        return r.log && r.log.totalQuestions > 0;
    });

    const totalQ = scored.reduce(function (sum, r) { return sum + r.log.totalQuestions; }, 0);
    const totalC = scored.reduce(function (sum, r) { return sum + r.log.correctCount; }, 0);
    const rateText = totalQ > 0 ? Math.round((totalC / totalQ) * 100) + "%" : "記録なし";

    const subjectCounts = getWeekSubjectCounts(weekStart);
    const subjectText = KOMA_SUBJECTS
        .filter(function (s) { return subjectCounts[s] > 0; })
        .map(function (s) { return s + " " + subjectCounts[s] + "コマ"; })
        .join("／") || "記録なし";

    const unresolvedThisWeek = weekRecords.filter(function (r) {
        return r.log && r.log.unresolved && !r.log.resolved;
    });

    const resolvedThisWeek = weekRecords.filter(function (r) {
        return r.log && r.log.resolvesId;
    });

    const lines = [
        "【今週の振り返り（自動生成）】",
        formatShortDate(weekStart) + "〜" + formatShortDate(weekEnd),
        "",
        "・実施コマ数：完了 " + stats.done + " ／ 必要 " + stats.required + " ／ 未実行 " + stats.missed,
        "・正答率：" + rateText,
        "・教科ごとの学習状況：" + subjectText,
        "・未解決問題：" + (
            unresolvedThisWeek.length === 0
                ? "なし"
                : unresolvedThisWeek
                    .map(function (r) { return (r.subject || "") + "「" + r.log.unresolved + "」"; })
                    .join("／")
        ),
        "・理解・解決した内容：" + (
            resolvedThisWeek.length === 0
                ? "なし"
                : resolvedThisWeek
                    .map(function (r) { return (r.subject || "") + "「" + (r.log.content || "") + "」"; })
                    .join("／")
        ),
        "・今週の学習成果：" +
            stats.done + "コマ実施、正答率" + rateText +
            "、未解決" + unresolvedThisWeek.length + "件、解決" + resolvedThisWeek.length + "件。"
    ];

    return lines.join("\n");
}

function renderWeeklyReportBox(text) {

    const box = $("weeklyReportBox");

    if (!box) {
        return;
    }

    box.style.whiteSpace = "pre-line";
    box.textContent = text || "「今週のレポートを作る」を押すと、ここに自動で表示されます。";
}

function setupWeeklyReport() {

    $("generateWeeklyReportBtn")?.addEventListener("click", function () {
        renderWeeklyReportBox(generateWeeklyReportText());
    });

    $("copyReportToReviewBtn")?.addEventListener("click", function () {

        const text = generateWeeklyReportText();

        renderWeeklyReportBox(text);

        if ($("weeklyReviewText")) {
            $("weeklyReviewText").value = text;
            $("weeklyReviewText").scrollIntoView({ behavior: "smooth", block: "center" });
        }
    });
}


/* =========================================================
   ⑥-4 演出音・アニメーション
   ========================================================= */

let fxAudioContext = null;

function fxSoundEnabled() {
    return localStorage.getItem(patgsNamespacedKey("patgs27_fx_sound")) !== "0";
}

function fxAnimationEnabled() {
    return localStorage.getItem(patgsNamespacedKey("patgs27_fx_animation")) !== "0";
}

function playChime() {

    if (!fxSoundEnabled()) {
        return;
    }

    try {

        if (!fxAudioContext) {
            fxAudioContext = new (window.AudioContext || window.webkitAudioContext)();
        }

        const ctx = fxAudioContext;
        const now = ctx.currentTime;

        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = "sine";
        osc.frequency.setValueAtTime(660, now);
        osc.frequency.exponentialRampToValueAtTime(880, now + 0.12);

        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.exponentialRampToValueAtTime(0.15, now + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(now);
        osc.stop(now + 0.4);

    } catch (error) {
        console.error("演出音の再生に失敗しました:", error);
    }
}

function flashSavedElement(element) {

    if (!fxAnimationEnabled() || !element) {
        return;
    }

    element.classList.add("log-saved-flash");

    setTimeout(function () {
        element.classList.remove("log-saved-flash");
    }, 700);
}

function setupFxToggles() {

    if ($("fxSoundToggle")) {
        $("fxSoundToggle").checked = fxSoundEnabled();

        $("fxSoundToggle").addEventListener("change", function () {
            localStorage.setItem(patgsNamespacedKey("patgs27_fx_sound"), $("fxSoundToggle").checked ? "1" : "0");
            patgsScheduleSync();
        });
    }

    if ($("fxAnimationToggle")) {
        $("fxAnimationToggle").checked = fxAnimationEnabled();

        $("fxAnimationToggle").addEventListener("change", function () {
            localStorage.setItem(patgsNamespacedKey("patgs27_fx_animation"), $("fxAnimationToggle").checked ? "1" : "0");
            patgsScheduleSync();
        });
    }
}


/* =========================================================
   ⑥-5 実績・バッジ
   ========================================================= */

const BADGE_DEFS = [
    {
        id: "first_full_score",
        icon: "🎯",
        label: "はじめての全問正解",
        check: function () {
            return reservations.some(function (r) {
                return r.log && r.log.totalQuestions > 0 && r.log.correctCount === r.log.totalQuestions;
            });
        }
    },
    {
        id: "koma_10",
        icon: "🥉",
        label: "コマ10回達成",
        check: function () {
            return reservations.filter(function (r) { return r.status === "done"; }).length >= 10;
        }
    },
    {
        id: "koma_50",
        icon: "🥈",
        label: "コマ50回達成",
        check: function () {
            return reservations.filter(function (r) { return r.status === "done"; }).length >= 50;
        }
    },
    {
        id: "koma_100",
        icon: "🥇",
        label: "コマ100回達成",
        check: function () {
            return reservations.filter(function (r) { return r.status === "done"; }).length >= 100;
        }
    },
    {
        id: "streak_7",
        icon: "🔥",
        label: "7日連続で開いた",
        check: function () {
            return (Number(localStorage.getItem(patgsNamespacedKey("patgs27_streak"))) || 0) >= 7;
        }
    },
    {
        id: "streak_30",
        icon: "🌟",
        label: "30日連続で開いた",
        check: function () {
            return (Number(localStorage.getItem(patgsNamespacedKey("patgs27_streak"))) || 0) >= 30;
        }
    },
    {
        id: "first_resolve",
        icon: "🧩",
        label: "はじめて未解決を解決",
        check: function () {
            return reservations.some(function (r) {
                return r.log && r.log.resolved;
            });
        }
    },
    {
        id: "first_memo",
        icon: "🗒",
        label: "はじめての学習メモ",
        check: function () {
            return studyMemos.length > 0;
        }
    }
];

let unlockedBadges = loadJSON("patgs27_badges", []);

function saveUnlockedBadges() {
    saveJSON("patgs27_badges", unlockedBadges);
}

function checkBadges() {

    let changed = false;
    const newlyUnlocked = [];

    BADGE_DEFS.forEach(function (badge) {

        if (unlockedBadges.includes(badge.id)) {
            return;
        }

        let achieved = false;

        try {
            achieved = !!badge.check();
        } catch (error) {
            achieved = false;
        }

        if (achieved) {
            unlockedBadges.push(badge.id);
            newlyUnlocked.push(badge);
            changed = true;
        }
    });

    if (changed) {

        saveUnlockedBadges();
        renderBadges();

        if (newlyUnlocked.length > 0) {

            playChime();

            flashSavedElement($("badgeGridUnlocked"));
        }
    }
}

function renderBadges() {

    const unlockedGrid = $("badgeGridUnlocked");
    const lockedGrid = $("badgeGridLocked");

    if (!unlockedGrid || !lockedGrid) {
        return;
    }

    unlockedGrid.innerHTML = "";
    lockedGrid.innerHTML = "";

    let hasUnlocked = false;

    BADGE_DEFS.forEach(function (badge) {

        const unlocked = unlockedBadges.includes(badge.id);

        const item = document.createElement("div");
        item.className = "badge-item" + (unlocked ? "" : " is-locked");

        const icon = document.createElement("div");
        icon.className = "badge-icon";
        icon.textContent = badge.icon;

        const label = document.createElement("div");
        label.className = "badge-label";
        label.textContent = badge.label;

        item.append(icon, label);

        if (unlocked) {
            hasUnlocked = true;
            unlockedGrid.appendChild(item);
        } else {
            lockedGrid.appendChild(item);
        }
    });

    if (!hasUnlocked) {
        const empty = document.createElement("p");
        empty.className = "empty-note";
        empty.textContent = "まだ獲得したバッジはありません。";
        unlockedGrid.appendChild(empty);
    }
}


/* =========================================================
   ＋ やる気を高める機能：まとめ
   ========================================================= */

function renderMotivationAll() {
    renderGrowthList();
    renderMapAll();
    renderBadges();
}

function setupMotivationHub() {

    setupMap();
    setupWeeklyReport();
    setupFxToggles();

    renderGrowthList();
    renderBadges();
}


/* =========================================================
   ホーム＋専用画面ナビゲーション
   ========================================================= */

const SCREEN_TITLES = {
    home: "― 受験管理システム／第五次改革（コマ制度）―",
    study: "📚 学習",
    growth: "🌱 成長",
    map: "🗺️ 受験マップ",
    week: "📊 今週",
    unresolved: "❓ 未解決",
    achievements: "🏆 実績",
    schedule: "📅 予定",
    grades: "📊 成績",
    settings: "⚙️ 設定・その他"
};

const HOME_CARDS = [
    { screen: "study", icon: "📚", label: "学習" },
    { screen: "growth", icon: "🌱", label: "成長" },
    { screen: "map", icon: "🗺️", label: "受験マップ" },
    { screen: "week", icon: "📊", label: "今週" },
    { screen: "unresolved", icon: "❓", label: "未解決" },
    { screen: "achievements", icon: "🏆", label: "実績" },
    { screen: "schedule", icon: "📅", label: "予定" },
    { screen: "grades", icon: "📊", label: "成績" },
    { screen: "settings", icon: "⚙️", label: "設定・その他" }
];

let currentScreen = "home";

function showScreen(name) {

    currentScreen = SCREEN_TITLES[name] ? name : "home";

    document.querySelectorAll("[data-screen]").forEach(function (element) {
        element.classList.toggle("screen-hidden", element.dataset.screen !== currentScreen);
    });

    if ($("screenTitle")) {
        $("screenTitle").textContent = SCREEN_TITLES[currentScreen];
    }

    if ($("backToHomeBtn")) {
        $("backToHomeBtn").style.display = (currentScreen === "home") ? "none" : "inline-block";
    }

    if ($("fabMenu")) {
        $("fabMenu").style.display = "none";
    }

    window.scrollTo({ top: 0, behavior: "instant" in window ? "instant" : "auto" });
}

function renderHomeCards() {

    const container = $("homeCards");

    if (!container) {
        return;
    }

    container.innerHTML = "";

    HOME_CARDS.forEach(function (card) {

        const button = document.createElement("button");
        button.type = "button";
        button.className = "home-card";

        const icon = document.createElement("span");
        icon.className = "home-card-icon";
        icon.textContent = card.icon;

        const label = document.createElement("span");
        label.className = "home-card-label";
        label.textContent = card.label;

        button.append(icon, label);

        button.addEventListener("click", function () {
            showScreen(card.screen);
        });

        container.appendChild(button);
    });
}

function renderFabMenu() {

    const menu = $("fabMenu");

    if (!menu) {
        return;
    }

    menu.innerHTML = "";

    const quickTargets = [
        { screen: "growth", icon: "🌱", label: "成長" },
        { screen: "map", icon: "🗺️", label: "受験マップ" },
        { screen: "week", icon: "📊", label: "今週" },
        { screen: "achievements", icon: "🏆", label: "実績" },
        { screen: "settings", icon: "🔔", label: "演出設定" }
    ];

    quickTargets.forEach(function (target) {

        const button = makeButton(target.icon + " " + target.label, "ghost small");

        button.addEventListener("click", function () {
            showScreen(target.screen);
        });

        menu.appendChild(button);
    });
}

function setupScreenNavigation() {

    renderHomeCards();
    renderFabMenu();

    $("backToHomeBtn")?.addEventListener("click", function () {
        showScreen("home");
    });

    $("motivationFab")?.addEventListener("click", function () {

        const menu = $("fabMenu");

        if (!menu) {
            return;
        }

        menu.style.display = (menu.style.display === "none") ? "flex" : "none";
    });

    showScreen("home");
}

function renderHomeExamCountdown() {

    const element = $("homeExamCountdown");

    if (!element) {
        return;
    }

    const candidates = typeof mapGoalCandidates === "function" ? mapGoalCandidates() : [];
    const savedId = localStorage.getItem(patgsNamespacedKey("patgs27_map_goal_id")) || "";

    const goal =
        candidates.find(function (e) { return e.id === savedId; }) ||
        candidates.find(function (e) { return (e.title || "").indexOf("入試") !== -1; }) ||
        candidates[0];

    if (!goal) {
        element.textContent = "";
        return;
    }

    const daysUntil = Math.max(
        0,
        Math.round(
            (new Date(goal.date + "T00:00:00").getTime() - new Date(todayKey() + "T00:00:00").getTime()) /
            (1000 * 60 * 60 * 24)
        )
    );

    element.textContent =
        "🎓 " + (goal.title || "入試") + "まで、あと " + daysUntil + " 日";
}


/* =========================================================
   ① 予約不足の段階的介入　② 日タイプ別時刻設定
   ========================================================= */

const IV_DAY_TYPES = [
    { id: "weekday", label: "平日" },
    { id: "holiday", label: "土休日" },
    { id: "specialHoliday", label: "祝日・休校日" },
    { id: "longVacation", label: "長期休暇" }
];

const IV_STAGE_FIELDS = [
    { id: "preWarning", label: "前日の警告", defaultTime: "20:00" },
    { id: "alert", label: "当日の警戒", defaultTime: "10:00" },
    { id: "intervention", label: "強制介入", defaultTime: "11:00" },
    { id: "critical", label: "重大事象", defaultTime: "12:00" }
];

function defaultIvTimes() {

    const times = {};

    IV_DAY_TYPES.forEach(function (dt) {

        times[dt.id] = {};

        IV_STAGE_FIELDS.forEach(function (stage) {
            times[dt.id][stage.id] = stage.defaultTime;
        });
    });

    return times;
}

let ivTimes = loadJSON("patgs27_intervention_times", null);

if (!ivTimes) {
    ivTimes = defaultIvTimes();
    saveJSON("patgs27_intervention_times", ivTimes);
}

let ivDayRanges = loadJSON("patgs27_intervention_day_ranges", []);

function saveIvTimes() {
    saveJSON("patgs27_intervention_times", ivTimes);
}

function saveIvDayRanges() {
    saveJSON("patgs27_intervention_day_ranges", ivDayRanges);
}

/* 平日／土休日／祝日・休校日／長期休暇 の判定（コマ枠の平日・土休日判定とは別の設定） */
function interventionDayTypeOf(dateKey) {

    const hit = ivDayRanges.find(function (range) {
        return dateKey >= range.start && dateKey <= range.end;
    });

    if (hit) {
        return hit.type;
    }

    const day = new Date(dateKey + "T00:00:00").getDay();

    return (day === 0 || day === 6) ? "holiday" : "weekday";
}

function ivTimeToMinutes(time) {
    const parts = (time || "00:00").split(":");
    return Number(parts[0]) * 60 + Number(parts[1]);
}

function hasReservationOn(dateKey) {
    return reservations.some(function (record) {
        return record.date === dateKey;
    });
}

function hasCompletedOn(dateKey) {
    return reservations.some(function (record) {
        return record.date === dateKey && record.status === "done";
    });
}

/*
   今日を対象日として、今の状態を判定する。

   ・前日20:00〜当日「当日の警戒」時刻の前：明日（＝今日）に予約が無ければ preWarning
   ・当日「当日の警戒」時刻〜「強制介入」時刻の前：予約も完了も無ければ alert
   ・当日「強制介入」時刻〜「重大事象」時刻の前：同様に intervention
   ・当日「重大事象」時刻以降：同様に critical
*/
function evaluateInterventionState() {

    const today = todayKey();
    const yesterday = getDateKeyOffset(-1);
    const dayType = interventionDayTypeOf(today);
    const times = ivTimes[dayType] || defaultIvTimes()[dayType];

    const now = new Date();
    const nowMinutes = now.getHours() * 60 + now.getMinutes();

    const sufficient = hasReservationOn(today) || hasCompletedOn(today);

    if (sufficient) {
        return { level: "normal", dayType: dayType, date: today };
    }

    /* 前日の警告帯（前日の指定時刻〜当日「当日の警戒」時刻の前）は昨日の日タイプの設定時刻を使う */
    const yesterdayType = interventionDayTypeOf(yesterday);
    const yesterdayTimes = ivTimes[yesterdayType] || defaultIvTimes()[yesterdayType];

    const preWarningStart = ivTimeToMinutes(yesterdayTimes.preWarning);

    if (nowMinutes < ivTimeToMinutes(times.alert)) {

        /* 当日の警戒時刻より前。前日20:00以降であれば preWarning とみなす。
           日付を跨いでいるので、今日の0:00〜警戒時刻の間もpreWarningの続きとして扱う。 */
        return { level: "preWarning", dayType: dayType, date: today };
    }

    if (nowMinutes < ivTimeToMinutes(times.intervention)) {
        return { level: "alert", dayType: dayType, date: today };
    }

    if (nowMinutes < ivTimeToMinutes(times.critical)) {
        return { level: "intervention", dayType: dayType, date: today };
    }

    return { level: "critical", dayType: dayType, date: today };
}

const IV_LEVEL_TEXT = {
    preWarning: {
        title: "⚠️ 明日の予約がまだありません",
        body: "予定がまだ入っていません。早めにコマ予約から予定を入れておきましょう。"
    },
    alert: {
        title: "⚠️ 今日の予約がまだありません",
        body: "今日の学習がまだ始まっていません。コマ予約から予定を入れましょう。"
    },
    intervention: {
        title: "🚨 強制介入：今日の学習が始まっていません",
        body: "設定した時刻を過ぎても、今日の予約・実施がありません。今すぐコマを予約するか、状況を記録してください。"
    },
    critical: {
        title: "🆘 重大事象：Gemini判定待ち",
        body: "長時間、今日の学習が始まっていない状態です。この状態は「重大事象」として記録されます。Geminiへの自動送信は行っていません。必要であれば、下のボタンで状況をコピーして自分でGeminiに伝えてください。"
    }
};

function buildInterventionSummaryText(state) {

    return (
        "PATGS27 状態報告\n" +
        "日付：" + state.date + "（" +
        (IV_DAY_TYPES.find(function (d) { return d.id === state.dayType; })?.label || state.dayType) + "）\n" +
        "レベル：" + state.level + "\n" +
        "今日の予約：" + (hasReservationOn(state.date) ? "あり" : "なし") + "\n" +
        "今日の完了コマ：" + (hasCompletedOn(state.date) ? "あり" : "なし")
    );
}

function renderInterventionUI() {

    const state = evaluateInterventionState();

    const banner = $("interventionBanner");
    const overlay = $("interventionModalOverlay");
    const modalBody = $("interventionModalBody");

    if (banner) {

        if (state.level === "normal") {

            banner.style.display = "none";
            banner.className = "intervention-banner";

        } else {

            banner.style.display = "block";
            banner.className = "intervention-banner level-" + state.level;
            banner.textContent = IV_LEVEL_TEXT[state.level].title;
        }
    }

    if (overlay && modalBody) {

        if (state.level === "intervention" || state.level === "critical") {

            overlay.style.display = "flex";

            modalBody.innerHTML = "";

            const title = document.createElement("h3");
            title.textContent = IV_LEVEL_TEXT[state.level].title;

            const body = document.createElement("p");
            body.textContent = IV_LEVEL_TEXT[state.level].body;

            modalBody.append(title, body);

            const actions = document.createElement("div");
            actions.className = "btn-row";

            const bookButton = makeButton("コマを予約する", "primary");
            bookButton.addEventListener("click", function () {
                overlay.style.display = "none";
                showScreen("study");
            });

            const dismissButton = makeButton("閉じる", "ghost");
            dismissButton.addEventListener("click", function () {
                overlay.style.display = "none";
            });

            actions.append(bookButton, dismissButton);
            modalBody.appendChild(actions);

            if (state.level === "critical") {

                const copyButton = makeButton("状況をコピーする", "ghost");

                copyButton.addEventListener("click", function () {

                    const text = buildInterventionSummaryText(state);

                    if (navigator.clipboard && navigator.clipboard.writeText) {

                        navigator.clipboard.writeText(text).then(function () {
                            copyButton.textContent = "コピーしました";
                        }).catch(function () {
                            copyButton.textContent = "コピーに失敗しました";
                        });

                    } else {
                        alert(text);
                    }
                });

                modalBody.appendChild(copyButton);
            }

        } else {
            overlay.style.display = "none";
        }
    }

    /* preWarning / alert は1日1回だけ通知する */
    if (state.level === "preWarning" || state.level === "alert") {

        const fireKey = state.date + "-" + state.level;

        if (localStorage.getItem(patgsNamespacedKey("patgs27_iv_last_notified")) !== fireKey) {

            sendPatgsNotification(IV_LEVEL_TEXT[state.level].title, IV_LEVEL_TEXT[state.level].body);
            localStorage.setItem(patgsNamespacedKey("patgs27_iv_last_notified"), fireKey);
        }
    }
}

function renderIvDayTypeSettings() {

    const container = $("interventionDayTypeSettings");

    if (!container) {
        return;
    }

    container.innerHTML = "";

    IV_DAY_TYPES.forEach(function (dt) {

        const row = document.createElement("div");
        row.className = "iv-daytype-row";

        const label = document.createElement("span");
        label.className = "iv-daytype-label";
        label.textContent = dt.label;

        row.appendChild(label);

        IV_STAGE_FIELDS.forEach(function (stage) {

            const fieldLabel = document.createElement("label");
            fieldLabel.textContent = stage.label;

            const input = document.createElement("input");
            input.type = "time";
            input.value = (ivTimes[dt.id] && ivTimes[dt.id][stage.id]) || stage.defaultTime;

            input.addEventListener("change", function () {

                if (!ivTimes[dt.id]) {
                    ivTimes[dt.id] = {};
                }

                ivTimes[dt.id][stage.id] = input.value;
                saveIvTimes();
                renderInterventionUI();
            });

            fieldLabel.appendChild(input);
            row.appendChild(fieldLabel);
        });

        container.appendChild(row);
    });
}

function renderIvRangeList() {

    const container = $("ivRangeList");

    if (!container) {
        return;
    }

    container.innerHTML = "";

    if (ivDayRanges.length === 0) {

        const empty = document.createElement("p");
        empty.className = "empty-note";
        empty.textContent = "登録された特別な日はありません。";
        container.appendChild(empty);
        return;
    }

    ivDayRanges.slice().reverse().forEach(function (range, reverseIndex) {

        const index = ivDayRanges.length - 1 - reverseIndex;

        const row = document.createElement("p");
        row.className = "sub";
        row.textContent =
            range.start + "〜" + range.end + "：" +
            (IV_DAY_TYPES.find(function (d) { return d.id === range.type; })?.label || range.type);

        const deleteButton = makeButton("削除", "ghost");

        deleteButton.addEventListener("click", function () {
            ivDayRanges.splice(index, 1);
            saveIvDayRanges();
            renderIvRangeList();
            renderInterventionUI();
        });

        row.appendChild(deleteButton);

        container.appendChild(row);
    });
}

function setupInterventionSystem() {

    renderIvDayTypeSettings();
    renderIvRangeList();

    $("ivRangeAddBtn")?.addEventListener("click", function () {

        const start = $("ivRangeStart")?.value || "";
        const end = $("ivRangeEnd")?.value || "";
        const type = $("ivRangeType")?.value || "specialHoliday";

        if (!start || !end || start > end) {
            alert("開始日・終了日を正しく入力してください。");
            return;
        }

        ivDayRanges.push({ start: start, end: end, type: type });

        saveIvDayRanges();

        renderIvRangeList();
        renderInterventionUI();
    });

    renderInterventionUI();

    setInterval(renderInterventionUI, 60 * 1000);
}


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
    renderMemos();

    /* カレンダー・タイマー */
    setupCalendar();
    renderCalendarAll();
    setupTimer();

    /* その他 */
    loadPatgsProxy();
    renderSubjectPlan();
    updateNotificationStatus();
    updateStreak();
    renderStudyHeatmap();
    renderTodaySummary();
    renderRandomMessage();

    /* ホーム＋専用画面ナビゲーション */
    setupScreenNavigation();
    renderHomeExamCountdown();

    /* ①②予約不足の段階的介入・日タイプ別時刻設定 */
    setupInterventionSystem();

    /* ＋ やる気を高める機能 */
    setupMotivationHub();
    checkBadges();

    console.log("PATGS27 script.js (" + PATGS_VERSION + ") loaded successfully.");
}


/* =========================================================
   アカウントごとの起動
   ========================================================= 
   firebase.js が Google ログインで user.uid を確定させたときに
   window.PATGS_BOOT(uid) を呼び出す。それより前は、上の
   トップレベルの let 変数はすべて名前空間なし（PATGS_UID = null）
   の状態で一度読み込まれているだけで、画面はまだ何も描画されない
   （initializePATGS27() をまだ呼んでいないため）。
   ========================================================= */

let patgsBooted = false;

function patgsReloadAllState() {

    reservations = loadJSON("patgs27_reservations", []);
    weekRequired = loadJSON("patgs27_week_required", {});
    debts = loadJSON("patgs27_debts", []);
    lsRecords = loadJSON("patgs27_ls_records", []);
    changeLogs = loadJSON("patgs27_change_logs", []);
    cancelLogs = loadJSON("patgs27_cancel_logs", []);
    dayTypeOverrides = loadJSON("patgs27_day_type_overrides", {});

    studyMemos = loadJSON("patgs27_study_memos", []);
    temptations = loadJSON("patgs27_temptations", []);
    mockExams = loadJSON("patgs27_mock_exams", []);
    publicPast = loadJSON("patgs27_public_past", []);
    privatePast = loadJSON("patgs27_private_past", []);
    violations = loadJSON("patgs27_violations", []);
    weeklyReviews = loadJSON("patgs27_weekly_reviews", []);

    calendarEvents = loadJSON("patgs27_calendar_events", []);
    migrateToCalendarEvents();

    activeTimer = loadJSON("patgs27_active_timer", null);

    naishinData = loadJSON("patgs27_naishin", {});
    weakPoints = loadJSON("patgs27_weak_points", []);
    questionNotes = loadJSON("patgs27_questions", []);
    subjectPlanNotes = loadJSON("patgs27_subject_notes", {});
    growthData = loadJSON("patgs27_growth", {});
    unlockedBadges = loadJSON("patgs27_badges", []);

    ivTimes = loadJSON("patgs27_intervention_times", null);

    if (!ivTimes) {
        ivTimes = defaultIvTimes();
        saveJSON("patgs27_intervention_times", ivTimes);
    }

    ivDayRanges = loadJSON("patgs27_intervention_day_ranges", []);

    materials = loadJSON("materials", []);

    todos = loadJSON(todoKey(), null);

    if (!Array.isArray(todos)) {
        todos = loadJSON("todos", []);
    }
}

/* firebase.js から、ログインユーザー（user.uid）が確定した時点で
   呼び出される。既存データは削除せず、そのアカウントの専用領域が
   まだ無い場合のみ、旧・共有データをコピーして初期値にする。 */
window.PATGS_BOOT = async function (uid) {

    if (patgsBooted) {
        return;
    }

    patgsBooted = true;

    PATGS_UID = uid || null;

    patgsMigrateLegacyDataForUser(PATGS_UID);

    /* クラウド（Supabase）の方が新しければ、先にlocalStorageへ反映する。
       通信できない・失敗した場合は何もせずローカルのデータで続行する。 */
    await patgsPullFromSupabaseAndMerge(PATGS_UID);

    patgsReloadAllState();

    initializePATGS27();

    /* ログイン直後の状態を必ずクラウド側にも反映しておく
      （初回ログインでの旧データ引き継ぎ分もここで最初の同期がかかる）。 */
    patgsScheduleSync();
};
