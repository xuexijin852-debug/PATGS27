"use strict";

/* =========================================================
   PATGS27
   script.js
   =========================================================
   ・日付表示
   ・生活リズム自動保存
   ・今日の目標/一言/実績 自動保存
   ・今日の予定
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

            renderScoreTrend();
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

                        renderScoreTrend();
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

let otherSchedules =
    loadJSON(
        "patgs27_other_schedule",
        []
    );


function saveOtherSchedules() {

    saveJSON(
        "patgs27_other_schedule",
        otherSchedules
    );
}


function renderOtherSchedules() {

    const list =
        $("otherScheduleList");


    if (!list) {
        return;
    }


    list.innerHTML = "";


    otherSchedules.forEach(
        function (item, index) {

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
                !!item.checked;


            const text =
                document.createElement(
                    "input"
                );

            text.type =
                "text";

            text.value =
                item.text ||
                "";

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

                    otherSchedules[index].checked =
                        check.checked;

                    saveOtherSchedules();
                }
            );


            text.addEventListener(
                "input",
                function () {

                    otherSchedules[index].text =
                        text.value;

                    saveOtherSchedules();
                }
            );


            deleteButton.addEventListener(
                "click",
                function () {

                    otherSchedules.splice(
                        index,
                        1
                    );

                    saveOtherSchedules();

                    renderOtherSchedules();
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


if ($("addOtherScheduleBtn")) {

    $("addOtherScheduleBtn").addEventListener(
        "click",
        function () {

            otherSchedules.push(
                {
                    text:
                        "",

                    checked:
                        false
                }
            );


            saveOtherSchedules();

            renderOtherSchedules();
        }
    );
}


/* =========================================================
   データのバックアップ（エクスポート／インポート）
   ========================================================= */

function exportAllData() {

    const data = {};


    for (
        let i = 0;
        i < localStorage.length;
        i++
    ) {

        const key =
            localStorage.key(i);

        data[key] =
            localStorage.getItem(key);
    }


    const blob =
        new Blob(
            [
                JSON.stringify(
                    data,
                    null,
                    2
                )
            ],
            {
                type: "application/json"
            }
        );


    const url =
        URL.createObjectURL(blob);


    const link =
        document.createElement(
            "a"
        );

    link.href =
        url;

    link.download =
        "patgs27_backup_" +
        todayKey() +
        ".json";


    document.body.appendChild(
        link
    );

    link.click();

    document.body.removeChild(
        link
    );

    URL.revokeObjectURL(
        url
    );


    if ($("backupStatus")) {

        $("backupStatus").textContent =
            "✓ 書き出しました。";
    }
}


function importAllData(file) {

    const reader =
        new FileReader();


    reader.onload =
        function (event) {

            try {

                const data =
                    JSON.parse(
                        event.target.result
                    );


                Object.keys(data).forEach(
                    function (key) {

                        localStorage.setItem(
                            key,
                            data[key]
                        );
                    }
                );


                if ($("backupStatus")) {

                    $("backupStatus").textContent =
                        "✓ 読み込みました。ページを再読み込みします。";
                }


                setTimeout(
                    function () {

                        location.reload();
                    },
                    800
                );

            } catch (error) {

                console.error(
                    "インポートエラー:",
                    error
                );


                if ($("backupStatus")) {

                    $("backupStatus").textContent =
                        "✗ 読み込みに失敗しました。ファイルを確認してください。";
                }
            }
        };


    reader.readAsText(file);
}


if ($("exportDataBtn")) {

    $("exportDataBtn").addEventListener(
        "click",
        exportAllData
    );
}


if ($("importDataBtn")) {

    $("importDataBtn").addEventListener(
        "click",
        function () {

            $("importDataInput")?.click();
        }
    );
}


if ($("importDataInput")) {

    $("importDataInput").addEventListener(
        "change",
        function (event) {

            const file =
                event.target.files[0];


            if (file) {

                importAllData(file);
            }
        }
    );
}


/* =========================================================
   内申点管理
   ========================================================= */

const NAISHIN_SUBJECTS = [
    "国語",
    "数学",
    "理科",
    "社会",
    "英語",
    "保健体育",
    "音楽",
    "技術家庭",
    "美術"
];


let naishinData =
    loadJSON(
        "patgs27_naishin",
        {}
    );


