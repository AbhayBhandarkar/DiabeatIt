# Capability matrix and release gates

## Implemented and locally testable

| Capability | Exact boundary |
| --- | --- |
| Isolated demo onboarding | Random opaque cookie, hash stored in DB, seven-day expiry; no real-user identity |
| Persistent records | Embedded PGlite default; optional PostgreSQL connection implemented |
| Role simulation | Patient, adult companion, fictional reviewer; role can be changed by demo owner |
| Permission enforcement | Server denies unauthorized companion actions and redacts unshared collections |
| Glucose journal | Manual records, original units, timestamps, context, deletion with audit event |
| Intake reports | Today in India time; taken/not-taken/unsure/deferred; one current report per medicine/day |
| Barriers | Optional reasons on not-taken reports; report/history visibility |
| Prescription storage | PDF/PNG/JPEG up to 2 MB, maximum ten; signature checks; authenticated downloads |
| Prescription Change Map | Curated fixed scenario only, not automatic analysis of uploads |
| Review requests | Patient/authorized companion requests; fictional reviewer status and notes |
| Plan publication | Versioned **notes only**; existing medication instructions never change |
| Plan acknowledgement | User chooses current version and acknowledges reading; uncertainty does not count |
| Care handover | Factual intake/review counts and author/time; current server snapshot, not monitoring |
| Food catalog/log | Eight illustrative estimates; portions, meal time, repeat-most-recent-meal, deletion |
| DiabetesCore | Manually curated fixture in expandable research preview; no validated algorithm |
| Education | Eight source-linked English drafts, completion, device-generated optional speech |
| App languages | English; Hindi navigation/greeting preview only |
| Reports | Printable appointment summary and patient JSON export |
| Data controls | Permission changes/revocation, reset, deletion of demo session |
| Appearance | Responsive layouts, light/dark/system themes, larger text, reduced motion |
| PWA resources | Manifest, PNG icons, public-asset service worker; API data never cached |
| Commercial pitch | Business hypotheses visible in Settings; no billing |

## Simulated / explicitly not working clinical services

- All seeded people, prescriptions, and glucose observations are fictional.
- Reviewer role does not establish professional identity, licensure, or authority.
- No real cross-account family sharing or invitation delivery. The role selector demonstrates a single isolated record's authorization rules.
- No clinical drug-interaction engine. Ingredient overlap is a curated demonstration, not screening of arbitrary entries.
- No OCR. Uploaded documents are preserved, not automatically extracted, normalized, or scored.
- No arbitrary medication administration or real regimen editing. Two fictional scheduled medicines demonstrate the recording flow.
- Deferred reminders do not schedule a notification. **No background medication alarm is delivered.**
- No device connection, CGM safety alarm, prediction, clinical glucose interpretation, or dosing support.
- No human narration or rendered clinical videos. Illustrations and a simple animation support text; speech uses the browser/OS voice.
- Nutrition is illustrative, not verified FoodData Central or ICMR composition ingestion. No clinical meal-planning claim.
- No fully offline data entry. The already-open tab can show its loaded state; writes fail clearly until connected. Reloading offline cannot open clinical records.
- No real subscription checkout or entitlement enforcement. Business model only.
- No native mobile binary. Capacitor config is not a tested native app.

## Clinical production gates (not completed)

1. Finalize intended use and obtain India-specific legal/regulatory analysis.
2. Verify professional registration and contract service coverage, turnaround, escalations, and absence management.
3. Integrate licensed India-relevant medication identity/interaction knowledge; measure coverage and failure modes.
4. Validate medication-reconciliation workflows using pharmacist-designed cases and representative older adults.
5. Validate nutrition data and scoring rubric; independent dietitian review, regional coverage, portion sensitivity, comprehension testing.
6. Review every educational script and translation; establish review expiry and withdrawal workflow.
7. Implement verified identity, recovery, MFA for professionals, organization membership, genuine scoped invitations, and legal-representative handling.
8. Migrate document blobs to private object storage with malware scanning, keys, retention, and operational controls.
9. Replace session JSON aggregate with normalized, versioned patient/organization entities as real multi-user requirements are established.
10. Validate device/provider integrations, native permissions, reboot/timezone/background behavior, and user-visible freshness.
11. Security review, penetration test, incident response exercise, disaster recovery and external PostgreSQL load tests.
12. Define retention/deletion with backups, obtain consent, review subprocessors, ensure no real PHI reaches demo/test systems.

Do not describe the current implementation as production-ready for real diabetes care, medically validated, HIPAA/DPDP certified, or capable of preventing overdoses. Those claims have not been established.