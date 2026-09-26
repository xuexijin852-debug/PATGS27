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
  EmailAuthProvider
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyB5ZwOyYeqsPQR3wqTWNaHUGagp2NjHA04",
  authDomain: "project-summer-2026-12de8.firebaseapp.com",
  projectId: "project-summer-2026-12de8",
  storageBucket: "project-summer-2026-12de8.firebasestorage.app",
  messagingSenderId: "88294145095",
  appId: "1:88294145095:web:06736f99276fd1807c8562"
};

/* =========================================================
   Supabase（クラウド同期）
   =========================================================
   ここのURLとanon keyは、Supabaseダッシュボードの
   Project Settings → API に表示されているものに置き換えてください。
   anon keyは公開して問題のないキーです（service_role keyは
   絶対にここに置かないでください）。

   ダッシュボード側で一度だけ、Authentication → Sign In / Providers
   → Third-Party Auth に、このFirebaseプロジェクトを
   「Firebase」として登録してください（コード側の作業は不要です）。
   ========================================================= */

const SUPABASE_URL = "https://xxvgihckwbbsuutqziev.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_Oji_H5UskIO2HBEIExzJbw_1DAJC-Bx";

let supabaseClient = null;

if (window.supabase && typeof window.supabase.createClient === "function") {

  supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    accessToken: async () => {

      const auth = getAuth();

      if (!auth.currentUser) {
        return null;
      }

      try {
        return await auth.currentUser.getIdToken();
      } catch (error) {
        console.error("Firebase IDトークンの取得に失敗しました:", error);
        return null;
      }
    }
  });

  /* script.js側から window.PATGS_SUPABASE として参照する。 */
  window.PATGS_SUPABASE = supabaseClient;

} else {

  console.error("Supabase SDKが読み込まれていません。クラウド同期は無効になります。");

}

const app = initializeApp(firebaseConfig);

const auth = getAuth(app);

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

/* ここから追加分：PATGS27のデータをFirebaseのuser.uidごとに
   分離・クラウド同期するために、直前にログインしていたuidを覚えておく。
   既存のログインボタンの処理・表示文言・画面切り替えは変更していない。 */
let patgsPreviousUid = null;

/* 追加：メール/パスワードログイン用の要素（HTML側に無ければ
   すべて null になるだけで、既存動作には影響しない）。 */
const emailInput = document.getElementById("emailInput");
const passwordInput = document.getElementById("passwordInput");
const emailLoginBtn = document.getElementById("emailLoginBtn");
const emailSignupBtn = document.getElementById("emailSignupBtn");
const emailAuthStatus = document.getElementById("emailAuthStatus");

/* 追加：Googleでログイン中のアカウントに、後からメールログインを
   紐付けるための要素（設定画面）。 */
const linkEmailInput = document.getElementById("linkEmailInput");
const linkPasswordInput = document.getElementById("linkPasswordInput");
const linkEmailBtn = document.getElementById("linkEmailBtn");
const linkEmailStatus = document.getElementById("linkEmailStatus");

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

/* 追加：メールアドレス＋パスワードでログイン */
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

/* 追加：メールアドレス＋パスワードで新規登録
   （同じメールアドレスで既にGoogleログイン済みの場合は
   auth/email-already-in-use になるので、その場合は
   先にGoogleでログインしてから設定画面でリンクしてもらう） */
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
          "このメールアドレスは既に使われています。先にGoogleでログインしてから、" +
          "設定画面の「メールログインの追加」で紐付けてください。";
      } else {
        emailAuthStatus.textContent = "登録に失敗しました：" + error.message;
      }
    }
  }
});

/* 追加：Googleでログイン中のアカウントに、メール/パスワードのログイン方法を
   紐付ける（Firebase標準のlinkWithCredentialを使用。uidは変わらない）。 */
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

    const credential = EmailAuthProvider.credential(
      linkEmailInput?.value || "",
      linkPasswordInput?.value || ""
    );

    await linkWithCredential(auth.currentUser, credential);

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

onAuthStateChanged(auth, (user) => {

  if (user) {

    loginScreen.style.display = "none";
    mainApp.style.display = "block";

    userName.textContent =
      user.displayName || user.email || "";

    /* 前回と別のFirebaseアカウント（別uid）に切り替わった場合は、
       PATGS27側の状態を確実にリセットするためページを再読み込みする。 */
    if (patgsPreviousUid && patgsPreviousUid !== user.uid) {
      location.reload();
      return;
    }

    patgsPreviousUid = user.uid;

    /* script.js側で定義される起動関数。user.uidを渡すことで、
       PATGS27のlocalStorageデータをアカウントごとに分離し、
       Supabase上のクラウドデータとも同期する。 */
    if (typeof window.PATGS_BOOT === "function") {
      window.PATGS_BOOT(user.uid);
    }

  } else {

    loginScreen.style.display = "block";
    mainApp.style.display = "none";

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
