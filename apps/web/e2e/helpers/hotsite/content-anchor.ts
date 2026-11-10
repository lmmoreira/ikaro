import { expect, type Locator } from '@playwright/test';

// Pixel tolerance for sub-pixel layout rounding.
const EDGE_TOLERANCE_PX = 1;

// Asserts the stage's content wrapper is anchored to the stage's right edge. Measures layout
// instead of reading the computed `justify-content` keyword: Chromium's serialization of that
// keyword is not a stable contract (Chromium 158 reports `flex-end` as `flow-end`), while where
// the content actually lands is.
export async function expectContentAnchoredRight(stage: Locator): Promise<void> {
  const content = stage.locator('> *').first();
  await expect
    .poll(async () => {
      const [stageBox, contentBox] = await Promise.all([
        stage.boundingBox(),
        content.boundingBox(),
      ]);
      if (!stageBox || !contentBox) return null;
      const rightGap = stageBox.x + stageBox.width - (contentBox.x + contentBox.width);
      const leftGap = contentBox.x - stageBox.x;
      return { flushRight: Math.abs(rightGap) <= EDGE_TOLERANCE_PX, hasRoomOnLeft: leftGap > 0 };
    })
    .toEqual({ flushRight: true, hasRoomOnLeft: true });
}

// Asserts the stage sits at the top of its section's content box (`align-items: flex-start`).
// Layout-based for the same reason as expectContentAnchoredRight: Chromium 158 reports
// `flex-start` as `flow-start`. The section's padding-top is numeric, so it is read as a number.
export async function expectContentAnchoredTop(section: Locator, stage: Locator): Promise<void> {
  await expect
    .poll(async () => {
      const [sectionBox, stageBox, paddingTop] = await Promise.all([
        section.boundingBox(),
        stage.boundingBox(),
        section.evaluate((el) => Number.parseFloat(getComputedStyle(el).paddingTop)),
      ]);
      if (!sectionBox || !stageBox) return null;
      return Math.abs(stageBox.y - (sectionBox.y + paddingTop)) <= EDGE_TOLERANCE_PX;
    })
    .toBe(true);
}
