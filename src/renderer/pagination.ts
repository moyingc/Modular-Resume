// V8 pagination behavior lives in the workbench measurement renderer.
//
// Rules:
// 1. Hidden measurement page uses the exact same A4/Letter physicalPage geometry.
// 2. A top-level Section stays atomic whenever it fits on one page.
// 3. Oversized Sections split at direct child (Entry / Skill / Bullet) boundaries.
// 4. Continuation pages repeat the Section heading.
// 5. Preview and Print render the exact same ResumePageModel[].
// 6. Page Fit exposes raw usage, so >100% can be reported instead of silently clamped.
//
// Future refinement:
// - split a single oversized Entry at Bullet boundaries;
// - keep Entry title + first Bullet together.
