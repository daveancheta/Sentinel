import { expect, test } from "@playwright/test";

test("cached app shell and settings reload offline", async ({ page, context }) => {
  await page.addInitScript(() => {
    const request = indexedDB.open("KitaDatabase", 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      db.createObjectStore("people", { keyPath: "id", autoIncrement: true }).createIndex("name", "name");
      db.createObjectStore("places", { keyPath: "id", autoIncrement: true }).createIndex("name", "name");
      db.createObjectStore("settings", { keyPath: "key" });
      db.createObjectStore("events", { keyPath: "id", autoIncrement: true });
    };
    request.onsuccess = () => {
      const db = request.result;
      db.transaction("settings", "readwrite").objectStore("settings").put({ key: "setupComplete", value: true });
      db.close();
    };
  });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Kita" })).toBeVisible();
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) await new Promise<void>((resolve) => navigator.serviceWorker.addEventListener("controllerchange", () => resolve(), { once: true }));
  });
  await page.goto("/settings");
  await expect(page.getByRole("heading", { name: /settings|setting/i })).toBeVisible();
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole("heading", { name: /settings|setting/i })).toBeVisible();
  await expect(page.getByRole("heading", { name: /demo and captions|demo at captions/i })).toBeVisible();
});
