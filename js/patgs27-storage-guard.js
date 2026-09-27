/**
 * patgs27-storage-guard.js
 *
 * PATGS27 の localStorage を Firebase の uid ごとに完全分離するためのガード。
 *
 * ★なぜこの形にしたか★
 * script.js は index.html の中で firebase.js より先に、通常の <script> タグ
 * （type="module" ではない）として読み込まれ、読み込まれた瞬間に
 * initializePATGS27() を実行して localStorage を読み書きする。
 * つまり「今ログインしているのが誰か」が Firebase 側で分かるより前に、
 * script.js はすでに動き出している。
 *
 * そのため、script.js 自体を変更せずに uid ごとの分離を実現するには、
 * localStorage という「窓口」そのものを、script.js が読み込まれる前に
 * すり替えておく必要がある。このファイルはそれだけを行う。
 * script.js からは、今まで通り localStorage.getItem/setItem/removeItem/key/length
 * を素のキー名で呼んでいるように見える（script.js は一切変更していない）。
 *
 * 内部的には、キーの前に "__patgs27_acct_<uid>__" を付けて
 * 実際の localStorage に保存する。これにより：
 *   - A でログイン中に保存したデータは A の名前空間にのみ入る
 *   - B でログインすると、A のデータは一切見えない（B 用の名前空間は空）
 *   - ログアウト・再ログインしても、A のデータは A の名前空間に残ったまま消えない
 *
 * ★既存データを消さない対応★
 * この仕組みを導入する前から使われていた「素のキー」（例: patgs27_schedule,
 * goalText など）は、この端末で最初に uid が確定したタイミングで一度だけ、
 * その uid の名前空間へコピーする（元の素のキーは消さずにそのまま残す）。
 * 2人目以降のアカウントが同じ端末で初めてログインしたときは、
 * このコピーは行わない（＝他人の素のキーが新しいアカウントに紛れ込まない）。
 *
 * 想定される読み込み順（index.html）:
 *   <script src="js/patgs27-storage-guard.js"></script>
 *   <script src="js/script.js"></script>
 *   <script type="module" src="js/firebase.js"></script>
 */

