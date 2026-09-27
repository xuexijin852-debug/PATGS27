/**
 * firebase.sync.js
 *
 * Firebase Realtime Database との同期エンジン。
 * PATGS27 の localStorage データと Realtime Database (users/<uid>/...) を
 * 差分同期する。Firebase Spark プラン / Cloud Functions 不使用。
 *
 * ★重要な前提の修正★
 * 旧バージョンは localStorage のキーが "patgs27_u_<uid>__<key>" という
 * 独自プリフィックス付きである前提で書かれていたが、実際の script.js は
 * そのプリフィックスを一切使っておらず、"patgs27_schedule" や "goalText" の
 * ような素のキー名をそのまま使っている（バックアップ機能 exportAllData() が
 * localStorage 全体をそのままダンプしているのと同じ構造）。
 * そのため旧コードは常に「同期対象データ 0 件」として動作しており、
 * 実質何も同期していなかった。
 * このファイルでは、script.js が実際に使っている素のキー名をそのまま
 * 同期対象とする（script.js 側は一切変更しない）。
 *
 * 設計のポイント：
 * 1. Firebase v12 ES Module。firebase.js から渡された app / db を再利用し、
 *    firebase.app() 等の旧グローバルAPIは使わない。
 * 2. 同期用メタデータ（「最後に同期した状態のスナップショット」）は
 *    "patgs27_syncmeta_<uid>" という別キーに保存し、通常の PATGS27 データ
 *    （script.js が読み書きするキー）とは混ざらないようにする。
 * 3. このスナップショットをページ再読み込み後も使えるよう localStorage に
 *    永続化する（同期状態をメモリ内だけで管理しない）ことで、
 *    　・端末で削除したデータが他端末やリロード後に復活しない
 *    　・同じデータを無限に再アップロードするループが起きない
 *    　・初回同期で既存データを無条件に消さない
 *    を同時に実現する。
 */

import {
  ref,
  get,
  update,
  onValue,
  off
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-database.js";

/* =========================================================
   同期対象から除外するキー
   ========================================================= */

const PATGS_SYNC_EXCLUDE_PATTERNS = [
  /^patgs27_syncmeta_/,      // このファイル自身の同期メタデータ
  /^firebase:/,              // Firebase SDK が内部的に使うキー
  /^firebase-/,
  /^firebaseLocalStorageDb/
];

function patgsIsSyncableKey(key) {
  return !PATGS_SYNC_EXCLUDE_PATTERNS.some(function (re) {
    return re.test(key);
  });
}

/* patgs27-storage-guard.js が管理する「今アクティブな uid」と、
   この関数を呼んでいる処理が対象にしている uid が一致しているかを確認する。
   ログイン切り替え時、location.reload() が実際にページを離れるまでの
   ごく短い間（次のイベントループ）に setInterval のポーリング等が
   もう一度発火してしまうことがあるため、その際に「ガード側は既に別 uid に
   切り替わっているのに、この uid のままローカルデータを読み書きしてしまう」
   事故（=他アカウントのデータへの誤アクセス）を防ぐための最終防衛ライン。 */
function patgsGuardStillActiveFor(uid) {
  if (
    typeof window.PATGS_STORAGE_GUARD === "undefined" ||
    typeof window.PATGS_STORAGE_GUARD.getActiveUid !== "function"
  ) {
    return true; // ガードが読み込まれていない環境では従来通り信頼する
  }
  return window.PATGS_STORAGE_GUARD.getActiveUid() === uid;
}

/* Realtime Database のキーとして使えない文字（. # $ [ ]）を含むキーは
   安全のため同期対象から除外する（script.js の既存キーには通常出現しない）。 */
function patgsIsRtdbSafeKey(key) {
  return !/[.#$\[\]]/.test(key);
}

/* =========================================================
   グローバル状態
   ========================================================= */

let patgsSyncState = {
  currentUserUid: null,
  isInitialized: false,
  lastLocalSnapshot: {},
  realtimeListenerRef: null,
  syncInProgress: false,
  syncPollingInterval: null,
  pendingLocalDeletionKeys: new Set()
};

/* =========================================================
   同期メタデータ（「最後に同期した状態」）の永続化
   通常の PATGS27 データとは別キーに保存する
   ========================================================= */

function patgsGetSyncMetaKey(uid) {
  return "patgs27_syncmeta_" + uid;
}

function patgsLoadLastSyncedSnapshot(uid) {
  try {
    const raw = localStorage.getItem(patgsGetSyncMetaKey(uid));
    if (raw === null) {
      return null; // この端末でこの uid はまだ一度も同期したことがない
    }
    const parsed = JSON.parse(raw);
    return (parsed && typeof parsed.snapshot === "object" && parsed.snapshot !== null)
      ? parsed.snapshot
      : null;
  } catch (error) {
    console.error("同期メタデータの読み込みに失敗しました:", error);
    return null;
  }
}

function patgsSaveLastSyncedSnapshot(uid, snapshot) {
  try {
    localStorage.setItem(
      patgsGetSyncMetaKey(uid),
      JSON.stringify({ snapshot: snapshot, savedAt: Date.now() })
    );
  } catch (error) {
    console.error("同期メタデータの保存に失敗しました:", error);
  }
}

/* =========================================================
   localStorage 全体（PATGS27 データ）の読み取り
   ========================================================= */

function patgsGetAllLocalData() {
  const data = {};

  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);

    if (!key || !patgsIsSyncableKey(key) || !patgsIsRtdbSafeKey(key)) {
      continue;
    }

    const value = localStorage.getItem(key);
    if (value === null) {
      continue;
    }

    try {
      data[key] = JSON.parse(value);
    } catch (e) {
      // JSON として解釈できない場合は文字列のまま扱う
      data[key] = value;
    }
  }

  return data;
}

