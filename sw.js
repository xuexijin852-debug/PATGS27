/* =========================================================
   PATGS27
   sw.js（Service Worker）
   =========================================================

   目的：
   スマホ（特にAndroid Chrome）では、ページのJavaScriptから
   直接 new Notification() を呼び出しても通知を表示できない。
   Service Worker経由の showNotification() を使うことで、
   PC・Androidどちらでも通知を表示できるようにする。

   プッシュ通知（タブを閉じていても届く仕組み）は含まれていない。
   「ブラウザでこのページを開いている間」の通知を、
   Androidでも正しく表示するためのファイル。

   第七次改革版では、旧予約制度をメインから外し、
   週間時間割を中心に運用する。通知タップ時は、
   PATGS27のホーム（今日の時間割）を開く。
   ========================================================= */

const PATGS_SW_VERSION = "20261005a";
const PATGS_SITE_URL = "https://xuexijin852-debug.github.io/PATGS27/";


self.addEventListener("install", function () {
    self.skipWaiting();
});


self.addEventListener("activate", function (event) {
    event.waitUntil(self.clients.claim());
});


/* =========================================================
   通知タップ時の処理

   ・既にPATGS27を開いているタブがあればそれを前面に出す
   ・開いていなければ、正しいURL（PATGS_SITE_URL）で新しく開く
   ========================================================= */

self.addEventListener("notificationclick", function (event) {

    event.notification.close();

    event.waitUntil(
        clients
            .matchAll({
                type: "window",
                includeUncontrolled: true
            })
            .then(function (clientList) {

                for (let i = 0; i < clientList.length; i++) {

                    const client = clientList[i];

                    if (client.url.indexOf(PATGS_SITE_URL) === 0 && "focus" in client) {
                        return client.focus();
                    }
                }

                for (let i = 0; i < clientList.length; i++) {

                    const client = clientList[i];

                    if ("focus" in client) {
                        return client.focus();
                    }
                }

                if (clients.openWindow) {
                    return clients.openWindow(PATGS_SITE_URL);
                }
            })
    );
});