(function () {
  "use strict";

  if (window.PATGS_STORAGE_GUARD) {
    return; // 二重読み込み防止
  }

  var ACTIVE_UID_KEY = "patgs27_active_uid";
  var MIGRATED_FLAG_KEY = "patgs27_legacy_migrated";
  var NAMESPACE_PREFIX = "__patgs27_acct_";

  var EXCLUDE_PATTERNS = [
    /^patgs27_active_uid$/,
    /^patgs27_legacy_migrated$/,
    /^patgs27_syncmeta_/,   // firebase.sync.js の同期メタデータ
    /^firebase:/,           // Firebase SDK が内部的に使うキー
    /^firebase-/,
    /^firebaseLocalStorageDb/,
    /^__patgs27_acct_/,     // 他アカウントの名前空間そのもの
    /^patgs27_u_/           // 過去の（動作していなかった）旧同期実装の残骸キー
  ];

  function isExcludedKey(key) {
    for (var i = 0; i < EXCLUDE_PATTERNS.length; i++) {
      if (EXCLUDE_PATTERNS[i].test(key)) {
        return true;
      }
    }
    return false;
  }

  // ---- ネイティブの Storage 実装を退避 ----
  var nativeGetItem = Storage.prototype.getItem;
  var nativeSetItem = Storage.prototype.setItem;
  var nativeRemoveItem = Storage.prototype.removeItem;
  var nativeKey = Storage.prototype.key;
  var nativeLengthDescriptor =
    Object.getOwnPropertyDescriptor(Storage.prototype, "length");

  function rawGet(key) {
    return nativeGetItem.call(window.localStorage, key);
  }
  function rawSet(key, value) {
    return nativeSetItem.call(window.localStorage, key, value);
  }
  function rawRemove(key) {
    return nativeRemoveItem.call(window.localStorage, key);
  }
  function rawLength() {
    return nativeLengthDescriptor.get.call(window.localStorage);
  }
  function rawKeyAt(index) {
    return nativeKey.call(window.localStorage, index);
  }
  function rawAllKeys() {
    var keys = [];
    var total = rawLength();
    for (var i = 0; i < total; i++) {
      keys.push(rawKeyAt(i));
    }
    return keys;
  }

  // ---- 現在アクティブな uid（ページ読み込み直後は、前回の値を楽観的に復元） ----
  var activeUid = rawGet(ACTIVE_UID_KEY) || null;

  function namespacePrefix(uid) {
    return NAMESPACE_PREFIX + uid + "__";
  }

  function toStorageKey(rawKey) {
    if (!activeUid || isExcludedKey(rawKey)) {
      return rawKey;
    }
    return namespacePrefix(activeUid) + rawKey;
  }

  // ---- localStorage を透過的にすり替える ----
  Storage.prototype.getItem = function (key) {
    if (this !== window.localStorage) {
      return nativeGetItem.call(this, key);
    }
    return nativeGetItem.call(this, toStorageKey(key));
  };

  Storage.prototype.setItem = function (key, value) {
    if (this !== window.localStorage) {
      return nativeSetItem.call(this, key, value);
    }
    return nativeSetItem.call(this, toStorageKey(key), value);
  };

  Storage.prototype.removeItem = function (key) {
    if (this !== window.localStorage) {
      return nativeRemoveItem.call(this, key);
    }
    return nativeRemoveItem.call(this, toStorageKey(key));
  };

  function visibleKeysForActiveNamespace() {
    var all = rawAllKeys();

    if (!activeUid) {
      // uid未確定時：除外キー以外はそのまま見せる（従来通り）
      return all.filter(function (k) {
        return k !== null && !isExcludedKey(k);
      });
    }

    var prefix = namespacePrefix(activeUid);
    var result = [];
    all.forEach(function (k) {
      if (k !== null && k.indexOf(prefix) === 0) {
        result.push(k.substring(prefix.length));
      }
    });
    return result;
  }

  Storage.prototype.key = function (index) {
    if (this !== window.localStorage) {
      return nativeKey.call(this, index);
    }
    var keys = visibleKeysForActiveNamespace();
    return (index >= 0 && index < keys.length) ? keys[index] : null;
  };

  try {
    Object.defineProperty(Storage.prototype, "length", {
      configurable: true,
      enumerable: nativeLengthDescriptor.enumerable,
      get: function () {
        if (this !== window.localStorage) {
          return nativeLengthDescriptor.get.call(this);
        }
        return visibleKeysForActiveNamespace().length;
      }
    });
  } catch (error) {
    // length の上書きに失敗しても致命的ではない（バックアップ機能の
    // 一覧が他アカウント分も含んでしまう可能性があるのみ）。
    console.error("patgs27-storage-guard: length のオーバーライドに失敗しました:", error);
  }

  // ---- 既存（uid分離前）データの一度きりの移行 ----
  function migrateLegacyDataIfNeeded(uid) {
    if (rawGet(MIGRATED_FLAG_KEY) === "1") {
      return; // どこかのアカウントへ既に移行済み
    }

    var prefix = namespacePrefix(uid);
    var all = rawAllKeys();

    all.forEach(function (rawKey) {
      if (!rawKey || isExcludedKey(rawKey)) {
        return;
      }
      var value = rawGet(rawKey);
      if (value !== null) {
        rawSet(prefix + rawKey, value);
      }
    });

    rawSet(MIGRATED_FLAG_KEY, "1");
  }

  /**
   * firebase.js から、ログイン確定時に呼び出す。
   * 戻り値 needsReload が true の場合、呼び出し側で location.reload() すること
   * （script.js は既に「切り替え前の名前空間」を前提に初期化済みのため、
   *   正しいデータで再初期化させる必要がある）。
   */
  function activateUid(uid) {
    if (!uid) {
      return { needsReload: false };
    }

    if (activeUid === uid) {
      return { needsReload: false };
    }

    var prefix = namespacePrefix(uid);
    var hasNamespaceData = rawAllKeys().some(function (k) {
      return k && k.indexOf(prefix) === 0;
    });

    if (!hasNamespaceData) {
      migrateLegacyDataIfNeeded(uid);
    }

    activeUid = uid;
    rawSet(ACTIVE_UID_KEY, uid);

    return { needsReload: true };
  }

  window.PATGS_STORAGE_GUARD = {
    activateUid: activateUid,
    getActiveUid: function () {
      return activeUid;
    }
  };

})();