/* =========================================================
   初回同期（この端末でこの uid が初めて）／
   通常の起動時同期（2台目以降・再読み込み時）を1つのロジックで処理する
   ========================================================= */

/**
 * localData（今の端末） / remoteData（今のクラウド） / lastSynced（前回同期時の状態）
 * の3者を比較し、「どちらへ何を反映すべきか」を決める。
 *
 * preferLocalOnConflict = true のときだけ（＝この端末で本当に初めての同期のときだけ）、
 * 両側に食い違うデータがある場合に端末側を優先する（＝既存データを消さない）。
 * それ以外（通常の起動時同期）は、前回同期後にどちら側が変更したかで判断する。
 */
function patgsBuildReconcilePlan(localData, remoteData, lastSynced, preferLocalOnConflict) {
  const localUpdates = {};   // localStorage に書き込む
  const localRemovals = [];  // localStorage から削除する
  const remoteUpdates = {};  // Realtime DB に書き込む（null = 削除）

  const allKeys = new Set([
    ...Object.keys(localData),
    ...Object.keys(remoteData || {}),
    ...Object.keys(lastSynced || {})
  ]);

  allKeys.forEach(function (key) {
    if (!patgsIsSyncableKey(key) || !patgsIsRtdbSafeKey(key)) {
      return;
    }
    if (patgsSyncState.pendingLocalDeletionKeys.has(key)) {
      // アップロード（削除反映）待ちのキーは触らない
      return;
    }

    const inLocal = key in localData;
    const inRemote = key in (remoteData || {});
    const inLast = key in (lastSynced || {});

    const localChanged = inLocal
      ? (!inLast || JSON.stringify(localData[key]) !== JSON.stringify(lastSynced[key]))
      : inLast; // 前回はあったのに今は無い＝端末側で削除された
    const remoteChanged = inRemote
      ? (!inLast || JSON.stringify(remoteData[key]) !== JSON.stringify(lastSynced[key]))
      : inLast; // 前回はあったのに今は無い＝クラウド側で削除された（他端末）

    if (!localChanged && !remoteChanged) {
      return; // 変化なし
    }

    if (localChanged && !remoteChanged) {
      // この端末だけが変更／削除した → クラウドへ反映
      remoteUpdates[key] = inLocal ? localData[key] : null;
      return;
    }

    if (!localChanged && remoteChanged) {
      // クラウド側（＝他端末）だけが変更／削除した → この端末へ反映
      if (inRemote) {
        localUpdates[key] = remoteData[key];
      } else {
        localRemovals.push(key);
      }
      return;
    }

    // 両方が変更されている場合
    if (preferLocalOnConflict) {
      // 本当の初回同期：端末に既にあるデータを失わないことを最優先にする
      if (inLocal) {
        remoteUpdates[key] = localData[key];
      } else if (inRemote) {
        localUpdates[key] = remoteData[key];
      }
    } else {
      // 通常の起動時同期：クラウド側（他端末での変更の可能性）を優先しつつ、
      // クラウドに存在しない場合のみ端末側を反映する
      if (inRemote) {
        localUpdates[key] = remoteData[key];
      } else if (inLocal) {
        remoteUpdates[key] = localData[key];
      }
    }
  });

  return { localUpdates: localUpdates, localRemovals: localRemovals, remoteUpdates: remoteUpdates };
}

