"use strict";

/* =========================================================
   PATGS27
   script.js
   =========================================================
   ・日付表示
   ・40日管理
   ・生活リズム自動保存
   ・今日の目標/一言/実績 自動保存
   ・今日の予定
   ・400コマ
   ・コマ成立判定 ○△×
   ・誘惑報告
   ・模試結果
   ・過去問
   ・違反ログ
   ・週次レビュー
   ・テスト・提出物
   ・教材
   ・学習以外の予定
   ========================================================= */


/* =========================================================
   共通関数
   ========================================================= */

function $(id) {
    return document.getElementById(id);
}

function todayKey() {
    const d = new Date();

    return (
        d.getFullYear() +
        "-" +
        String(d.getMonth() + 1).padStart(2, "0") +
        "-" +
        String(d.getDate()).padStart(2, "0")
    );
}

function nowText() {
    const d = new Date();

    return (
        d.getFullYear() +
        "/" +
        String(d.getMonth() + 1).padStart(2, "0") +
        "/" +
        String(d.getDate()).padStart(2, "0") +
        " " +
        String(d.getHours()).padStart(2, "0") +
        ":" +
        String(d.getMinutes()).padStart(2, "0")
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

        localStorage.setItem(
            key,
            JSON.stringify(data)
        );

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

    element._saveTimer = setTimeout(
        function () {
            element.textContent = "自動保存";
        },
        1500
    );
}


/* =========================================================
   PATGS27 40日管理
   =========================================================

   40日目標
   2026/7/18 ～ 2026/8/26

   ※ここを変更すれば運用期間を変更できます。
   ========================================================= */

const PATGS_START = "2026-07-18";
const PATGS_END = "2026-08-26";

const TOTAL_CRAM = 400;


function dateOnly(date) {

    return new Date(
        date.getFullYear(),
        date.getMonth(),
        date.getDate()
    );
}


function updateDateDisplay() {

    const today = dateOnly(new Date());

    const start = dateOnly(
        new Date(PATGS_START + "T00:00:00")
    );

    const end = dateOnly(
        new Date(PATGS_END + "T00:00:00")
    );

    const dayMs =
        24 * 60 * 60 * 1000;


    const elapsed =
        Math.floor(
            (today - start) / dayMs
        ) + 1;


    const remaining =
        Math.max(
            0,
            Math.ceil(
                (end - today) / dayMs
            )
        );


    if ($("todayDate")) {

        $("todayDate").textContent =
            today.getFullYear() +
            "/" +
            (today.getMonth() + 1) +
            "/" +
            today.getDate();
    }


    if ($("dayCount")) {

        if (today < start) {

            $("dayCount").textContent =
                "開始前";

        } else if (today > end) {

            $("dayCount").textContent =
                "40日運用終了";

        } else {

            $("dayCount").textContent =
                "Day " +
                Math.min(40, elapsed) +
                " / 40";
        }
    }


    if ($("daysLeft")) {

        if (today < start) {

            $("daysLeft").textContent =
                "開始まで";

        } else if (today > end) {

            $("daysLeft").textContent =
                "終了";

        } else {

            $("daysLeft").textContent =
                "あと " +
                remaining +
                " 日";
        }
    }


    return {
        today: today,
        remaining: remaining,
        elapsed: elapsed
    };
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

    const isReviewDay =
        WEEKLY_REVIEW_DATES.includes(key);


    let message = "";

    if (isReviewDay) {

        message =
            "🔔 本日は週次レビュー日です。";
    }


    if ($("weeklyReviewNotice")) {

        $("weeklyReviewNotice").textContent =
            message;
    }


    if ($("weeklyReviewNoticeLarge")) {

        $("weeklyReviewNoticeLarge").textContent =
            message;
    }
}


/* =========================================================
   生活リズム
   ========================================================= */

function lifeKey() {

    return "patgs27_life_" + todayKey();
}


function loadLife() {

    const data =
        loadJSON(
            lifeKey(),
            {
                wake: "",
                bath: "",
                sleep: ""
            }
        );


    if ($("wakeStatus")) {

        $("wakeStatus").value =
            data.wake || "";
    }


    if ($("bathStatus")) {

        $("bathStatus").value =
            data.bath || "";
    }


    if ($("sleepStatus")) {

        $("sleepStatus").value =
            data.sleep || "";
    }
}


function saveLife() {

    saveJSON(
        lifeKey(),
        {
            wake:
                $("wakeStatus")?.value || "",

            bath:
                $("bathStatus")?.value || "",

            sleep:
                $("sleepStatus")?.value || ""
        }
    );


    showSave("lifeSaveStatus");
}


[
    "wakeStatus",
    "bathStatus",
    "sleepStatus"
].forEach(
    function (id) {

        if ($(id)) {

            $(id).addEventListener(
                "change",
                saveLife
            );
        }
    }
);


/* =========================================================
   今日の目標・一言・実績
   ========================================================= */

function dailyKey() {

    return "patgs27_daily_" + todayKey();
}


function loadDaily() {

    const oldData = {

        goal:
            localStorage.getItem(
                "goalText"
            ) || "",

        message:
            localStorage.getItem(
                "messageText"
            ) || "",

        result:
            localStorage.getItem(
                "resultText"
            ) || ""
    };


    const data =
        loadJSON(
            dailyKey(),
            oldData
        );


    if ($("goalText")) {

        $("goalText").value =
            data.goal || "";
    }


    if ($("messageText")) {

        $("messageText").value =
            data.message || "";
    }


    if ($("resultText")) {

        $("resultText").value =
            data.result || "";
    }
}


function saveDaily() {

    const data = {

        goal:
            $("goalText")?.value || "",

        message:
            $("messageText")?.value || "",

        result:
            $("resultText")?.value || ""
    };


    saveJSON(
        dailyKey(),
        data
    );


    /* 旧版データとの互換 */

    localStorage.setItem(
        "goalText",
        data.goal
    );

    localStorage.setItem(
        "messageText",
        data.message
    );

    localStorage.setItem(
        "resultText",
        data.result
    );
}


[
    "goalText",
    "messageText",
    "resultText"
].forEach(
    function (id) {

        if ($(id)) {

            $(id).addEventListener(
                "input",
                saveDaily
            );
        }
    }
);


/* =========================================================
   今日の予定
   ========================================================= */

function todoKey() {

    return "patgs27_todos_" + todayKey();
}


let todos =
    loadJSON(
        todoKey(),
        null
    );


if (!Array.isArray(todos)) {

    todos =
        loadJSON(
            "todos",
            []
        );
}


function saveTodos() {

    saveJSON(
        todoKey(),
        todos
    );

    /* 旧版との互換 */

    saveJSON(
        "todos",
        todos
    );
}


function updateTodoRate() {

    const total =
        todos.length;


    const done =
        todos.filter(
            function (todo) {
                return todo.checked;
            }
        ).length;


    const rate =
        total === 0
            ? 0
            : Math.round(
                done / total * 100
            );


    if ($("todoRate")) {

        $("todoRate").textContent =
            "達成率 " +
            rate +
            "%";
    }


    if ($("todoBar")) {

        $("todoBar").value =
            rate;
    }


    if ($("todoComment")) {

        if (total === 0) {

            $("todoComment").textContent =
                "📝予定を追加しよう！";

        } else if (rate === 100) {

            $("todoComment").textContent =
                "🏆今日の予定達成！";

        } else if (rate >= 70) {

            $("todoComment").textContent =
                "🟢順調！";

        } else if (rate >= 40) {

            $("todoComment").textContent =
                "🟡あと少し！";

        } else {

            $("todoComment").textContent =
                "🔴ベースアップしよう！";
        }
    }
}


function renderTodos() {

    const list =
        $("todoList");


    if (!list) {
        return;
    }


    list.innerHTML = "";


    todos.forEach(
        function (todo, index) {

            const row =
                document.createElement(
                    "div"
                );


            const check =
                document.createElement(
                    "input"
                );

            check.type =
                "checkbox";

            check.checked =
                !!todo.checked;


            const text =
                document.createElement(
                    "input"
                );

            text.type =
                "text";

            text.value =
                todo.text || "";

            text.placeholder =
                "予定を入力";


            const deleteButton =
                document.createElement(
                    "button"
                );

            deleteButton.type =
                "button";

            deleteButton.textContent =
                "削除";


            check.addEventListener(
                "change",
                function () {

                    todos[index].checked =
                        check.checked;

                    saveTodos();

                    updateTodoRate();
                }
            );


            text.addEventListener(
                "input",
                function () {

                    todos[index].text =
                        text.value;

                    saveTodos();
                }
            );


            deleteButton.addEventListener(
                "click",
                function () {

                    todos.splice(
                        index,
                        1
                    );

                    saveTodos();

                    renderTodos();
                }
            );


            row.append(
                check,
                " ",
                text,
                " ",
                deleteButton
            );


            list.appendChild(
                row
            );
        }
    );


    updateTodoRate();
}


if ($("addTodoBtn")) {

    $("addTodoBtn").addEventListener(
        "click",
        function () {

            todos.push(
                {
                    text: "",
                    checked: false
                }
            );

            saveTodos();

            renderTodos();
        }
    );
}


/* =========================================================
   400コマ
   ========================================================= */

let cramTotal =
    Number(
        localStorage.getItem(
            "patgs27_cram_total"
        )
    );


if (!Number.isFinite(cramTotal)) {

    cramTotal =
        Number(
            localStorage.getItem(
                "total"
            )
        ) || 0;
}


let cramHistory =
    loadJSON(
        "patgs27_cram_history",
        []
    );


let judgementTotals =
    loadJSON(
        "patgs27_judgement_totals",
        {
            pass: 0,
            review: 0,
            fail: 0
        }
    );


function saveCram() {

    localStorage.setItem(
        "patgs27_cram_total",
        String(cramTotal)
    );


    /* 旧版との互換 */

    localStorage.setItem(
        "total",
        String(cramTotal)
    );


    saveJSON(
        "patgs27_cram_history",
        cramHistory
    );


    saveJSON(
        "patgs27_judgement_totals",
        judgementTotals
    );
}


function cramDraftKey() {

    return (
        "patgs27_cram_draft_" +
        todayKey()
    );
}


function loadCramDraft() {

    const data =
        loadJSON(
            cramDraftKey(),
            {
                goal: 10,
                today: 0,
                pass: 0,
                review: 0,
                fail: 0
            }
        );


    if ($("goal")) {

        $("goal").value =
            data.goal ?? 10;
    }


    if ($("today")) {

        $("today").value =
            data.today ?? 0;
    }


    if ($("cramPass")) {

        $("cramPass").value =
            data.pass ?? 0;
    }


    if ($("cramReview")) {

        $("cramReview").value =
            data.review ?? 0;
    }


    if ($("cramFail")) {

        $("cramFail").value =
            data.fail ?? 0;
    }
}


function saveCramDraft() {

    saveJSON(
        cramDraftKey(),
        {
            goal:
                Number($("goal")?.value) || 0,

            today:
                Number($("today")?.value) || 0,

            pass:
                Number($("cramPass")?.value) || 0,

            review:
                Number($("cramReview")?.value) || 0,

            fail:
                Number($("cramFail")?.value) || 0
        }
    );


    showSave(
        "cramSaveStatus"
    );
}


function updateCramJudgement() {

    const today =
        Number($("today")?.value) || 0;

    const pass =
        Number($("cramPass")?.value) || 0;

    const review =
        Number($("cramReview")?.value) || 0;

    const fail =
        Number($("cramFail")?.value) || 0;


    const sum =
        pass +
        review +
        fail;


    if ($("cramJudgementMessage")) {

        $("cramJudgementMessage").textContent =
            "○＋△＋×＝" +
            sum +
            "コマ / 実施コマ " +
            today +
            "コマ";
    }
}


function updateCramDisplay() {

    const dateInfo =
        updateDateDisplay();


    const goal =
        Number($("goal")?.value) || 0;


    const today =
        Number($("today")?.value) || 0;


    if ($("statusCramText")) {

        $("statusCramText").textContent =
            cramTotal +
            " / " +
            TOTAL_CRAM;
    }


    if ($("totalText")) {

        $("totalText").textContent =
            cramTotal +
            " / " +
            TOTAL_CRAM +
            " コマ";
    }


    if ($("totalBar")) {

        $("totalBar").max =
            TOTAL_CRAM;

        $("totalBar").value =
            Math.min(
                cramTotal,
                TOTAL_CRAM
            );
    }


    if ($("todayBar")) {

        $("todayBar").max =
            Math.max(
                1,
                goal
            );

        $("todayBar").value =
            Math.min(
                today,
                goal
            );
    }


    const remain =
        Math.max(
            0,
            TOTAL_CRAM - cramTotal
        );


    const remainingDays =
        dateInfo.remaining;


    const average =
        remainingDays > 0
            ? (
                remain /
                remainingDays
            ).toFixed(1)
            : "0.0";


    const percent =
        Math.round(
            cramTotal /
            TOTAL_CRAM *
            100
        );


    if ($("remainText")) {

        $("remainText").textContent =
            "残り：" +
            remain +
            "コマ";
    }


    if ($("daysRemainText")) {

        $("daysRemainText").textContent =
            "残り日数：" +
            remainingDays +
            "日";
    }


    if ($("averageText")) {

        $("averageText").textContent =
            "1日平均：" +
            average +
            "コマ必要";
    }


    if ($("percentText")) {

        $("percentText").textContent =
            "達成率：" +
            percent +
            "%";
    }


    if ($("passTotalText")) {

        $("passTotalText").textContent =
            "○成立：" +
            judgementTotals.pass +
            "コマ";
    }


    if ($("reviewTotalText")) {

        $("reviewTotalText").textContent =
            "△要検討：" +
            judgementTotals.review +
            "コマ";
    }


    if ($("failTotalText")) {

        $("failTotalText").textContent =
            "×不成立：" +
            judgementTotals.fail +
            "コマ";
    }


    if ($("commentText")) {

        if (cramTotal >= TOTAL_CRAM) {

            $("commentText").textContent =
                "🏆400コマ達成！";

        } else if (average <= 8) {

            $("commentText").textContent =
                "🟢順調です！";

        } else if (average <= 10) {

            $("commentText").textContent =
                "🟡このペースを維持しよう！";

        } else {

            $("commentText").textContent =
                "🔴残り日数を意識して調整しよう！";
        }
    }


    updateCramJudgement();
}


[
    "goal",
    "today",
    "cramPass",
    "cramReview",
    "cramFail"
].forEach(
    function (id) {

        if ($(id)) {

            $(id).addEventListener(
                "input",
                function () {

                    saveCramDraft();

                    updateCramDisplay();
                }
            );
        }
    }
);


function renderCramHistory() {

    const list =
        $("cramHistory");


    if (!list) {
        return;
    }


    list.innerHTML = "";


    cramHistory
        .slice()
        .reverse()
        .slice(0, 30)
        .forEach(
            function (item) {

                const row =
                    document.createElement(
                        "p"
                    );


                row.textContent =
                    item.dateTime +
                    "｜実施 " +
                    item.total +
                    "｜○ " +
                    item.pass +
                    "｜△ " +
                    item.review +
                    "｜× " +
                    item.fail +
                    "｜400コマ +" +
                    item.addedTo400;


                list.appendChild(
                    row
                );
            }
        );
}


if ($("recordBtn")) {

    $("recordBtn").addEventListener(
        "click",
        function () {

            const today =
                Number($("today")?.value) || 0;

            const pass =
                Number($("cramPass")?.value) || 0;

            const review =
                Number($("cramReview")?.value) || 0;

            const fail =
                Number($("cramFail")?.value) || 0;


            if (today <= 0) {

                alert(
                    "実施コマを入力してください。"
                );

                return;
            }


            if (
                pass +
                review +
                fail !==
                today
            ) {

                alert(
                    "○成立＋△要検討＋×不成立の合計を、実施コマと同じにしてください。"
                );

                return;
            }


            /*

               PATGS27では
               ○成立したコマだけを
               400コマへ加算する。

            */

            cramTotal +=
                pass;


            judgementTotals.pass +=
                pass;

            judgementTotals.review +=
                review;

            judgementTotals.fail +=
                fail;


            cramHistory.push(
                {
                    date:
                        todayKey(),

                    dateTime:
                        nowText(),

                    total:
                        today,

                    pass:
                        pass,

                    review:
                        review,

                    fail:
                        fail,

                    addedTo400:
                        pass
                }
            );


            saveCram();


            if ($("today")) {

                $("today").value =
                    0;
            }


            if ($("cramPass")) {

                $("cramPass").value =
                    0;
            }


            if ($("cramReview")) {

                $("cramReview").value =
                    0;
            }


            if ($("cramFail")) {

                $("cramFail").value =
                    0;
            }


            localStorage.removeItem(
                cramDraftKey()
            );


            updateCramDisplay();

            renderCramHistory();


            showSave(
                "cramSaveStatus",
                "✓ コマ記録を保存しました"
            );
        }
    );
}


/* =========================================================
   誘惑報告
   ========================================================= */

let temptations =
    loadJSON(
        "patgs27_temptations",
        []
    );


function saveTemptations() {

    saveJSON(
        "patgs27_temptations",
        temptations
    );
}


function renderTemptations() {

    const list =
        $("temptationList");


    if (!list) {
        return;
    }


    list.innerHTML = "";


    temptations
        .slice()
        .reverse()
        .forEach(
            function (item, reverseIndex) {

                const row =
                    document.createElement(
                        "p"
                    );


                row.textContent =
                    "⚠️ " +
                    item.dateTime;


                const button =
                    document.createElement(
                        "button"
                    );


                button.type =
                    "button";

                button.textContent =
                    "削除";


                button.addEventListener(
                    "click",
                    function () {

                        const index =
                            temptations.length -
                            1 -
                            reverseIndex;


                        temptations.splice(
                            index,
                            1
                        );


                        saveTemptations();

                        renderTemptations();
                    }
                );


                row.append(
                    " ",
                    button
                );


                list.appendChild(
                    row
                );
            }
        );


    if ($("temptationStatus")) {

        $("temptationStatus").textContent =
            temptations.length > 0
                ? "累計 " +
                  temptations.length +
                  " 件"
                : "未報告";
    }
}


if ($("temptationBtn")) {

    $("temptationBtn").addEventListener(
        "click",
        function () {

            const record =
                {
                    date:
                        todayKey(),

                    dateTime:
                        nowText()
                };


            temptations.push(
                record
            );


            saveTemptations();

            renderTemptations();


            if ($("temptationStatus")) {

                $("temptationStatus").textContent =
                    "✓ " +
                    record.dateTime +
                    " に記録しました";
            }
        }
    );
}


/* =========================================================
   模試結果
   ========================================================= */

let mockExams =
    loadJSON(
        "patgs27_mock_exams",
        []
    );


const MOCK_FIELDS = [
    ["国語", "japanese"],
    ["数学", "math"],
    ["英語", "english"],
    ["理科", "science"],
    ["社会", "social"],
    ["3科", "three"],
    ["5科", "five"],
    ["偏差値", "henshenshi"]
];


function renderMockForm() {

    const form =
        $("mockExamForm");


    if (!form) {
        return;
    }


    form.innerHTML = "";


    const box =
        document.createElement(
            "div"
        );


    const name =
        document.createElement(
            "input"
        );

    name.type =
        "text";

    name.placeholder =
        "模試名（例：全県模試）";


    const date =
        document.createElement(
            "input"
        );

    date.type =
        "date";

    date.value =
        todayKey();


    box.append(
        document.createTextNode(
            "模試名："
        ),
        name,
        document.createTextNode(
            " 日付："
        ),
        date
    );


    box.appendChild(
        document.createElement(
            "br"
        )
    );


    const inputs = {};


    MOCK_FIELDS.forEach(
        function (field) {

            const label =
                document.createElement(
                    "label"
                );

            label.textContent =
                field[0] +
                "：";


            const input =
                document.createElement(
                    "input"
                );

            input.type =
                "number";

            input.min =
                "0";

            input.step =
                "0.1";


            label.appendChild(
                input
            );


            box.append(
                label,
                " "
            );


            inputs[field[1]] =
                input;
        }
    );


    const memo =
        document.createElement(
            "textarea"
        );

    memo.rows =
        3;

    memo.placeholder =
        "メモ";


    box.appendChild(
        memo
    );


    const save =
        document.createElement(
            "button"
        );

    save.type =
        "button";

    save.textContent =
        "模試結果を保存";


    const cancel =
        document.createElement(
            "button"
        );

    cancel.type =
        "button";

    cancel.textContent =
        "キャンセル";


    save.addEventListener(
        "click",
        function () {

            const exam =
                {
                    id:
                        Date.now(),

                    name:
                        name.value.trim() ||
                        "模試",

                    date:
                        date.value ||
                        todayKey(),

                    scores:
                        {},

                    memo:
                        memo.value
                };


            MOCK_FIELDS.forEach(
                function (field) {

                    exam.scores[
                        field[1]
                    ] =
                        inputs[
                            field[1]
                        ].value;
                }
            );


            mockExams.push(
                exam
            );


            saveJSON(
                "patgs27_mock_exams",
                mockExams
            );


            form.innerHTML = "";


            renderMockExams();
        }
    );


    cancel.addEventListener(
        "click",
        function () {

            form.innerHTML = "";
        }
    );


    box.append(
        document.createElement(
            "br"
        ),
        save,
        cancel
    );


    form.appendChild(
        box
    );
}


function renderMockExams() {

    const list =
        $("mockExamList");


    if (!list) {
        return;
    }


    list.innerHTML = "";


    mockExams
        .slice()
        .sort(
            function (a, b) {

                return (
                    a.date || ""
                ).localeCompare(
                    b.date || ""
                );
            }
        )
        .forEach(
            function (exam, index) {

                const box =
                    document.createElement(
                        "div"
                    );


                const title =
                    document.createElement(
                        "h4"
                    );


                title.textContent =
                    exam.date +
                    "｜" +
                    exam.name;


                const scores =
                    document.createElement(
                        "p"
                    );


                scores.textContent =
                    MOCK_FIELDS
                        .map(
                            function (field) {

                                return (
                                    field[0] +
                                    ": " +
                                    (
                                        exam.scores?.[
                                            field[1]
                                        ] ?? ""
                                    )
                                );
                            }
                        )
                        .join("　");


                box.append(
                    title,
                    scores
                );


                if (exam.memo) {

                    const memo =
                        document.createElement(
                            "p"
                        );

                    memo.textContent =
                        "メモ：" +
                        exam.memo;

                    box.appendChild(
                        memo
                    );
                }


                const deleteButton =
                    document.createElement(
                        "button"
                    );

                deleteButton.type =
                    "button";

                deleteButton.textContent =
                    "削除";


                deleteButton.addEventListener(
                    "click",
                    function () {

                        if (
                            !confirm(
                                "この模試結果を削除しますか？"
                            )
                        ) {
                            return;
                        }


                        mockExams.splice(
                            index,
                            1
                        );


                        saveJSON(
                            "patgs27_mock_exams",
                            mockExams
                        );


                        renderMockExams();
                    }
                );


                box.appendChild(
                    deleteButton
                );


                list.appendChild(
                    box
                );
            }
        );
}


if ($("addMockBtn")) {

    $("addMockBtn").addEventListener(
        "click",
        renderMockForm
    );
}


/* =========================================================
   過去問
   ========================================================= */

let publicPast =
    loadJSON(
        "patgs27_public_past",
        []
    );


let privatePast =
    loadJSON(
        "patgs27_private_past",
        []
    );


function addPast(type) {

    const list =
        type === "public"
            ? publicPast
            : privatePast;


    list.push(
        {
            id:
                Date.now(),

            date:
                todayKey(),

            school:
                "",

            subject:
                "",

            score:
                "",

            comparison:
                "",

            note:
                ""
        }
    );


    saveJSON(
        type === "public"
            ? "patgs27_public_past"
            : "patgs27_private_past",
        list
    );


    renderPast(type);
}


function renderPast(type) {

    const container =
        type === "public"
            ? $("publicPastList")
            : $("privatePastList");


    if (!container) {
        return;
    }


    const list =
        type === "public"
            ? publicPast
            : privatePast;


    container.innerHTML = "";


    list.forEach(
        function (record, index) {

            const box =
                document.createElement(
                    "div"
                );


            const date =
                document.createElement(
                    "input"
                );

            date.type =
                "date";

            date.value =
                record.date || "";


            const school =
                document.createElement(
                    "input"
                );

            school.type =
                "text";

            school.placeholder =
                "高校名";

            school.value =
                record.school || "";


            const subject =
                document.createElement(
                    "input"
                );

            subject.type =
                "text";

            subject.placeholder =
                "教科";

            subject.value =
                record.subject || "";


            const score =
                document.createElement(
                    "input"
                );

            score.type =
                "number";

            score.placeholder =
                "得点";

            score.value =
                record.score || "";


            const comparison =
                document.createElement(
                    "input"
                );

            comparison.type =
                "number";


            comparison.placeholder =
                type === "public"
                    ? "平均点"
                    : "前回得点";


            comparison.value =
                record.comparison || "";


            const note =
                document.createElement(
                    "textarea"
                );

            note.rows =
                2;

            note.placeholder =
                "メモ";

            note.value =
                record.note || "";


            function save() {

                record.date =
                    date.value;

                record.school =
                    school.value;

                record.subject =
                    subject.value;

                record.score =
                    score.value;

                record.comparison =
                    comparison.value;

                record.note =
                    note.value;


                saveJSON(
                    type === "public"
                        ? "patgs27_public_past"
                        : "patgs27_private_past",
                    list
                );
            }


            [
                date,
                school,
                subject,
                score,
                comparison
            ].forEach(
                function (input) {

                    input.addEventListener(
                        "input",
                        save
                    );

                    input.addEventListener(
                        "change",
                        save
                    );
                }
            );


            note.addEventListener(
                "input",
                save
            );


            const deleteButton =
                document.createElement(
                    "button"
                );

            deleteButton.type =
                "button";

            deleteButton.textContent =
                "削除";


            deleteButton.addEventListener(
                "click",
                function () {

                    list.splice(
                        index,
                        1
                    );


                    saveJSON(
                        type === "public"
                            ? "patgs27_public_past"
                            : "patgs27_private_past",
                        list
                    );


                    renderPast(type);
                }
            );


            box.append(
                date,
                school,
                subject,
                score,
                comparison,
                note,
                deleteButton
            );


            container.appendChild(
                box
            );
        }
    );
}


if ($("addPublicPastBtn")) {

    $("addPublicPastBtn").addEventListener(
        "click",
        function () {

            addPast("public");
        }
    );
}


if ($("addPrivatePastBtn")) {

    $("addPrivatePastBtn").addEventListener(
        "click",
        function () {

            addPast("private");
        }
    );
}


/* =========================================================
   違反ログ
   ========================================================= */

let violations =
    loadJSON(
        "patgs27_violations",
        []
    );


function saveViolations() {

    saveJSON(
        "patgs27_violations",
        violations
    );
}


function renderViolations() {

    const list =
        $("violationList");


    if (!list) {
        return;
    }


    list.innerHTML = "";


    violations
        .slice()
        .reverse()
        .forEach(
            function (item, reverseIndex) {

                const row =
                    document.createElement(
                        "p"
                    );


                row.textContent =
                    item.dateTime +
                    "｜" +
                    item.level +
                    "｜" +
                    item.text;


                const button =
                    document.createElement(
                        "button"
                    );

                button.type =
                    "button";

                button.textContent =
                    "削除";


                button.addEventListener(
                    "click",
                    function () {

                        const index =
                            violations.length -
                            1 -
                            reverseIndex;


                        violations.splice(
                            index,
                            1
                        );


                        saveViolations();

                        renderViolations();
                    }
                );


                row.append(
                    " ",
                    button
                );


                list.appendChild(
                    row
                );
            }
        );
}


if ($("addViolationBtn")) {

    $("addViolationBtn").addEventListener(
        "click",
        function () {

            const level =
                $("violationLevel")?.value ||
                "";

            const text =
                $("violationText")?.value.trim() ||
                "";


            if (!level || !text) {

                alert(
                    "判定と内容を入力してください。"
                );

                return;
            }


            violations.push(
                {
                    date:
                        todayKey(),

                    dateTime:
                        nowText(),

                    level:
                        level,

                    text:
                        text
                }
            );


            saveViolations();


            $("violationLevel").value =
                "";

            $("violationText").value =
                "";


            renderViolations();
        }
    );
}


/* =========================================================
   週次レビュー
   ========================================================= */

let weeklyReviews =
    loadJSON(
        "patgs27_weekly_reviews",
        []
    );


function saveWeeklyReviews() {

    saveJSON(
        "patgs27_weekly_reviews",
        weeklyReviews
    );
}


function loadWeeklyReview() {

    const current =
        weeklyReviews.find(
            function (item) {

                return (
                    item.week ===
                    todayKey()
                );
            }
        );


    if ($("weeklyReviewText")) {

        $("weeklyReviewText").value =
            current?.text || "";
    }
}


function saveWeeklyReview() {

    if (!$("weeklyReviewText")) {
        return;
    }


    const key =
        todayKey();


    let current =
        weeklyReviews.find(
            function (item) {

                return (
                    item.week ===
                    key
                );
            }
        );


    if (!current) {

        current =
            {
                week:
                    key,

                dateTime:
                    nowText(),

                text:
                    ""
            };


        weeklyReviews.push(
            current
        );
    }


    current.text =
        $("weeklyReviewText").value;


    current.updatedAt =
        nowText();


    saveWeeklyReviews();


    showSave(
        "weeklyReviewSaveStatus"
    );


    renderWeeklyReviews();
}


function renderWeeklyReviews() {

    const list =
        $("weeklyReviewList");


    if (!list) {
        return;
    }


    list.innerHTML = "";


    weeklyReviews
        .slice()
        .reverse()
        .forEach(
            function (item) {

                const box =
                    document.createElement(
                        "div"
                    );


                const title =
                    document.createElement(
                        "strong"
                    );


                title.textContent =
                    item.week +
                    "｜" +
                    (
                        item.updatedAt ||
                        item.dateTime ||
                        ""
                    );


                const text =
                    document.createElement(
                        "p"
                    );


                text.textContent =
                    item.text ||
                    "（未入力）";


                box.append(
                    title,
                    text
                );


                list.appendChild(
                    box
                );
            }
        );
}


if ($("weeklyReviewText")) {

    $("weeklyReviewText").addEventListener(
        "input",
        saveWeeklyReview
    );
}


/* =========================================================
   テスト・提出物
   ========================================================= */

let exams =
    loadJSON(
        "exams",
        []
    );


function saveExams() {

    saveJSON(
        "exams",
        exams
    );
}


function renderExams() {

    const list =
        $("examList");


    if (!list) {
        return;
    }


    list.innerHTML = "";


    exams.forEach(
        function (exam, index) {

            const row =
                document.createElement(
                    "div"
                );


            const type =
                document.createElement(
                    "select"
                );


            [
                "提出物",
                "テスト",
                "模試"
            ].forEach(
                function (value) {

                    const option =
                        document.createElement(
                            "option"
                        );

                    option.value =
                        value;

                    option.textContent =
                        value;

                    type.appendChild(
                        option
                    );
                }
            );


            type.value =
                exam.type ||
                "提出物";


            const date =
                document.createElement(
                    "input"
                );

            date.type =
                "date";

            date.value =
                exam.date ||
                "";


            const text =
                document.createElement(
                    "input"
                );

            text.type =
                "text";

            text.value =
                exam.text ||
                "";

            text.placeholder =
                "内容";


            const done =
                document.createElement(
                    "input"
                );

            done.type =
                "checkbox";

            done.checked =
                !!exam.done;


            const deleteButton =
                document.createElement(
                    "button"
                );

            deleteButton.type =
                "button";

            deleteButton.textContent =
                "削除";


            function save() {

                exam.type =
                    type.value;

                exam.date =
                    date.value;

                exam.text =
                    text.value;

                exam.done =
                    done.checked;


                saveExams();
            }


            type.addEventListener(
                "change",
                save
            );

            date.addEventListener(
                "change",
                save
            );

            text.addEventListener(
                "input",
                save
            );

            done.addEventListener(
                "change",
                save
            );


            deleteButton.addEventListener(
                "click",
                function () {

                    exams.splice(
                        index,
                        1
                    );

                    saveExams();

                    renderExams();
                }
            );


            row.append(
                type,
                " ",
                date,
                " ",
                text,
                " ",
                done,
                " 完了 ",
                deleteButton
            );


            list.appendChild(
                row
            );
        }
    );
}


if ($("addExamBtn")) {

    $("addExamBtn").addEventListener(
        "click",
        function () {

            exams.push(
                {
                    type:
                        "提出物",

                    date:
                        "",

                    text:
                        "",

                    done:
                        false
                }
            );


            saveExams();

            renderExams();
        }
    );
}


/* =========================================================
   教材
   ========================================================= */

let materials =
    loadJSON(
        "materials",
        []
    );


function saveMaterials() {

    saveJSON(
        "materials",
        materials
    );
}


function renderMaterials() {

    const list =
        $("materialList");


    if (!list) {
        return;
    }


    list.innerHTML = "";


    materials.forEach(
        function (material, index) {

            const row =
                document.createElement(
                    "div"
                );


            const check =
                document.createElement(
                    "input"
                );

            check.type =
                "checkbox";

            check.checked =
                !!material.checked;


            const text =
                document.createElement(
                    "input"
                );

            text.type =
                "text";

            text.value =
                material.text ||
                "";

            text.placeholder =
                "教材名";


            const deleteButton =
                document.createElement(
                    "button"
                );

            deleteButton.type =
                "button";

            deleteButton.textContent =
                "削除";


            check.addEventListener(
                "change",
                function () {

                    materials[index].checked =
                        check.checked;

                    saveMaterials();
                }
            );


            text.addEventListener(
                "input",
                function () {

                    materials[index].text =
                        text.value;

                    saveMaterials();
                }
            );


            deleteButton.addEventListener(
                "click",
                function () {

                    materials.splice(
                        index,
                        1
                    );

                    saveMaterials();

                    renderMaterials();
                }
            );


            row.append(
                check,
                " ",
                text,
                " ",
                deleteButton
            );


            list.appendChild(
                row
            );
        }
    );
}


if ($("addMaterialBtn")) {

    $("addMaterialBtn").addEventListener(
        "click",
        function () {

            materials.push(
                {
                    text:
                        "新しい教材",

                    checked:
                        false
                }
            );


            saveMaterials();

            renderMaterials();
        }
    );
}


/* =========================================================
   学習以外の予定
   ========================================================= */

if ($("otherSchedule")) {

    $("otherSchedule").value =
        localStorage.getItem(
            "otherSchedule"
        ) || "";


    $("otherSchedule").addEventListener(
        "input",
        function () {

            localStorage.setItem(
                "otherSchedule",
                $("otherSchedule").value
            );
        }
    );
}


/* =========================================================
   初期化
   ========================================================= */

function initializePATGS27() {

    loadLife();

    loadDaily();

    renderTodos();

    loadCramDraft();

    updateDateDisplay();

    updateWeeklyNotice();

    updateCramDisplay();

    renderCramHistory();

    renderTemptations();

    renderMockExams();

    renderPast(
        "public"
    );

    renderPast(
        "private"
    );

    renderViolations();

    loadWeeklyReview();

    renderWeeklyReviews();

    renderExams();

    renderMaterials();


    console.log(
        "PATGS27 script.js loaded successfully."
    );
}


initializePATGS27();

// =========================================
// PATGS27 日付・予定管理
// =========================================

const DEFAULT_PATGS_SCHEDULE = [
    {
        id: "summerVacationEnd",
        name: "夏休み終了",
        date: "2026-08-26",
        icon: "🌻",
        fixed: true
    },

    {
        id: "mockExam1",
        name: "第1回模試",
        date: "",
        icon: "📝",
        fixed: false
    },

    {
        id: "regularTest",
        name: "定期テスト",
        date: "",
        icon: "📚",
        fixed: false
    },

    {
        id: "entranceExam",
        name: "入試",
        date: "2027-02-16",
        icon: "🎓",
        fixed: true
    },

    {
        id: "resultAnnouncement",
        name: "合格発表",
        date: "2027-02-26",
        icon: "🏆",
        fixed: true
    }
];


// =========================================
// 保存・読み込み
// =========================================

let patgsSchedule =
    loadJSON(
        "patgs27_schedule",
        null
    );


if (!Array.isArray(patgsSchedule)) {

    patgsSchedule =
        DEFAULT_PATGS_SCHEDULE.map(
            function (item) {
                return {
                    ...item
                };
            }
        );

    saveJSON(
        "patgs27_schedule",
        patgsSchedule
    );
}


// =========================================
// 日付計算
// =========================================

function getDaysUntil(targetDate) {

    if (!targetDate) {
        return null;
    }

    const today =
        new Date();

    today.setHours(
        0,
        0,
        0,
        0
    );


    const target =
        new Date(
            targetDate + "T00:00:00"
        );

    target.setHours(
        0,
        0,
        0,
        0
    );


    const difference =
        target - today;


    return Math.round(
        difference /
        (1000 * 60 * 60 * 24)
    );
}


function formatDays(days) {

    if (days === null) {
        return "日付未設定";
    }


    if (days > 0) {

        return "あと " +
            days +
            " 日";
    }


    if (days === 0) {

        return "今日";
    }


    return Math.abs(days) +
        " 日経過";
}


// =========================================
// IDで予定を探す
// =========================================

function findSchedule(id) {

    return patgsSchedule.find(
        function (item) {
            return item.id === id;
        }
    );
}


// =========================================
// 上部カウントダウン
// =========================================

function updatePATGSDashboard() {

    const todayElement =
        document.getElementById(
            "todayDate"
        );


    if (todayElement) {

        const today =
            new Date();

        todayElement.textContent =
            today.getFullYear() +
            "/" +
            (today.getMonth() + 1) +
            "/" +
            today.getDate();
    }


    const summer =
        findSchedule(
            "summerVacationEnd"
        );


    const entrance =
        findSchedule(
            "entranceExam"
        );


    const result =
        findSchedule(
            "resultAnnouncement"
        );


    // 夏休み終了

    const summerElement =
        document.getElementById(
            "summerVacationDays"
        );


    if (summerElement) {

        summerElement.textContent =
            formatDays(
                getDaysUntil(
                    summer?.date
                )
            );
    }


    // 入試

    const entranceElement =
        document.getElementById(
            "entranceExamDays"
        );


    if (entranceElement) {

        entranceElement.textContent =
            formatDays(
                getDaysUntil(
                    entrance?.date
                )
            );
    }


    // 合格発表

    const resultElement =
        document.getElementById(
            "resultDays"
        );


    if (resultElement) {

        resultElement.textContent =
            formatDays(
                getDaysUntil(
                    result?.date
                )
            );
    }


    // カードの日付表示も自動変更

    const dateCards =
        document.querySelectorAll(
            ".remain-date"
        );


    if (dateCards.length >= 3) {

        dateCards[0].textContent =
            summer?.date || "未設定";

        dateCards[1].textContent =
            entrance?.date || "未設定";

        dateCards[2].textContent =
            result?.date || "未設定";
    }
}


// =========================================
// 日付設定画面
// =========================================

function renderScheduleSettings() {

    const container =
        document.getElementById(
            "patgsDateSettings"
        );


    if (!container) {
        return;
    }


    container.innerHTML = "";


    patgsSchedule.forEach(
        function (event, index) {

            const row =
                document.createElement(
                    "div"
                );

            row.className =
                "schedule-setting-row";


            // 名前

            const name =
                document.createElement(
                    "input"
                );

            name.type =
                "text";

            name.value =
                event.name || "";

            name.placeholder =
                "予定名";


            // 日付

            const date =
                document.createElement(
                    "input"
                );

            date.type =
                "date";

            date.value =
                event.date || "";


            // アイコン

            const icon =
                document.createElement(
                    "input"
                );

            icon.type =
                "text";

            icon.value =
                event.icon || "📅";

            icon.placeholder =
                "アイコン";


            // 保存

            function save() {

                event.name =
                    name.value;

                event.date =
                    date.value;

                event.icon =
                    icon.value ||
                    "📅";


                saveJSON(
                    "patgs27_schedule",
                    patgsSchedule
                );


                updatePATGSDashboard();

                updateSchedule();
            }


            name.addEventListener(
                "input",
                save
            );


            date.addEventListener(
                "change",
                save
            );


            icon.addEventListener(
                "input",
                save
            );


            // 削除

            const deleteButton =
                document.createElement(
                    "button"
                );

            deleteButton.type =
                "button";

            deleteButton.textContent =
                "削除";


            deleteButton.addEventListener(
                "click",
                function () {

                    if (
                        !confirm(
                            "「" +
                            (event.name || "この予定") +
                            "」を削除しますか？"
                        )
                    ) {
                        return;
                    }


                    patgsSchedule.splice(
                        index,
                        1
                    );


                    saveJSON(
                        "patgs27_schedule",
                        patgsSchedule
                    );


                    renderScheduleSettings();

                    updatePATGSDashboard();

                    updateSchedule();
                }
            );


            row.append(
                icon,
                " ",
                name,
                " ",
                date,
                " ",
                deleteButton
            );


            container.appendChild(
                row
            );
        }
    );
}


// =========================================
// 予定追加
// =========================================

const addScheduleSettingBtn =
    document.getElementById(
        "addScheduleSettingBtn"
    );


if (addScheduleSettingBtn) {

    addScheduleSettingBtn.addEventListener(
        "click",
        function () {

            patgsSchedule.push(
                {
                    id:
                        "schedule_" +
                        Date.now(),

                    name:
                        "新しい予定",

                    date:
                        "",

                    icon:
                        "📅",

                    fixed:
                        false
                }
            );


            saveJSON(
                "patgs27_schedule",
                patgsSchedule
            );


            renderScheduleSettings();

            updatePATGSDashboard();

            updateSchedule();
        }
    );
}


// =========================================
// 今後の重要予定
// =========================================

function updateSchedule() {

    const container =
        document.getElementById(
            "upcomingScheduleList"
        );


    if (!container) {
        return;
    }


    container.innerHTML = "";


    const today =
        new Date();

    today.setHours(
        0,
        0,
        0,
        0
    );


    patgsSchedule
        .filter(
            function (event) {

                return !!event.date;
            }
        )
        .map(
            function (event) {

                const target =
                    new Date(
                        event.date +
                        "T00:00:00"
                    );

                target.setHours(
                    0,
                    0,
                    0,
                    0
                );


                const diff =
                    Math.round(
                        (
                            target -
                            today
                        ) /
                        (
                            1000 *
                            60 *
                            60 *
                            24
                        )
                    );


                return {
                    ...event,
                    diff: diff
                };
            }
        )
        .filter(
            function (event) {

                return event.diff >= 0;
            }
        )
        .sort(
            function (a, b) {

                return a.diff - b.diff;
            }
        )
        .forEach(
            function (event) {

                const item =
                    document.createElement(
                        "div"
                    );


                item.className =
                    "schedule-item";


                const name =
                    document.createElement(
                        "div"
                    );

                name.className =
                    "schedule-name";

                name.textContent =
                    (
                        event.icon ||
                        "📅"
                    ) +
                    " " +
                    event.name;


                const date =
                    document.createElement(
                        "div"
                    );

                date.className =
                    "schedule-date";

                date.textContent =
                    event.date;


                const days =
                    document.createElement(
                        "div"
                    );

                days.className =
                    "schedule-days";


                if (event.diff === 0) {

                    days.textContent =
                        "今日";

                } else {

                    days.textContent =
                        "あと " +
                        event.diff +
                        " 日";
                }


                item.append(
                    name,
                    date,
                    days
                );


                container.appendChild(
                    item
                );
            }
        );
}


// =========================================
// 初期化
// =========================================

renderScheduleSettings();

updatePATGSDashboard();

updateSchedule();

// =========================================
// PATGS27 日付・予定管理
// =========================================

const DEFAULT_PATGS_SCHEDULE = [
    {
        id: "summerVacationEnd",
        name: "夏休み終了",
        date: "2026-08-26",
        icon: "🌻",
        fixed: true
    },

    {
        id: "mockExam1",
        name: "第1回模試",
        date: "",
        icon: "📝",
        fixed: false
    },

    {
        id: "regularTest",
        name: "定期テスト",
        date: "",
        icon: "📚",
        fixed: false
    },

    {
        id: "entranceExam",
        name: "入試",
        date: "2027-02-16",
        icon: "🎓",
        fixed: true
    },

    {
        id: "resultAnnouncement",
        name: "合格発表",
        date: "2027-02-26",
        icon: "🏆",
        fixed: true
    }
];


// =========================================
// 保存・読み込み
// =========================================

let patgsSchedule =
    loadJSON(
        "patgs27_schedule",
        null
    );


if (!Array.isArray(patgsSchedule)) {

    patgsSchedule =
        DEFAULT_PATGS_SCHEDULE.map(
            function (item) {
                return {
                    ...item
                };
            }
        );

    saveJSON(
        "patgs27_schedule",
        patgsSchedule
    );
}


// =========================================
// 日付計算
// =========================================

function getDaysUntil(targetDate) {

    if (!targetDate) {
        return null;
    }

    const today =
        new Date();

    today.setHours(
        0,
        0,
        0,
        0
    );


    const target =
        new Date(
            targetDate + "T00:00:00"
        );

    target.setHours(
        0,
        0,
        0,
        0
    );


    const difference =
        target - today;


    return Math.round(
        difference /
        (1000 * 60 * 60 * 24)
    );
}


function formatDays(days) {

    if (days === null) {
        return "日付未設定";
    }


    if (days > 0) {

        return "あと " +
            days +
            " 日";
    }


    if (days === 0) {

        return "今日";
    }


    return Math.abs(days) +
        " 日経過";
}


// =========================================
// IDで予定を探す
// =========================================

function findSchedule(id) {

    return patgsSchedule.find(
        function (item) {
            return item.id === id;
        }
    );
}


// =========================================
// 上部カウントダウン
// =========================================

function updatePATGSDashboard() {

    const todayElement =
        document.getElementById(
            "todayDate"
        );


    if (todayElement) {

        const today =
            new Date();

        todayElement.textContent =
            today.getFullYear() +
            "/" +
            (today.getMonth() + 1) +
            "/" +
            today.getDate();
    }


    const summer =
        findSchedule(
            "summerVacationEnd"
        );


    const entrance =
        findSchedule(
            "entranceExam"
        );


    const result =
        findSchedule(
            "resultAnnouncement"
        );


    // 夏休み終了

    const summerElement =
        document.getElementById(
            "summerVacationDays"
        );


    if (summerElement) {

        summerElement.textContent =
            formatDays(
                getDaysUntil(
                    summer?.date
                )
            );
    }


    // 入試

    const entranceElement =
        document.getElementById(
            "entranceExamDays"
        );


    if (entranceElement) {

        entranceElement.textContent =
            formatDays(
                getDaysUntil(
                    entrance?.date
                )
            );
    }


    // 合格発表

    const resultElement =
        document.getElementById(
            "resultDays"
        );


    if (resultElement) {

        resultElement.textContent =
            formatDays(
                getDaysUntil(
                    result?.date
                )
            );
    }


    // カードの日付表示も自動変更

    const dateCards =
        document.querySelectorAll(
            ".remain-date"
        );


    if (dateCards.length >= 3) {

        dateCards[0].textContent =
            summer?.date || "未設定";

        dateCards[1].textContent =
            entrance?.date || "未設定";

        dateCards[2].textContent =
            result?.date || "未設定";
    }
}


// =========================================
// 日付設定画面
// =========================================

function renderScheduleSettings() {

    const container =
        document.getElementById(
            "patgsDateSettings"
        );


    if (!container) {
        return;
    }


    container.innerHTML = "";


    patgsSchedule.forEach(
        function (event, index) {

            const row =
                document.createElement(
                    "div"
                );

            row.className =
                "schedule-setting-row";


            // 名前

            const name =
                document.createElement(
                    "input"
                );

            name.type =
                "text";

            name.value =
                event.name || "";

            name.placeholder =
                "予定名";


            // 日付

            const date =
                document.createElement(
                    "input"
                );

            date.type =
                "date";

            date.value =
                event.date || "";


            // アイコン

            const icon =
                document.createElement(
                    "input"
                );

            icon.type =
                "text";

            icon.value =
                event.icon || "📅";

            icon.placeholder =
                "アイコン";


            // 保存

            function save() {

                event.name =
                    name.value;

                event.date =
                    date.value;

                event.icon =
                    icon.value ||
                    "📅";


                saveJSON(
                    "patgs27_schedule",
                    patgsSchedule
                );


                updatePATGSDashboard();

                updateSchedule();
            }


            name.addEventListener(
                "input",
                save
            );


            date.addEventListener(
                "change",
                save
            );


            icon.addEventListener(
                "input",
                save
            );


            // 削除

            const deleteButton =
                document.createElement(
                    "button"
                );

            deleteButton.type =
                "button";

            deleteButton.textContent =
                "削除";


            deleteButton.addEventListener(
                "click",
                function () {

                    if (
                        !confirm(
                            "「" +
                            (event.name || "この予定") +
                            "」を削除しますか？"
                        )
                    ) {
                        return;
                    }


                    patgsSchedule.splice(
                        index,
                        1
                    );


                    saveJSON(
                        "patgs27_schedule",
                        patgsSchedule
                    );


                    renderScheduleSettings();

                    updatePATGSDashboard();

                    updateSchedule();
                }
            );


            row.append(
                icon,
                " ",
                name,
                " ",
                date,
                " ",
                deleteButton
            );


            container.appendChild(
                row
            );
        }
    );
}


// =========================================
// 予定追加
// =========================================

const addScheduleSettingBtn =
    document.getElementById(
        "addScheduleSettingBtn"
    );


if (addScheduleSettingBtn) {

    addScheduleSettingBtn.addEventListener(
        "click",
        function () {

            patgsSchedule.push(
                {
                    id:
                        "schedule_" +
                        Date.now(),

                    name:
                        "新しい予定",

                    date:
                        "",

                    icon:
                        "📅",

                    fixed:
                        false
                }
            );


            saveJSON(
                "patgs27_schedule",
                patgsSchedule
            );


            renderScheduleSettings();

            updatePATGSDashboard();

            updateSchedule();
        }
    );
}


// =========================================
// 今後の重要予定
// =========================================

function updateSchedule() {

    const container =
        document.getElementById(
            "upcomingScheduleList"
        );


    if (!container) {
        return;
    }


    container.innerHTML = "";


    const today =
        new Date();

    today.setHours(
        0,
        0,
        0,
        0
    );


    patgsSchedule
        .filter(
            function (event) {

                return !!event.date;
            }
        )
        .map(
            function (event) {

                const target =
                    new Date(
                        event.date +
                        "T00:00:00"
                    );

                target.setHours(
                    0,
                    0,
                    0,
                    0
                );


                const diff =
                    Math.round(
                        (
                            target -
                            today
                        ) /
                        (
                            1000 *
                            60 *
                            60 *
                            24
                        )
                    );


                return {
                    ...event,
                    diff: diff
                };
            }
        )
        .filter(
            function (event) {

                return event.diff >= 0;
            }
        )
        .sort(
            function (a, b) {

                return a.diff - b.diff;
            }
        )
        .forEach(
            function (event) {

                const item =
                    document.createElement(
                        "div"
                    );


                item.className =
                    "schedule-item";


                const name =
                    document.createElement(
                        "div"
                    );

                name.className =
                    "schedule-name";

                name.textContent =
                    (
                        event.icon ||
                        "📅"
                    ) +
                    " " +
                    event.name;


                const date =
                    document.createElement(
                        "div"
                    );

                date.className =
                    "schedule-date";

                date.textContent =
                    event.date;


                const days =
                    document.createElement(
                        "div"
                    );

                days.className =
                    "schedule-days";


                if (event.diff === 0) {

                    days.textContent =
                        "今日";

                } else {

                    days.textContent =
                        "あと " +
                        event.diff +
                        " 日";
                }


                item.append(
                    name,
                    date,
                    days
                );


                container.appendChild(
                    item
                );
            }
        );
}


// =========================================
// 初期化
// =========================================

renderScheduleSettings();

updatePATGSDashboard();

updateSchedule();
