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

/* Supabase SDK。UMDのグローバル変数（window.supabase）には頼らず、
   このモジュール内で直接importする（読み込み失敗時にコンソールへ
   明確なエラーが出るようにするため）。 */
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

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
   Supabaseダッシュボード → Project Settings → API に表示されている
   URLとpublishable key（anon key）です。service_role keyは
   絶対にここに置かないでください。

   ダッシュボード側で一度だけ、Authentication → Sign In / Providers
   → Third-Party Auth に、このFirebaseプロジェクト
   （project-summer-2026-12de8）を登録しておく必要があります
   （コード側の作業は不要です）。
   ========================================================= */

const SUPABASE_URL = "https://xxvgihckwbbsuutqziev.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_Oji_H5UskIO2HBEIExzJbw_1DAJC-Bx";

const app = initializeApp(firebaseConfig);

const auth = getAuth(app);

const provider = new GoogleAuthProvider();

/* auth が確定した後にSupabaseクライアントを作る。
   accessTokenには、そのつどFirebaseの最新のIDトークンを返す。 */
const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  accessToken: async () => {

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

/* 追加：学校用ログイン（ID＋パスワード）。
   Googleアカウントもメールアドレスも生徒には見せない・使わせない。 */
const schoolIdInput = document.getElementById("schoolIdInput");
const schoolPasswordInput = document.getElementById("schoolPasswordInput");
const schoolLoginBtn = document.getElementById("schoolLoginBtn");
const schoolAuthStatus = document.getElementById("schoolAuthStatus");

/* 追加：Googleでログイン中のアカウントに、学校用ID＋パスワードを
   紐付けるための要素（設定画面）。 */
const linkSchoolIdInput = document.getElementById("linkSchoolIdInput");
const linkSchoolPasswordInput = document.getElementById("linkSchoolPasswordInput");
const linkSchoolBtn = document.getElementById("linkSchoolBtn");
const linkSchoolStatus = document.getElementById("linkSchoolStatus");

/* 学校用の「ID」を、Firebaseのメール/パスワード認証が要求する
   「メール形式の文字列」に変換する。実在しないことが保証された
   .invalid ドメイン（RFC 2606で予約済み）を使うため、
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

/* Firebaseは1アカウントにつき「メール/パスワード」の紐付けを
   1つしか持てない。そのため「メールログインの追加」と
   「学校用ログインの追加」は同じ枠を取り合う。
   既に片方が紐付け済みの状態でもう片方を追加しようとすると
   linkWithCredential は auth/provider-already-linked で
   失敗するので、その場合は新しい方でメール/パスワードを
   上書きする（updateEmail + updatePassword）。
   uidは変わらないので、Supabase側のデータはそのまま引き継がれる。 */
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
        "一度ログアウトしてGoogleで再ログインしてから、もう一度お試しください。"
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

/* 追加：学校用ID＋パスワードでログイン（内部的にはメール/パスワード認証を
   ダミーのメールアドレスで使っているだけ。生徒にはID/パスワードにしか見えない）。 */
schoolLoginBtn?.addEventListener("click", async function () {

  if (schoolAuthStatus) {
    schoolAuthStatus.textContent = "";
  }

  const pseudoEmail = patgsSchoolIdToPseudoEmail(schoolIdInput?.value);

  if (!pseudoEmail) {

    if (schoolAuthStatus) {
      schoolAuthStatus.textContent = "IDを入力してください。";
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

/* 追加：Googleでログイン中のアカウントに、学校用ID＋パスワードを紐付ける。
   これで学校用IDでログインしても、家のGoogleアカウントと
   完全に同じFirebaseユーザー（同じuid・同じSupabaseデータ）になる。 */
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
      linkSchoolStatus.textContent = "IDを入力してください。";
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