async function patgsApplyReconcilePlan(uid, db, plan) {
  Object.keys(plan.localUpdates).forEach(function (key) {
    const value = plan.localUpdates[key];
    const stringValue = typeof value === "string" ? value : JSON.stringify(value);
    localStorage.setItem(key, stringValue);
  });

  plan.localRemovals.forEach(function (key) {
    localStorage.removeItem(key);
  });

  if (Object.keys(plan.remoteUpdates).length > 0) {
    const userRef = ref(db, "users/" + uid);
    try {
      await update(userRef, plan.remoteUpdates);
    } catch (error) {
      console.error(
        "Realtime DB へのアップロードに失敗しました（オフライン？）:",
        error
      );
      // ここで失敗しても lastSyncedSnapshot は更新しない。
      // 次回のポーリング／再読み込みで再試行される。
      return;
    }
  }

  // ★同期ループ防止＋削除検出のための基準点を更新★
  const finalLocalData = patgsGetAllLocalData();
  patgsSyncState.lastLocalSnapshot = finalLocalData;
  patgsSaveLastSyncedSnapshot(uid, finalLocalData);
}

/* =========================================================
   ローカルストレージの変更を Realtime DB へアップロード（定期ポーリング用）
   ========================================================= */

async function patgsUploadChangesToRealtimeDB(uid, db) {
  if (!uid || patgsSyncState.syncInProgress) {
    return;
  }

  if (!patgsGuardStillActiveFor(uid)) {
    // アカウント切り替え直後の再読み込み待ちの間に発火したポーリング。
    // このアカウントの処理は行わない（cleanupRealtimeSync 済みのはず）。
    return;
  }

  patgsSyncState.syncInProgress = true;

  try {
    const currentLocalData = patgsGetAllLocalData();
    const lastSnapshot = patgsSyncState.lastLocalSnapshot || {};

    const uploadData = {};
    const deletingKeys = [];

    // 変更・新規追加されたキー
    for (const key of Object.keys(currentLocalData)) {
      if (JSON.stringify(currentLocalData[key]) !== JSON.stringify(lastSnapshot[key])) {
        uploadData[key] = currentLocalData[key];
      }
    }

    // 削除されたキー（前回スナップショットにはあるが、今は無い）
    for (const key of Object.keys(lastSnapshot)) {
      if (!(key in currentLocalData)) {
        uploadData[key] = null;
        deletingKeys.push(key);
      }
    }

    if (Object.keys(uploadData).length === 0) {
      return;
    }

    deletingKeys.forEach(function (key) {
      patgsSyncState.pendingLocalDeletionKeys.add(key);
    });

    const userRef = ref(db, "users/" + uid);
    await update(userRef, uploadData);

    deletingKeys.forEach(function (key) {
      patgsSyncState.pendingLocalDeletionKeys.delete(key);
    });

    // ★同期ループ防止★：アップロードした内容を基準点として確定
    patgsSyncState.lastLocalSnapshot = currentLocalData;
    patgsSaveLastSyncedSnapshot(uid, currentLocalData);

  } catch (error) {
    console.error(
      "Realtime DB へのアップロードに失敗しました（オフライン？）:",
      error
    );
    // オフライン時はここで失敗しても localStorage は使えるので
    // アプリは継続動作する。次回のポーリングで再試行される。
  } finally {
    patgsSyncState.syncInProgress = false;
  }
}

