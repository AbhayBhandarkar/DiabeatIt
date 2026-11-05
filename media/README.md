# DiabeatIT visual lesson bundle

## 4 November update

The main app now presents one integrated library of **four** videos; there is no earlier/legacy grouping. All existing lessons were rerendered with blue accents. The new **From your meal to your muscle cells** lesson (`glucose-journey`) uses labelled intestine, pancreas, blood vessel and muscle-cell schematics with animated glucose/insulin signalling. It is an original simplified process drawing, not anatomical scale. NIDDK claim-support records are included in sources.json and the generated metadata. All four outputs passed full decode: 48 seconds, 1,152 frames each, H.264/AAC, captions/transcripts/posters. Narration remains local synthetic speech and no clinical signoff is claimed. The historical notes below describe the initial three-video bundle.

Three **actual rendered Manim Community MP4s**, not a speech-only substitute. Each is 48 seconds, 1280 × 720, 24 fps, H.264/yuv420p video with AAC narration. Original Text/shape animations use Cairo/Pango and Segoe UI; no LaTeX, stock footage, or external TTS.

Open the running independent preview at **http://127.0.0.1:5181/lessons/**. This is not registered in the main app. No existing application, server, package, task, or configuration files were edited by this media implementation.

## Published files

| Lesson | MP4 | Subtitles | Poster | Transcript |
|---|---|---|---|---|
| Ingredient / brand overlap | [MP4](../public/lessons/ingredient-overlap.mp4) | [VTT](../public/lessons/ingredient-overlap.en.vtt) | [JPG](../public/lessons/ingredient-overlap.poster.jpg) | [Text](../public/lessons/ingredient-overlap.transcript.txt) |
| Label portions | [MP4](../public/lessons/label-portions.mp4) | [VTT](../public/lessons/label-portions.en.vtt) | [JPG](../public/lessons/label-portions.poster.jpg) | [Text](../public/lessons/label-portions.transcript.txt) |
| Uncertain medication intake | [MP4](../public/lessons/uncertain-intake.mp4) | [VTT](../public/lessons/uncertain-intake.en.vtt) | [JPG](../public/lessons/uncertain-intake.poster.jpg) | [Text](../public/lessons/uncertain-intake.transcript.txt) |

Player files: [index.html](../public/lessons/index.html), [player.css](../public/lessons/player.css), [player.js](../public/lessons/player.js), [manifest.json](../public/lessons/manifest.json).

Typed integration metadata: [shared/videoLessons.ts](../shared/videoLessons.ts).

## Timing and interactions

All lessons have six eight-second chapters: 0–8, 8–16, 16–24, 24–32, 32–40, 40–48 seconds. Narration starts 0.65 seconds into each chapter; its measured length is checked before rendering. The spoken checkpoint finishes before the pause.

| Lesson ID | Pause | Resume | Replay | Meaningful checkpoint |
|---|---:|---:|---:|---|
| ingredient-overlap | 31 s | 32 s | 24 s | Shared X means **possible overlap needing professional clarification**, not interchangeability. |
| label-portions | 31 s | 32 s | 24 s | 60 g / 30 g = two servings; 12 g × 2 = **24 g carbohydrate**, not 60 g. |
| uncertain-intake | 31 s | 32 s | 24 s | An empty log plus uncertain memory supports **unsure with source/time**, not definitely taken/missed. |

The independent player pauses automatically, offers three choices with individual feedback, and requires an answer before continuing. Any answer can continue after its explanation: this is reflection, not a clinical competency assessment. Seeking past an unanswered checkpoint returns to it. Replay and restart reset the checkpoint. State is in memory only and clears on lesson changes/reload. The MP4 by itself is linear; interactivity lives in the player and metadata. Native video fullscreen may require exiting fullscreen to reach the external answer controls.

## TypeScript contract

Named exports: `videoLessons`, `VideoLesson`, `VideoLessonCheckpoint`, `VideoLessonSource`.

`VideoLesson` fields:

- `id`, `title`, `category`, `summary`, `language`, `durationSeconds`.
- `video`: `src`, `mimeType`, `width`, `height`, `fps`; `poster`; `transcript`.
- `subtitles[]`: `src`, `srcLang`, `label`, `kind`.
- `narration`: `kind`, `engine`, `voice`, `rate`, `externalServiceUsed`, `captionAlignment`.
- `chapters[]`: `startSeconds`, `endSeconds`, `title`.
- `checkpoints[]`: `id`, `atSeconds`, `prompt`, `choices[]` (`id`, `text`, `feedback`), `correctChoiceId`, `pausePlayback`, `resumeAtSeconds`, `replayFromSeconds`.
- `cues[]`: `startSeconds`, `endSeconds`, `text`.
- `sources[]`: `id`, `organization`, `title`, `url`, `accessedOn`, `supports`.
- `safety`: `purpose`, `clinicalReview`, `individualTreatmentAdvice`, `fictionalExamples`.
- `production`: `renderer`, `rendererVersion`, `scene`, `sha256`.

URLs are root-relative `/lessons/...`. The standalone JSON manifest carries the same lesson values and `schemaVersion: 1`. A future app integration should consume this contract; none is performed here.

## Source and safety scope