function saveNaishin() {

    saveJSON(
        "patgs27_naishin",
        naishinData
    );
}


function updateNaishinTotal() {

    let currentSum = 0;

    let targetSum = 0;


    NAISHIN_SUBJECTS.forEach(
        function (subject) {

            const entry =
                naishinData[subject] ||
                {};

            currentSum +=
                Number(entry.current) || 0;

            targetSum +=
                Number(entry.target) || 0;
        }
    );


    if ($("naishinTotal")) {

        $("naishinTotal").textContent =
            "現在合計：" +
            currentSum +
            " ／ 目標合計：" +
            targetSum;
    }
}


function renderNaishin() {

    const list =
        $("naishinList");


    if (!list) {
        return;
    }


    list.innerHTML = "";


    NAISHIN_SUBJECTS.forEach(
        function (subject) {

            if (!naishinData[subject]) {

                naishinData[subject] =
                    {
                        current: "",
                        target: ""
                    };
            }


            const row =
                document.createElement(
                    "div"
                );


            const label =
                document.createElement(
                    "span"
                );

            label.textContent =
                subject +
                "：";


            const current =
                document.createElement(
                    "input"
                );

            current.type =
                "number";

            current.min =
                "1";

            current.max =
                "5";

            current.placeholder =
                "現在";

            current.value =
                naishinData[subject].current ||
                "";


            const target =
                document.createElement(
                    "input"
                );

            target.type =
                "number";

            target.min =
                "1";

            target.max =
                "5";

            target.placeholder =
                "目標";

            target.value =
                naishinData[subject].target ||
                "";


            function save() {

                naishinData[subject].current =
                    current.value;

                naishinData[subject].target =
                    target.value;


                saveNaishin();

                updateNaishinTotal();
            }


            current.addEventListener(
                "input",
                save
            );

            target.addEventListener(
                "input",
                save
            );


            row.append(
                label,
                document.createTextNode(
                    "現在："
                ),
                current,
                document.createTextNode(
                    " 目標："
                ),
                target
            );


            list.appendChild(
                row
            );
        }
    );


    updateNaishinTotal();
}


/* =========================================================
   弱点単元・要復習リスト
   ========================================================= */

let weakPoints =
    loadJSON(
        "patgs27_weak_points",
        []
    );


function saveWeakPoints() {

    saveJSON(
        "patgs27_weak_points",
        weakPoints
    );
}


function renderWeakPoints() {

    const list =
        $("weakPointList");


    if (!list) {
        return;
    }


    list.innerHTML = "";


    weakPoints
        .slice()
        .reverse()
        .forEach(
            function (item, reverseIndex) {

                const index =
                    weakPoints.length -
                    1 -
                    reverseIndex;


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
                    !!item.done;


                const label =
                    document.createElement(
                        "span"
                    );

                label.textContent =
                    "【" +
                    (
                        item.subject ||
                        "その他"
                    ) +
                    "】" +
                    item.text;


                if (item.done) {

                    label.style.textDecoration =
                        "line-through";
                }


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

                        weakPoints[index].done =
                            check.checked;

                        saveWeakPoints();

                        renderWeakPoints();
                    }
                );


                deleteButton.addEventListener(
                    "click",
                    function () {

                        weakPoints.splice(
                            index,
                            1
                        );

                        saveWeakPoints();

                        renderWeakPoints();
                    }
                );


                row.append(
                    check,
                    " ",
                    label,
                    " ",
                    deleteButton
                );


                list.appendChild(
                    row
                );
            }
        );
}


if ($("addWeakPointBtn")) {

    $("addWeakPointBtn").addEventListener(
        "click",
        function () {

            const subject =
                $("weakPointSubject")?.value ||
                "";

            const text =
                $("weakPointText")?.value.trim() ||
                "";


            if (!text) {

                alert(
                    "内容を入力してください。"
                );

                return;
            }


            weakPoints.push(
                {
                    subject:
                        subject,

                    text:
                        text,

                    done:
                        false,

                    dateTime:
                        nowText()
                }
            );


            saveWeakPoints();


            $("weakPointText").value =
                "";

            $("weakPointSubject").value =
                "";


            renderWeakPoints();
        }
    );
}


/* =========================================================
   質問・確認事項メモ
   ========================================================= */