/* =========================================================
   Realtime DB の変更をリアルタイムで受信 → localStorage へ反映
   ========================================================= */

function patgsApplyRealtimeSnapshot(uid, remoteData) {
  if (!uid) {
    return;
  }

  const data = remoteData || {};
  const lastSnapshot = patgsSyncState.lastLocalSnapshot || {};

  // クラウド側に存在するキーを反映
  // （この端末がアップロード中＝削除確定待ちのキーは復活させない）
  Object.keys(data).forEach(function (key) {
    if (!patgsIsSyncableKey(key) || !patgsIsRtdbSafeKey(key)) {
      return;
    }
    if (patgsSyncState.pendingLocalDeletionKeys.has(key)) {
      return;
    }
    const value = data[key];
    const stringValue = typeof value === "string" ? value : JSON.stringify(value);
    localStorage.setItem(key, stringValue);
  });

  // 他端末で削除された（前回同期時にはあったのに、今のクラウドには無い）キーを
  // この端末にも反映する。ただし、この端末側でまだアップロードしていない
  // 独自の削除待ちキーには触れない（pendingLocalDeletionKeys で除外済み）。
  Object.keys(lastSnapshot).forEach(function (key) {
    if (!patgsIsSyncableKey(key) || !patgsIsRtdbSafeKey(key)) {
      return;
    }
    if (patgsSyncState.pendingLocalDeletionKeys.has(key)) {
      return;
    }
    if (!(key in data)) {
      localStorage.removeItem(key);
    }
  });

  // ★★★ 重要：反映直後にスナップショットを更新する ★★★
  // これにより、リモートから受け取ったデータが再度アップロードされる
  // 同期ループを防ぐ。
  const finalLocalData = patgsGetAllLocalData();
  patgsSyncState.lastLocalSnapshot = finalLocalData;
  patgsSaveLastSyncedSnapshot(uid, finalLocalData);
}

function patgsStartListeningToRealtimeChanges(uid, db) {
  if (!uid) {
    return;
  }

  const userRef = ref(db, "users/" + uid);

  if (patgsSyncState.realtimeListenerRef) {
    off(patgsSyncState.realtimeListenerRef);
  }

  onValue(
    userRef,
    (snapshot) => {
      if (patgsSyncState.currentUserUid !== uid || !patgsGuardStillActiveFor(uid)) {
        return; // 別ユーザーに切り替わった後の古いイベントは無視
      }
      // snapshot.val() は Firebase 側にキーが1つも無くなると null を返す。
      // ここで無視すると「クラウド側で最後のデータまで削除された」ケースが
      // ローカルへ伝わらず、古いローカルデータがポーリングで
      // クラウドへ復活してしまうため、null のときも必ず反映処理を呼ぶ
      // （空オブジェクトとして扱い、ローカル側の対応データも削除させる）。
      const remoteData = snapshot.val();
      patgsApplyRealtimeSnapshot(uid, remoteData || {});
    },
    (error) => {
      console.error(
        "Realtime DB のリッスン中にエラーが発生しました:",
        error
      );
    }
  );

  patgsSyncState.realtimeListenerRef = userRef;
}

