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

   第五次改革版では、通知が予約と連動するようになったため、
   通知タップ時に「今日のPATGS」へ移動するようにしている。
   ========================================================= */

const PATGS_SW_VERSION = "20260919a";


self.addEventListener("install", function () {
    self.skipWaiting();
});


self.addEventListener("activate", function (event) {
    event.waitUntil(self.clients.claim());
});


/* =========================================================
   通知タップ時の処理

   ・既にPATGS27を開いているタブがあればそれを前面に出す
   ・開いていなければ新しくPATGS27を開く
   ========================================================= */

self.addEventListener("notificationclick", function (event) {

    event.notification.close();

    const targetUrl = "/#nextReservationBox";

    event.waitUntil(
        clients
            .matchAll({
                type: "window",
                includeUncontrolled: true
            })
            .then(function (clientList) {

                for (let i = 0; i < clientList.length; i++) {

                    const client = clientList[i];

                    if ("focus" in client) {
                        return client.focus();
                    }
                }

                if (clients.openWindow) {
                    return clients.openWindow(targetUrl);
                }
            })
    );
});
    );
});
