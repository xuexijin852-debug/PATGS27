/* =========================================================
   PATGS27
   sw.js（Service Worker）
   =========================================================

   ・通知はページのJavaScriptからService Worker経由で表示
   ・プッシュ通知ではないため、ページを開いている間の通知
   ・通知タップ時はPATGS27のタイマー／今日のPATGSへ移動
   ========================================================= */

const PATGS_SW_VERSION = "20260921a";

self.addEventListener("install", function () {
    self.skipWaiting();
});

self.addEventListener("activate", function (event) {
    event.waitUntil(self.clients.claim());
});

self.addEventListener("notificationclick", function (event) {

    event.notification.close();

    const targetUrl = "/#timerPanel";

    event.waitUntil(
        clients
            .matchAll({
                type: "window",
                includeUncontrolled: true
            })
            .then(function (clientList) {

                for (let i = 0; i < clientList.length; i++) {
                    const client = clientList[i];

                    if ("navigate" in client) {
                        return client.navigate(targetUrl).then(function () {
                            return client.focus();
                        });
                    }

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
