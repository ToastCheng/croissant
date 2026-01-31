"use client";

import { useEffect } from "react";

function urlBase64ToUint8Array(base64String: string) {
    const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding)
        .replace(/\-/g, "+")
        .replace(/_/g, "/");

    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);

    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
}

export default function PushSubscriber() {
    useEffect(() => {
        async function registerAndSubscribe() {
            if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
                console.log("Push notifications not supported");
                return;
            }

            try {
                // 1. Register Service Worker
                const registration = await navigator.serviceWorker.register("/sw.js");
                console.log("Service Worker registered");

                // 2. Check permission
                if (Notification.permission === "denied") {
                    console.log("Notifications blocked");
                    return;
                }

                // Request permission if default
                if (Notification.permission === "default") {
                    const permission = await Notification.requestPermission();
                    if (permission !== "granted") return;
                }

                // 3. Get VAPID Key from Server
                // Using /api/notifications proxy path
                const response = await fetch("/api/notifications/vapid-key");
                if (!response.ok) throw new Error("Failed to get VAPID key");
                const { publicKey } = await response.json();

                // 4. Subscribe
                const subscription = await registration.pushManager.subscribe({
                    userVisibleOnly: true,
                    applicationServerKey: urlBase64ToUint8Array(publicKey),
                });

                // 5. Send to Server
                await fetch("/api/notifications/subscribe", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify(subscription),
                });

                console.log("Push subscription successful");
            } catch (err) {
                console.error("Push subscription failed:", err);
            }
        }

        registerAndSubscribe();
    }, []);

    return null;
}
