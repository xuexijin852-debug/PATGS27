import { initializeApp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js";

import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  onAuthStateChanged,
  signOut,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  linkWithCredential,
  EmailAuthProvider,
  updateEmail,
  updatePassword
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";

import {
  getDatabase
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-database.js";

/* Realtime Database 同期エンジン（新規）
   PC ← → スマホ間の同期を自動管理 */
import "./firebase.sync.js";

const firebaseConfig = {
  apiKey: "AIzaSyB5ZwOyYeqsPQR3wqTWNaHUGagp2NjHA04",
  authDomain: "project-summer-2026-12de8.firebaseapp.com",
  projectId: "project-summer-2026-12de8",
  storageBucket: "project-summer-2026-12de8.firebasestorage.app",
  messagingSenderId: "88294145095",
  appId: "1:88294145095:web:06736f99276fd1807c8562"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);

/* firebase.sync.js がアクセスできるようにグローバルに公開（ES Module内での共有用） */
window.PATGS_FIREBASE_APP = app;
window.PATGS_FIREBASE_DB = db;

const provider = new GoogleAuthProvider();

const loginBtn =
document.getElementById("loginBtn");

console.log(loginBtn);

const userName =
document.getElementById("userName");
const logoutBtn =
document.getElementById("logoutBtn");
const loginScreen =
document.getElementById("loginScreen");

const mainApp =
document.getElementById("mainApp");

/* PATGS27 のデータをアカウントごとに分離・クラウド同期するために、
   直前にログインしていた uid を覚えておく。
   既存のログインボタンの処理・表示文言・画面切り替えは変更していない。 */
let patgsPreviousUid = null;

/* メール/パスワードログイン用の要素（HTML 側に無ければ
   すべて null になるだけで、既存動作には影響しない）。 */
const emailInput = document.getElementById("emailInput");
const passwordInput = document.getElementById("passwordInput");
const emailLoginBtn = document.getElementById("emailLoginBtn");
const emailSignupBtn = document.getElementById("emailSignupBtn");
const emailAuthStatus = document.getElementById("emailAuthStatus");

/* Google でログイン中のアカウントに、後からメールログインを
   紐付けるための要素（設定画面）。 */
const linkEmailInput = document.getElementById("linkEmailInput");
const linkPasswordInput = document.getElementById("linkPasswordInput");
const linkEmailBtn = document.getElementById("linkEmailBtn");
const linkEmailStatus = document.getElementById("linkEmailStatus");

/* 学校用ログイン（ID＋パスワード）。
   Google アカウントもメールアドレスも生徒には見せない・使わせない。 */
const schoolIdInput = document.getElementById("schoolIdInput");
const schoolPasswordInput = document.getElementById("schoolPasswordInput");
const schoolLoginBtn = document.getElementById("schoolLoginBtn");
const schoolAuthStatus = document.getElementById("schoolAuthStatus");

/* Google でログイン中のアカウントに、学校用 ID＋パスワードを
   紐付けるための要素（設定画面）。 */
const linkSchoolIdInput = document.getElementById("linkSchoolIdInput");
const linkSchoolPasswordInput = document.getElementById("linkSchoolPasswordInput");
const linkSchoolBtn = document.getElementById("linkSchoolBtn");
const linkSchoolStatus = document.getElementById("linkSchoolStatus");

/* 学校用の「ID」を、Firebase のメール/パスワード認証が要求する
   「メール形式の文字列」に変換する。実在しないことが保証された
   .invalid ドメイン（RFC 2606 で予約済み）を使うため、
   本物のメールアドレスは一切必要にならない。 */
function patgsSchoolIdToPseudoEmail(rawId) {

  const cleaned = (rawId || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, "");

  if (!cleaned) {
    return null;
  }

  return "school-" + cleaned + "@patgs27-school.invalid";
}

/* Firebase は 1 アカウントにつき「メール/パスワード」の紐付けを
   1 つしか持てない。そのため「メールログインの追加」と
   「学校用ログインの追加」は同じ枠を取り合う。
   既に片方が紐付け済みの状態でもう片方を追加しようとすると
   linkWithCredential は auth/provider-already-linked で
   失敗するので、その場合は新しい方でメール/パスワードを
   上書きする（updateEmail + updatePassword）。
   uid は変わらないので、Realtime DB 側のデータはそのまま引き継がれる。 */
async function patgsLinkOrReplacePasswordCredential(email, password) {

  const hasPasswordProvider = (auth.currentUser?.providerData || [])
    .some(function (p) { return p.providerId === "password"; });

  if (!hasPasswordProvider) {

    const credential = EmailAuthProvider.credential(email, password);
    await linkWithCredential(auth.currentUser, credential);
    return;
  }

  try {
    await updateEmail(auth.currentUser, email);
    await updatePassword(auth.currentUser, password);
  } catch (error) {

    if (error.code === "auth/requires-recent-login") {
      throw new Error(
        "セキュリティ上の理由で、この操作には最近のログインが必要です。" +
        "一度ログアウトして Google で再ログインしてから、もう一度お試しください。"
      );
    }

    throw error;
  }
}

loginBtn.addEventListener(
  "click",
  async function(){

    console.log("ログインボタン押された");

    try{

      const result =
      await signInWithPopup(
        auth,
        provider
      );

      userName.textContent =
      result.user.displayName;

    }

    catch(error){

      console.error(error);

    }

  }
);

/* メールアドレス＋パスワードでログイン */
emailLoginBtn?.addEventListener("click", async function () {

  if (emailAuthStatus) {
    emailAuthStatus.textContent = "";
  }

  try {

    await signInWithEmailAndPassword(
      auth,
      emailInput?.value || "",
      passwordInput?.value || ""
    );

  } catch (error) {

    console.error(error);

    if (emailAuthStatus) {
      emailAuthStatus.textContent = "ログインに失敗しました：" + error.message;
    }
  }
});

/* メールアドレス＋パスワードで新規登録
   （同じメールアドレスで既に Google ログイン済みの場合は
   auth/email-already-in-use になるので、その場合は
   先に Google でログインしてから設定画面でリンクしてもらう） */
emailSignupBtn?.addEventListener("click", async function () {

  if (emailAuthStatus) {
    emailAuthStatus.textContent = "";
  }

  try {

    await createUserWithEmailAndPassword(
      auth,
      emailInput?.value || "",
      passwordInput?.value || ""
    );

  } catch (error) {

    console.error(error);

    if (emailAuthStatus) {

      if (error.code === "auth/email-already-in-use") {
        emailAuthStatus.textContent =
          "このメールアドレスは既に使われています。先に Google でログインしてから、" +
          "設定画面の「メールログインの追加」で紐付けてください。";
      } else {
        emailAuthStatus.textContent = "登録に失敗しました：" + error.message;
      }
    }
  }
});

/* Google でログイン中のアカウントに、メール/パスワードのログイン方法を
   紐付ける（既に学校用ログインが紐付け済みなら、そちらを上書きする）。 */
linkEmailBtn?.addEventListener("click", async function () {

  if (linkEmailStatus) {
    linkEmailStatus.textContent = "";
  }

  if (!auth.currentUser) {

    if (linkEmailStatus) {
      linkEmailStatus.textContent = "先にログインしてから行ってください。";
    }

    return;
  }

  try {

    await patgsLinkOrReplacePasswordCredential(
      linkEmailInput?.value || "",
      linkPasswordInput?.value || ""
    );

    if (linkEmailStatus) {
      linkEmailStatus.textContent = "✓ このアカウントにメールログインを追加しました。";
    }

  } catch (error) {

    console.error(error);

    if (linkEmailStatus) {
      linkEmailStatus.textContent = "追加に失敗しました：" + error.message;
    }
  }
});

/* 学校用 ID＋パスワードでログイン（内部的にはメール/パスワード認証を
   ダミーのメールアドレスで使っているだけ。生徒には ID/パスワードにしか見えない）。 */
schoolLoginBtn?.addEventListener("click", async function () {

  if (schoolAuthStatus) {
    schoolAuthStatus.textContent = "";
  }

  const pseudoEmail = patgsSchoolIdToPseudoEmail(schoolIdInput?.value);

  if (!pseudoEmail) {

    if (schoolAuthStatus) {
      schoolAuthStatus.textContent = "ID を入力してください。";
    }

    return;
  }

  try {

    await signInWithEmailAndPassword(
      auth,
      pseudoEmail,
      schoolPasswordInput?.value || ""
    );

  } catch (error) {

    console.error(error);

    if (schoolAuthStatus) {
      schoolAuthStatus.textContent = "ログインに失敗しました：" + error.message;
    }
  }
});

/* Google でログイン中のアカウントに、学校用 ID＋パスワードを紐付ける。
   これで学校用 ID でログインしても、家の Google アカウントと
   完全に同じ Firebase ユーザー（同じ uid・同じ Realtime DB データ）になる。 */
linkSchoolBtn?.addEventListener("click", async function () {

  if (linkSchoolStatus) {
    linkSchoolStatus.textContent = "";
  }

  if (!auth.currentUser) {

    if (linkSchoolStatus) {
      linkSchoolStatus.textContent = "先にログインしてから行ってください。";
    }

    return;
  }

  const pseudoEmail = patgsSchoolIdToPseudoEmail(linkSchoolIdInput?.value);

  if (!pseudoEmail) {

    if (linkSchoolStatus) {
      linkSchoolStatus.textContent = "ID を入力してください。";
    }

    return;
  }

  try {

    await patgsLinkOrReplacePasswordCredential(
      pseudoEmail,
      linkSchoolPasswordInput?.value || ""
    );

    if (linkSchoolStatus) {
      linkSchoolStatus.textContent = "✓ このアカウントに学校用ログインを追加しました。";
    }

  } catch (error) {

    console.error(error);

    if (linkSchoolStatus) {
      linkSchoolStatus.textContent = "追加に失敗しました：" + error.message;
    }
  }
});

onAuthStateChanged(auth, async (user) => {

  if (user) {

    /* localStorage を uid ごとに完全分離するガードを起動。
       この端末でこの uid に切り替わったばかりの場合（初回ログイン・
       別アカウントへの切り替えを含む）は、script.js が既に古い/他人の
       名前空間を前提に初期化を終えてしまっているため、正しいデータで
       再初期化させるためにページを再読み込みする。
       （通常、同じアカウントで開き直しただけの場合はここでは
       再読み込みは発生しない。） */
    if (window.PATGS_STORAGE_GUARD && typeof window.PATGS_STORAGE_GUARD.activateUid === "function") {

      const guardResult = window.PATGS_STORAGE_GUARD.activateUid(user.uid);

      if (guardResult && guardResult.needsReload) {
        location.reload();
        return;
      }
    }

    loginScreen.style.display = "none";
    mainApp.style.display = "block";

    userName.textContent =
      user.displayName || user.email || "";

    /* アカウント切り替え時の再読み込みは、上の PATGS_STORAGE_GUARD が
       常に正しく検知して行うため、ここでは「ログイン中だった」という
       事実だけを覚えておく（ログアウト時の再読み込み判定に使う）。 */
    patgsPreviousUid = user.uid;

    /* Realtime Database 同期を初期化（修正版）
       app・db を firebase.sync.js に渡す */
    if (typeof window.patgsInitializeRealtimeSync === "function") {
      await window.patgsInitializeRealtimeSync(user.uid, app, db);
    }

    /* script.js 側で定義される起動関数。user.uid を渡すことで、
       PATGS27 の localStorage データをアカウントごとに分離し、
       Realtime Database 上のクラウドデータとも同期する。 */
    if (typeof window.PATGS_BOOT === "function") {
      window.PATGS_BOOT(user.uid);
    }

  } else {

    loginScreen.style.display = "block";
    mainApp.style.display = "none";

    /* Realtime Database 同期をクリーンアップ */
    if (typeof window.patgsCleanupRealtimeSync === "function") {
      window.patgsCleanupRealtimeSync();
    }

    /* ログイン中だったアカウントがログアウトした場合も、
       前のアカウントのデータが画面に残らないよう再読み込みする。 */
    if (patgsPreviousUid) {
      patgsPreviousUid = null;
      location.reload();
    }

  }

});

logoutBtn.addEventListener(
  "click",
  async function(){

    await signOut(auth);

  }
);