[sources.json](sources.json) records claim support and access date for FDA drug-label guidance, FDA nutrition-label guidance, AHRQ MATCH medication reconciliation, and NHS poisoning guidance. All four source pages were retrieved during authoring. Wording and diagrams are original summaries, not copied artwork or agency endorsements.

- Fictional boxes and X/Y tokens do not identify real drugs or establish interchangeability.
- Fictional nutrition quantities explain arithmetic, not a food database, recommended portion, or glucose prediction. FDA material describes US labels, not Indian label-format requirements.
- A reminder/log is distinguished from actual intake as an educational application of source verification; not a clinical dosing protocol.
- No dose, treatment change, or extra-dose instruction is generated. Possible overlap and uncertain intake are referred for professional clarification. Suspected overdose/severe symptoms point to urgent **local** medical help; no foreign emergency number is exported.
- **Not clinically reviewed. No clinician signoff.** Review for intended audience and jurisdiction is still needed before clinical deployment.

## Rebuild and preview

Use Python 3.14.6 in **media/.venv**, deliberately inside the allowed write boundary rather than a root-level environment. Direct dependencies are in [requirements.txt](requirements.txt); the successful installed environment is in [requirements-lock.txt](requirements-lock.txt). Configure this interpreter in VS Code before invoking Python tools.

- Run [build.py](build.py) with that interpreter from any directory. It invokes [narrate.ps1](narrate.ps1), renders [scenes.py](scenes.py), muxes via the imageio-ffmpeg wheel, publishes assets/TS, decodes every video and audio stream, and regenerates evidence. `--reuse-audio` reuses the WAV segments; `--reuse-renders` also skips the Manim render. Do not reuse after editing the corresponding source.
- Offline narration requires installed **Microsoft Zira Desktop - English (United States)**. No microphone, patient inputs, or external TTS are used. SAPI rate is 1; audio is never clipped to meet the timeline. Subtitle cues use approximate phrase timing proportional to measured speech duration, not word-level forced alignment.
- Preview: run Node on [serve.mjs](serve.mjs). It binds localhost port 5181, serves only flat lesson assets, and supports HTTP byte ranges. `LESSON_PORT` overrides the port. A plain server without byte ranges can make video seeking/replay unreliable; the initial Python HTTP preview exposed this and was replaced.
- Browser validation: run Node on [verify-player.mjs](verify-player.mjs) while the preview is running. Uses existing Playwright/axe dependencies, without package edits. `LESSON_BASE_URL` overrides the preview origin.
- The metadata was checked with TypeScript strict/noEmit; no app build is needed for this bundle.

Windows toolchain note: native Manim dependencies installed from available wheels. `srt` 3.5.3 was source-only; pip's temporary wheel cleanup encountered OneDrive file locks. Building the official hash-verified source directly produced an installable wheel. The source archive SHA-256 was `4884315043a4f0740fd1f878ed6caa376ac06d70e135f306a6dc44632eed0cc0`. No system elevation or secrets were needed. Keep caches, temporary files, and the environment under media. Build holds are budgeted in integer frames to avoid floating-point duration truncation.

## Verification and remaining gaps

- [validation.json](validation.json): Python/Manim/FFmpeg versions, **1,152 decoded frames and 48.0 seconds per MP4**, H.264/yuv420p/AAC, dimensions, audio samples, six distinct chapter frames, bytes and SHA-256. PyAV and FFmpeg full decodes passed.
- [browser-validation.json](browser-validation.json): Chromium playback/paused state observed at checkpoints for all three, all 9 feedback paths, continue/replay/reset/seek guard, all 12 public media resources returning 200, VTT tracks loaded (11/12/12 cues), source hashes verified, no page errors or external requests. Automated axe WCAG A/AA checks: zero violations in the tested desktop lesson states and mobile checkpoint state. No horizontal overflow at 1440/768/390/320 px.
- Visual contact sheets: [ingredient-overlap.contact.jpg](ingredient-overlap.contact.jpg), [label-portions.contact.jpg](label-portions.contact.jpg), [uncertain-intake.contact.jpg](uncertain-intake.contact.jpg). All 18 sampled chapter frames inspected; authored frame bounds also asserted during rendering.
- Browser screenshots: [player-desktop.png](player-desktop.png), [player-mobile.png](player-mobile.png).
- No human end-to-end listening, physical-device, Safari/Firefox, screen-reader, clinical, or localization validation. Small video text is best viewed enlarged; the responsive player supplies readable checkpoint text and transcripts. Automated axe results do not establish complete accessibility conformance.

## Authoring / generated file inventory

Authoring: this README, [.gitignore](.gitignore), [requirements.txt](requirements.txt), [lesson_data.json](lesson_data.json), [sources.json](sources.json), [narrate.ps1](narrate.ps1), [scenes.py](scenes.py), [build.py](build.py), [videoLessons.schema.txt](videoLessons.schema.txt), [serve.mjs](serve.mjs), [verify-player.mjs](verify-player.mjs).

Generated durable files: the 16 public files listed above, the shared TypeScript file, requirements lock, two validation JSON reports, three contact sheets, and two browser screenshots. Regenerable intermediates under media/build include 18 SAPI WAV segments, three mixed WAV timelines, silent Manim MP4s/partial clips, vector text caches, and the process log. The private environment, package caches, browser temporary files, and intermediates are ignored by the media-local ignore file, not shipped as runtime assets.