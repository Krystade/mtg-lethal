// Do both colour wheels open from any state? Playtest: "Clicking on secondary
// color picker then primary didn't work. The primary just didn't open."
//
// iOS's popover cannot run headless, so this checks the two things the fix
// rests on, with real taps on an upright and a rotated panel, in Chromium and
// WebKit:
//  1. the finger lands on the native <input type=color> itself, across the
//     whole dot (it used to land on the label's emoji and reach the input only
//     as a label-forwarded click);
//  2. after a second colour has been picked (that input still focused, as iOS
//     leaves it), tapping the primary wheel: the touch's target is the primary
//     input, the secondary input is blurred before the click, and the primary
//     ends up focused -- and the same the other way round.
// Usage: node scripts/color-wheel-check.mjs [baseUrl]
import { chromium, webkit } from "@playwright/test";
const BASE = process.argv[2] || "http://localhost:5180/mtg-lethal/";
let bad = 0;
const PRIMARY = "custom colour", SECOND = "custom second colour";

for (const bt of [chromium, webkit]) {
  const b = await bt.launch();
  const page = await (await b.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, hasTouch: true, isMobile: bt === chromium })).newPage();
  await page.goto(BASE);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForFunction(() => window.__store);
  for (const [pod, seat] of [[4, 0], [2, 1]]) {
    await page.reload();
    await page.waitForFunction(() => window.__store);
    await page.evaluate((pod) => window.__store.getState().newGame({ playerCount: pod, startingLife: 40 }), pod);
    await page.waitForTimeout(200);
    await page.locator(".tile__more").nth(seat).tap({ force: true });
    await page.waitForTimeout(300);
    await page.locator(".disclose").tap({ force: true });
    await page.waitForTimeout(500);
    await page.locator('.stylechip[aria-label="Fade"]').tap();
    await page.waitForTimeout(200);
    const rot = await page.evaluate(() => document.querySelector(".panel").className.includes("panel--rot"));
    const tag = `${bt.name().padEnd(8)} ${pod}p seat ${seat} ${rot ? "rotated" : "upright"}`;

    // 1. hit test across each dot
    for (const label of [PRIMARY, SECOND]) {
      const r = await page.evaluate((label) => {
        const input = document.querySelector(`input[aria-label="${label}"]`);
        const dot = input.closest(".huedot--wheel").getBoundingClientRect();
        let miss = 0, n = 0; const on = new Set();
        for (const fx of [0.3, 0.5, 0.7]) for (const fy of [0.3, 0.5, 0.7]) {
          n++;
          const el = document.elementFromPoint(dot.left + dot.width * fx, dot.top + dot.height * fy);
          if (el !== input) { miss++; on.add(el ? el.tagName + "." + el.className : "nothing"); }
        }
        return { miss, n, on: [...on] };
      }, label);
      const ok = r.miss === 0;
      if (!ok) bad++;
      console.log(`${tag} ${label.padEnd(21)} hits input ${r.n - r.miss}/${r.n} ${ok ? "OK" : "FAIL (on " + r.on.join(", ") + ")"}`);
    }

    // 2. pick one, then tap the other
    for (const [first, then] of [[SECOND, PRIMARY], [PRIMARY, SECOND]]) {
      const tapCentre = async (label) => {
        const box = await page.locator(`input[aria-label="${label}"]`).evaluate((i) => {
          const r = i.closest(".huedot--wheel").getBoundingClientRect();
          return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
        });
        await page.touchscreen.tap(box.x, box.y);
      };
      await tapCentre(first);
      await page.waitForTimeout(150);
      await page.evaluate((label) => {
        const el = document.querySelector(`input[aria-label="${label}"]`);
        el.focus(); // iOS leaves the input focused after its popover closes
        const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
        set.call(el, label.includes("second") ? "#33aa77" : "#aa3355");
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
      }, first);
      await page.waitForTimeout(200);
      await page.evaluate(([first, then]) => {
        window.__wc = { touchOnThen: false, firstBlurredBeforeClick: null };
        const a = document.querySelector(`input[aria-label="${first}"]`);
        const t = document.querySelector(`input[aria-label="${then}"]`);
        const on = (type, fn) => document.addEventListener(type, fn, { capture: true, once: false });
        on("pointerdown", (e) => { if (e.target === t) window.__wc.touchOnThen = true; });
        t.addEventListener("click", () => { window.__wc.firstBlurredBeforeClick = document.activeElement !== a; }, { capture: true, once: true });
      }, [first, then]);
      await tapCentre(then);
      await page.waitForTimeout(200);
      const r = await page.evaluate((then) => ({ ...window.__wc, focused: document.activeElement?.getAttribute("aria-label") === then }), then);
      const ok = r.touchOnThen && r.firstBlurredBeforeClick === true && r.focused;
      if (!ok) bad++;
      console.log(`${tag} ${first} -> ${then}: touch on input ${r.touchOnThen}, previous blurred before click ${r.firstBlurredBeforeClick}, focused ${r.focused} ${ok ? "OK" : "FAIL"}`);
    }
    await page.keyboard.press("Escape");
    await page.waitForTimeout(200);
  }
  await b.close();
}
console.log(bad === 0 ? "\nPASS" : `\nFAIL (${bad})`);
process.exit(bad === 0 ? 0 : 1);