let questionNotes =
    loadJSON(
        "patgs27_questions",
        []
    );


function saveQuestionNotes() {

    saveJSON(
        "patgs27_questions",
        questionNotes
    );
}


function renderQuestionNotes() {

    const list =
        $("questionList");


    if (!list) {
        return;
    }


    list.innerHTML = "";


    questionNotes
        .slice()
        .reverse()
        .forEach(
            function (item, reverseIndex) {

                const index =
                    questionNotes.length -
                    1 -
                    reverseIndex;


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
                    !!item.done;


                const label =
                    document.createElement(
                        "span"
                    );

                label.textContent =
                    "【" +
                    (
                        item.target ||
                        "未指定"
                    ) +
                    "】" +
                    item.text;


                if (item.done) {

                    label.style.textDecoration =
                        "line-through";
                }


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

                        questionNotes[index].done =
                            check.checked;

                        saveQuestionNotes();

                        renderQuestionNotes();
                    }
                );


                deleteButton.addEventListener(
                    "click",
                    function () {

                        questionNotes.splice(
                            index,
                            1
                        );

                        saveQuestionNotes();

                        renderQuestionNotes();
                    }
                );


                row.append(
                    check,
                    " ",
                    label,
                    " ",
                    deleteButton
                );


                list.appendChild(
                    row
                );
            }
        );
}


if ($("addQuestionBtn")) {

    $("addQuestionBtn").addEventListener(
        "click",
        function () {

            const target =
                $("questionTarget")?.value ||
                "";

            const text =
                $("questionText")?.value.trim() ||
                "";


            if (!text) {

                alert(
                    "内容を入力してください。"
                );

                return;
            }


            questionNotes.push(
                {
                    target:
                        target,

                    text:
                        text,

                    done:
                        false,

                    dateTime:
                        nowText()
                }
            );


            saveQuestionNotes();


            $("questionText").value =
                "";

            $("questionTarget").value =
                "";


            renderQuestionNotes();
        }
    );
}


/* =========================================================
   模試 偏差値の推移グラフ
   ========================================================= */