function patgsStartPollingLocalChanges(uid, db) {
  if (!uid) {
    return;
  }

  if (patgsSyncState.syncPollingInterval) {
    clearInterval(patgsSyncState.syncPollingInterval);
  }

  patgsSyncState.syncPollingInterval = setInterval(() => {
    if (patgsSyncState.currentUserUid !== uid) {
      clearInterval(patgsSyncState.syncPollingInterval);
      patgsSyncState.syncPollingInterval = null;
      return;
    }

    patgsUploadChangesToRealtimeDB(uid, db).catch(err => {
      console.error("ポーリング中のアップロードに失敗:", err);
    });
  }, 500);
}

/* =========================================================
   初期化メイン関数
   firebase.js から onAuthStateChanged で呼ばれる
   ========================================================= */

async function patgsInitializeRealtimeSync(uid, app, db) {
  if (!uid || !app || !db) {
    console.error("patgsInitializeRealtimeSync: uid, app, db のいずれかが不足しています");
    return;
  }

  patgsSyncState.currentUserUid = uid;
  patgsSyncState.pendingLocalDeletionKeys = new Set();

  try {
    const userRef = ref(db, "users/" + uid);
    const snapshot = await get(userRef);

    if (patgsSyncState.currentUserUid !== uid || !patgsGuardStillActiveFor(uid)) {
      // 待っている間にログアウト／別アカウントへの切り替えが起きていた場合は中断
      return;
    }

    const remoteData = snapshot.val() || {};

    // この端末でこの uid の同期記録が無ければ「本当の初回同期」
    const lastSynced = patgsLoadLastSyncedSnapshot(uid);
    const isFirstSyncOnThisDevice = (lastSynced === null);

    const localData = patgsGetAllLocalData();

    const plan = patgsBuildReconcilePlan(
      localData,
      remoteData,
      lastSynced || {},
      isFirstSyncOnThisDevice // 初回同期のときだけ端末側データを優先
    );

    await patgsApplyReconcilePlan(uid, db, plan);

    patgsStartListeningToRealtimeChanges(uid, db);
    patgsStartPollingLocalChanges(uid, db);

    patgsSyncState.isInitialized = true;

    console.log(
      "PATGS27 Realtime DB 同期を初期化しました（UID: " + uid +
      "、初回同期: " + isFirstSyncOnThisDevice + "）"
    );

  } catch (error) {
    console.error("Realtime DB 同期の初期化に失敗しました:", error);
    // エラーが発生してもアプリケーションは継続する
    // （localStorage はそのまま使えるので、オフラインモードとして動作）
  }
}

/**
 * 同期をクリーンアップ（ログアウト時に firebase.js から呼ばれる）
 * ※ 同期メタデータ（patgs27_syncmeta_<uid>）はここでは消さない。
 *   同じ端末・同じアカウントで次にログインしたときに「初回同期」扱いに
 *   戻ってしまわないようにするため。
 */
function patgsCleanupRealtimeSync() {
  if (patgsSyncState.syncPollingInterval) {
    clearInterval(patgsSyncState.syncPollingInterval);
    patgsSyncState.syncPollingInterval = null;
  }

  if (patgsSyncState.realtimeListenerRef) {
    off(patgsSyncState.realtimeListenerRef);
    patgsSyncState.realtimeListenerRef = null;
  }

  patgsSyncState.currentUserUid = null;
  patgsSyncState.isInitialized = false;
  patgsSyncState.lastLocalSnapshot = {};
  patgsSyncState.pendingLocalDeletionKeys = new Set();
}

window.patgsInitializeRealtimeSync = patgsInitializeRealtimeSync;
window.patgsCleanupRealtimeSync = patgsCleanupRealtimeSync;

export {
  patgsInitializeRealtimeSync,
  patgsCleanupRealtimeSync
};
