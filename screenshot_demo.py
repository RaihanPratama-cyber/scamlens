"""ScamLens demo screenshot + smoke test (Playwright, headless Chromium).
Serves nothing itself — expects the app on http://localhost:3000.
Saves real screenshots to ../storyboard/ and prints console errors.
Demo mode: no firebase-config.js, so the local mock AI answers
(labelled "Demo AI (local mock) — not Gemini" in the UI)."""
import asyncio, json, sys
from playwright.async_api import async_playwright

OUT = "/home/hatch/workspace/lomba-tracker/starter-packs/buildhybridai-2026/storyboard"
BASE = "http://localhost:3000"

async def main():
    errors = []
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page(viewport={"width": 1280, "height": 800})
        page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        page.on("pageerror", lambda e: errors.append(str(e)))
        await page.goto(BASE, wait_until="networkidle")
        await page.wait_for_timeout(800)
        await page.screenshot(path=f"{OUT}/01-home.png", full_page=True)
        print("firebase-status:", await page.inner_text("#firebase-status"))
        print("nano-status:", await page.inner_text("#nano-status"))

        # Scene 2: job scam example chip -> on-device/mock result
        await page.click("text=job scam")
        await page.wait_for_timeout(600)
        await page.screenshot(path=f"{OUT}/02-job-scam-result.png", full_page=True)
        print("verdict:", await page.inner_text("#verdict"))
        print("score:", await page.inner_text("#score"))
        print("explanation:", await page.inner_text("#explanation"))
        print("route:", await page.inner_text("#route"))
        print("privacy:", await page.inner_text("#privacy"))
        print("status:", await page.inner_text("#status"))

        # Scene 4: deep analysis -> tactics + safe reply
        await page.click("#deep")
        await page.wait_for_timeout(600)
        await page.screenshot(path=f"{OUT}/03-deep-analysis.png", full_page=True)
        print("deep verdict:", await page.inner_text("#verdict"))
        print("tactics:", await page.inner_text("#tactics"))
        print("safe-reply:", await page.inner_text("#safe-reply-text"))
        print("deep status:", await page.inner_text("#status"))

        # Scene 5: legit message -> LOW
        await page.click("text=bank warning legit")
        await page.wait_for_timeout(600)
        await page.screenshot(path=f"{OUT}/04-legit-result.png", full_page=True)
        print("legit verdict:", await page.inner_text("#verdict"))
        print("history visible:", await page.is_visible("#history"))
        await page.screenshot(path=f"{OUT}/05-history.png", full_page=True)
        await browser.close()
    real_errors = [e for e in errors if "firebase-config.js" not in e and "Failed to load resource" not in e]
    print("CONSOLE ERRORS (excluding expected missing firebase-config.js 404):", json.dumps(real_errors, indent=2) if real_errors else "none")
    return 0 if not real_errors else 1

sys.exit(asyncio.run(main()))
