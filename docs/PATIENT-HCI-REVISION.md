# Patient-first revision — 4 November 2026

This revision was implemented directly, without subagents. It is not a claim that every requested clinical or AI feature is finished.

## Implemented
- Care lands on People & access. Task/question/symptom entry chores are removed from the primary Care screen. Existing records and APIs remain intact. Appointment summaries use existing records.
- Food lands on search, with a prominent camera action and common food shortcuts. Manual entry and previously saved recipes are secondary. Four original cooking suggestions have ingredients, instructions, source notes and optional device read-aloud.
- Camera opens the device photo/camera picker, resizes locally and strips file metadata through canvas re-encoding. Transmission requires explicit consent. A fixed OpenAI Responses API integration validates the image and structured result, sets store:false, and does not persist/cache/log photos. It suggests food identities and rough grams only. The user must select a food composition record; exact nutrients are not invented from pixels.
- Vision requires OPENAI_API_KEY and OPENAI_VISION_MODEL in the server environment. Neither was configured during this revision. The mocked integration, disabled state and privacy path are tested; real AI inference is NOT verified or active.
- Paracetamol resolves to acetaminophen for US reference providers, with a visible explanation and MedlinePlus synonym source. No salt, dose, brand or formulation equivalence is inferred. Live smoke returned 20 DailyMed references and 10 openFDA label records; both HTTP 200. Temporary account deleted.
- A short original paracetamol explanation links to NHS guidance. Side effects are not a personal diagnosis. Multi-medicine reference comparison loads individual label sections; entered ingredient overlap recognizes the paracetamol synonym. This is NOT comprehensive drug interaction screening or a safe-to-combine result.
- Blue/ink palette replaces green in the patient interface. Explicit dark-mode hover text/background/border pairs replace ambiguous inherited colors.
- Learning now starts with a five-step labelled biological schematic: intestine, pancreas, blood, muscle-cell signalling, and type-2 context. Each step links to supporting NIDDK guidance. It is a simplified process illustration, not anatomical scale. The old videos are secondary, not described as replaced or clinically approved. Independent clinical review remains pending.

## Evidence consulted
- https://medlineplus.gov/druginfo/meds/a681004.html — lists paracetamol as another name for acetaminophen; linked, not copied wholesale.
- https://www.nhs.uk/medicines/paracetamol-for-adults/ — general uses, side effects, duplicate ingredient and interaction cautions. Original short summary, not personalized advice.
- https://www.niddk.nih.gov/health-information/diabetes/overview/what-is-diabetes — insulin, pancreas, type 1/type 2 distinction.
- https://www.niddk.nih.gov/health-information/diabetes/overview/what-is-diabetes/prediabetes-insulin-resistance — tissue response to insulin.
- https://www.niddk.nih.gov/health-information/digestive-diseases/digestive-system-how-it-works — digestion and absorption.
- https://www.cdc.gov/diabetes/healthy-eating/choosing-healthy-carbs.html — carbohydrate quality, fiber, portions.
- https://developers.openai.com/api/docs/guides/images-vision — image input format and limitations.

## Critical persistence finding
The original local `.data/diabeatit` database fails recovery with `PANIC: could not locate a valid checkpoint record at 0/703900`. No record reset, WAL reset, deletion or overwrite was performed. Cause is not conclusively established; interrupted execution and a synced folder are observed context, not proven causation. Recovery requires a valid backup or specialist investigation. Do not claim the previous accounts were recovered.

Validation uses a DIFFERENT explicitly selected database outside OneDrive: `%LOCALAPPDATA%/DiabeatIT/hci-validation-20261104`, configured through PGLITE_DATA_DIR. It has separate test accounts. The existing account credentials will not find their old records in it. This is not a silent migration. Move real deployments to managed PostgreSQL with verified backups and recovery tests before real patient use.

## Remaining work / external gates
- No licensed interaction database or clinical review service is configured. Individual label lookup must not be presented as comprehensive pairwise screening.
- No real photo inference run without credentials; no camera-derived exact micronutrient claims. OFF product data does not cover every Indian cooked meal. USDA integration needs its own key; verified regional composition ingestion is outstanding.
- Recipes have no measured nutritional validation, no allergy screening, and device speech is not professional narration.
- New biological illustration is interactive SVG, not a newly rendered narrated video. Replacing the video library still requires reviewed scripts, biological art direction, narration and audiovisual QA.
- Native notifications, CGM integrations, physical-device accessibility/usability study, production clinical/regulatory/security clearance remain unfinished.

No clinician endorsement, clinical validation, exhaustive food coverage, production readiness or guaranteed prevention of medication harm is claimed.

## Verification of this revision

Final local run, 4 November 2026: production build passed; 152 tests across nine Vitest files passed; browser suite 26 passed and one expected desktop-only mobile-drawer skip; npm audit reported zero known vulnerabilities. Browser coverage includes simple People & access, camera unavailable/privacy state, cookbook, source-linked biology, opt-in sharing, legacy video access, and 42 screen/theme/viewport checks. Additional dark hover scans and desktop/mobile screenshots were inspected. These tests used the separate validation database, NOT the unrecovered original data.

Live paracetamol lookup returned 20 DailyMed references and 10 openFDA product records, with the synonym explicitly reported as acetaminophen. Live OpenAI inference was not run because no credentials/model were configured. Vision tests mock provider responses and verify consent/signature/schema/error handling; they do not establish model accuracy.