/* =========================================================
   PATGS27
   sw.js（Service Worker）
   =========================================================

   目的：
   スマホ（特にAndroid Chrome）では、ページのJavaScriptから
   直接 new Notification() を呼び出しても通知を表示できない
   仕組みになっている。

   Service Worker経由の showNotification() を使うことで、
   PC・Androidどちらでも通知を表示できるようにするための
   最小限のファイル。

   プッシュ通知（タブを閉じてても届く仕組み）はここには
   含まれていない。あくまで「タブ・ブラウザを開いている間」
   の通知を、Androidでも正しく表示するためのもの。
   ========================================================= */

self.addEventListener("install", function (event) {

    self.skipWaiting();
});


self.addEventListener("activate", function (event) {

    event.waitUntil(
        self.clients.claim()
    );
});