function renderScoreTrend() {

    const canvas =
        $("scoreTrendChart");


    if (!canvas) {
        return;
    }


    const ctx =
        canvas.getContext(
            "2d"
        );


    const width =
        canvas.width;

    const height =
        canvas.height;


    ctx.clearRect(
        0,
        0,
        width,
        height
    );


    const sorted =
        mockExams
            .slice()
            .filter(
                function (exam) {

                    return (
                        exam.scores?.henshenshi !== undefined &&
                        exam.scores?.henshenshi !== ""
                    );
                }
            )
            .sort(
                function (a, b) {

                    return (
                        a.date || ""
                    ).localeCompare(
                        b.date || ""
                    );
                }
            );


    if (sorted.length === 0) {

        ctx.fillStyle =
            "#888";

        ctx.font =
            "14px sans-serif";

        ctx.fillText(
            "模試の偏差値データがありません。",
            10,
            height / 2
        );

        return;
    }


    const padding = 40;


    const values =
        sorted.map(
            function (exam) {

                return Number(
                    exam.scores.henshenshi
                );
            }
        );


    const maxValue =
        Math.max(
            70,
            ...values
        );

    const minValue =
        Math.min(
            30,
            ...values
        );


    const stepX =
        sorted.length > 1
            ? (
                width -
                padding * 2
            ) /
            (
                sorted.length -
                1
            )
            : 0;


    function toX(i) {

        return (
            padding +
            stepX * i
        );
    }


    function toY(value) {

        return (
            height -
            padding -
            (
                (value - minValue) /
                (maxValue - minValue) *
                (height - padding * 2)
            )
        );
    }


    /* 軸 */

    ctx.strokeStyle =
        "#ccc";

    ctx.beginPath();

    ctx.moveTo(
        padding,
        padding
    );

    ctx.lineTo(
        padding,
        height - padding
    );

    ctx.lineTo(
        width - padding,
        height - padding
    );

    ctx.stroke();


    /* 折れ線 */

    ctx.strokeStyle =
        "#2e7d32";

    ctx.lineWidth = 2;

    ctx.beginPath();


    sorted.forEach(
        function (exam, i) {

            const x =
                toX(i);

            const y =
                toY(
                    Number(
                        exam.scores.henshenshi
                    )
                );


            if (i === 0) {

                ctx.moveTo(
                    x,
                    y
                );

            } else {

                ctx.lineTo(
                    x,
                    y
                );
            }
        }
    );

    ctx.stroke();


    /* 点とラベル */

    ctx.fillStyle =
        "#2e7d32";

    ctx.font =
        "11px sans-serif";


    sorted.forEach(
        function (exam, i) {

            const x =
                toX(i);

            const y =
                toY(
                    Number(
                        exam.scores.henshenshi
                    )
                );


            ctx.beginPath();

            ctx.arc(
                x,
                y,
                3,
                0,
                Math.PI * 2
            );

            ctx.fill();


            ctx.fillText(
                String(
                    exam.scores.henshenshi
                ),
                x - 8,
                y - 8
            );


            ctx.save();

            ctx.translate(
                x,
                height - padding + 14
            );

            ctx.rotate(
                -Math.PI / 6
            );

            ctx.fillText(
                exam.date || "",
                0,
                0
            );

            ctx.restore();
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

    updateWeeklyNotice();

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

    renderOtherSchedules();

    renderNaishin();

    renderWeakPoints();

    renderQuestionNotes();

    renderScoreTrend();


    console.log(
        "PATGS27 script.js loaded successfully."
    );
}


initializePATGS27();

// =========================================================
// PATGS27 日付・予定管理システム
// =========================================================
// ・予定データをlocalStorageで保存
// ・今日の日付を自動表示
// ・夏休み終了 / 入試 / 合格発表を自動カウントダウン
// ・重要予定を自動並び替え
// ・予定の追加 / 編集 / 削除
// ・日付変更時に即時反映
// =========================================================


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


// =========================================================
// 保存・読み込み
// =========================================================

let patgsSchedule =
    loadJSON("patgs27_schedule", null);


if (!Array.isArray(patgsSchedule)) {

    patgsSchedule =
        DEFAULT_PATGS_SCHEDULE.map(function (item) {

            return {
                ...item
            };

        });

    saveJSON(
        "patgs27_schedule",
        patgsSchedule
    );
}


// =========================================================
// 日付ユーティリティ
// =========================================================

function getPATGSToday() {

    const today = new Date();

    today.setHours(
        0,
        0,
        0,
        0
    );

    return today;
}


function getPATGSTargetDate(dateString) {

    if (!dateString) {
        return null;
    }

    const target =
        new Date(
            dateString + "T00:00:00"
        );

    target.setHours(
        0,
        0,
        0,
        0
    );

    return target;
}


function getDaysUntil(targetDate) {

    if (!targetDate) {
        return null;
    }

    const today =
        getPATGSToday();

    const target =
        getPATGSTargetDate(
            targetDate
        );

    if (!target) {
        return null;
    }

    return Math.round(
        (
            target.getTime() -
            today.getTime()
        ) /
        (
            1000 *
            60 *
            60 *
            24
        )
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


function formatScheduleDate(dateString) {

    if (!dateString) {
        return "未設定";
    }

    const parts =
        dateString.split("-");

    if (parts.length !== 3) {
        return dateString;
    }

    return (
        Number(parts[0]) +
        "/" +
        Number(parts[1]) +
        "/" +
        Number(parts[2])
    );
}


// =========================================================
// 予定検索
// =========================================================

function findSchedule(id) {

    return patgsSchedule.find(
        function (item) {

            return item.id === id;

        }
    );
}


// =========================================================
// 今日の日付
// =========================================================

function updatePATGSTodayDate() {

    const element =
        document.getElementById(
            "todayDate"
        );

    if (!element) {
        return;
    }

    const today =
        getPATGSToday();

    element.textContent =
        today.getFullYear() +
        "/" +
        (today.getMonth() + 1) +
        "/" +
        today.getDate();
}


// =========================================================
// 上部カウントダウン
// =========================================================

function updatePATGSDashboard() {

    updatePATGSTodayDate();


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


    // -----------------------------------------------------
    // 夏休み終了
    // -----------------------------------------------------

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


    // -----------------------------------------------------
    // 入試
    // -----------------------------------------------------

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


    // -----------------------------------------------------
    // 合格発表
    // -----------------------------------------------------

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


    // -----------------------------------------------------
    // カードの日付
    // -----------------------------------------------------

    const dateCards =
        document.querySelectorAll(
            ".remain-date"
        );


    if (dateCards.length >= 3) {

        dateCards[0].textContent =
            formatScheduleDate(
                summer?.date
            );

        dateCards[1].textContent =
            formatScheduleDate(
                entrance?.date
            );

        dateCards[2].textContent =
            formatScheduleDate(
                result?.date
            );
    }
}


// =========================================================
// 予定設定画面
// =========================================================

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


            // -------------------------------------------------
            // アイコン
            // -------------------------------------------------

            const icon =
                document.createElement(
                    "input"
                );

            icon.type = "text";

            icon.value =
                event.icon || "📅";

            icon.placeholder =
                "アイコン";

            icon.title =
                "予定アイコン";


            // -------------------------------------------------
            // 予定名
            // -------------------------------------------------

            const name =
                document.createElement(
                    "input"
                );

            name.type = "text";

            name.value =
                event.name || "";

            name.placeholder =
                "予定名";


            // -------------------------------------------------
            // 日付
            // -------------------------------------------------

            const date =
                document.createElement(
                    "input"
                );

            date.type = "date";

            date.value =
                event.date || "";


            // -------------------------------------------------
            // 保存処理
            // -------------------------------------------------

            function saveScheduleItem() {

                event.name =
                    name.value.trim();

                event.date =
                    date.value;

                event.icon =
                    icon.value.trim() ||
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
                saveScheduleItem
            );


            date.addEventListener(
                "change",
                saveScheduleItem
            );


            icon.addEventListener(
                "input",
                saveScheduleItem
            );


            // -------------------------------------------------
            // 削除ボタン
            // -------------------------------------------------

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

                    const title =
                        event.name ||
                        "この予定";


                    if (
                        !confirm(
                            "「" +
                            title +
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


            // -------------------------------------------------
            // 行に追加
            // -------------------------------------------------

            row.append(
                icon,
                name,
                date,
                deleteButton
            );


            container.appendChild(
                row
            );
        }
    );
}


// =========================================================
// 予定追加
// =========================================================

function addPATGSSchedule() {

    patgsSchedule.push({

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
    });


    saveJSON(
        "patgs27_schedule",
        patgsSchedule
    );


    renderScheduleSettings();

    updatePATGSDashboard();

    updateSchedule();
}


// =========================================================
// 今後の重要予定
// =========================================================

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
        getPATGSToday();


    const upcoming =
        patgsSchedule

            .filter(
                function (event) {

                    return !!event.date;

                }
            )

            .map(
                function (event) {

                    const target =
                        getPATGSTargetDate(
                            event.date
                        );


                    if (!target) {
                        return null;
                    }


                    const diff =
                        Math.round(
                            (
                                target.getTime() -
                                today.getTime()
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

                    return (
                        event !== null &&
                        event.diff >= 0
                    );

                }
            )

            .sort(
                function (a, b) {

                    return (
                        a.diff -
                        b.diff
                    );

                }
            );


    // =====================================================
    // 予定がない場合
    // =====================================================

    if (upcoming.length === 0) {

        const empty =
            document.createElement(
                "p"
            );

        empty.textContent =
            "今後の重要予定はありません。";

        container.appendChild(
            empty
        );

        return;
    }


    // =====================================================
    // 予定表示
    // =====================================================

    upcoming.forEach(
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
                (
                    event.name ||
                    "名称未設定"
                );


            const date =
                document.createElement(
                    "div"
                );

            date.className =
                "schedule-date";

            date.textContent =
                formatScheduleDate(
                    event.date
                );


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


// =========================================================
// 追加ボタン
// =========================================================

const addScheduleSettingBtn =
    document.getElementById(
        "addScheduleSettingBtn"
    );


if (addScheduleSettingBtn) {

    addScheduleSettingBtn.addEventListener(
        "click",
        addPATGSSchedule
    );
}


// =========================================================
// 初期化
// =========================================================

renderScheduleSettings();

updatePATGSDashboard();

updateSchedule();


// =========================================================
// 日付は日付が変わった場合にも自動更新
// =========================================================

setInterval(
    function () {

        updatePATGSDashboard();

        updateSchedule();

    },
    60 * 1000
);


// =========================================================
// PATGS27 日付・予定管理システム END
// =========================================================
