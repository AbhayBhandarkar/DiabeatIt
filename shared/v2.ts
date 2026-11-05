/** Account-backed API. Response timestamps are ISO 8601 UTC; medicine/intake calendars use Asia/Kolkata. */
export function intakeToday(now: Date = new Date()): string {
	return new Date(now.getTime() + 330 * 60000).toISOString().slice(0, 10);
}
export const entityKinds = ['medicines', 'intakes', 'glucose', 'meals', 'recipes', 'documents', 'questions', 'tasks', 'symptoms', 'lessons', 'reviews', 'appointments', 'labs'] as const;
export type EntityKind = typeof entityKinds[number];
export type Scope = `${EntityKind}:${'read' | 'write'}`;
export const allScopes: Scope[] = entityKinds.flatMap(kind => [`${kind}:read`, `${kind}:write`] as Scope[]);
export interface User { id: string; name: string; email: string }
export interface Author { id: string; name: string; role: 'owner' | 'companion' }
export interface Space { id: string; name: string; role: 'owner' | 'companion'; scopes: Scope[] }
export interface MeResponse { user: User; spaces: Space[]; spaceId: string | null }
export interface RegisterRequest { name: string; email: string; password: string; consent: true }
/** Recovery codes are returned only here, never in /me. Store them offline. */
export interface RegisterResponse extends MeResponse { recoveryCodes: string[] }
export interface LoginRequest { email: string; password: string }
export interface ChangePasswordRequest { currentPassword: string; newPassword: string }
export interface RecoverRequest { email: string; recoveryCode: string; newPassword: string }
export interface DeleteAccountRequest { password: string; confirmation: 'DELETE' }
export interface MedicineData { name: string; ingredient: string; strength: string; form: string; route: string; instructions: string; times: string[]; days: number[]; startDate: string; endDate?: string; status: 'active' | 'archived'; source: string; stock?: number }
/** date is the patient-reported occurrence date (<= IST today), not the submission date.
 * scheduledTime identifies the entered schedule slot, NOT an actual intake timestamp or time gate.
 * Status/reason corrections retain the occurrence identity even after archival/schedule edits.
 * A changed identity must match an active medicine's current days, dates and times. No clinical inference.
 */
export interface IntakeData { medicineId: string; date: string; scheduledTime: string; status: 'taken' | 'not-taken' | 'unsure'; reason: string }
export interface GlucoseData { value: number; unit: 'mg/dL' | 'mmol/L'; measuredAt: string; context: string }
export interface Nutrition { carbs: number | null; fiber: number | null; protein: number | null; kcal: number | null }
export interface MealData extends Nutrition { name: string; meal: string; at: string; grams: number; source: string; sourceUrl?: string; foodId?: string }
export interface RecipeIngredient extends Nutrition { name: string; grams: number; source: string }
export interface RecipeData { name: string; servings: number; ingredients: RecipeIngredient[]; instructions: string }
export interface DocumentData { name: string; mime: 'application/pdf' | 'image/png' | 'image/jpeg'; base64: string }
export interface DocumentMetadata { name: string; mime: DocumentData['mime']; size: number }
export interface QuestionData { text: string }
export interface TaskData { title: string; assignee: string; dueDate: string; status: 'open' | 'done' }
export interface SymptomData { text: string; at: string }
export interface LessonData { lessonId: string; completed: boolean; position: number }
/** Patient coordination notes, not professional signoff or clinical clearance. */
export interface ReviewData { title: string; question: string; status: 'open' | 'resolved'; resolution: string }
/** A past or upcoming consultation. `changes` records what the clinician said, in the patient's words. */
export interface AppointmentData { date: string; clinician: string; specialty: string; facility: string; reason: string; notes: string; changes: string; followUp?: string }
/** A test result copied from a lab report, e.g. HbA1c 7.4 %. No reference-range interpretation. */
export interface LabData { name: string; value: number; unit: string; takenOn: string; notes: string }
export interface EntityDataMap { medicines: MedicineData; intakes: IntakeData; glucose: GlucoseData; meals: MealData; recipes: RecipeData; documents: DocumentData; questions: QuestionData; tasks: TaskData; symptoms: SymptomData; lessons: LessonData; reviews: ReviewData; appointments: AppointmentData; labs: LabData }
export type CreateEntityRequest = { [K in EntityKind]: { kind: K; data: EntityDataMap[K] } }[EntityKind];
export interface UpdateEntityRequest<K extends EntityKind = EntityKind> { version: number; data: EntityDataMap[K] }
export interface DeleteEntityRequest { version: number }
/** Document entities contain DocumentMetadata, never base64, including on write responses/export. */
export interface Entity { id: string; kind: EntityKind; version: number; createdAt: string; updatedAt: string; author: Author; data: Record<string, unknown> }
export type EntityCollections = Record<EntityKind, Entity[]>;
export interface Grant { id: string; accountId: string; name: string; label: string; scopes: Scope[]; createdAt: string }
export interface Invitation { id: string; label: string; scopes: Scope[]; expiresAt: string; createdAt: string }
export interface AuditRecord { id: string; actorId: string; action: string; entityId: string | null; version: number | null; at: string }
export interface AuditResponse { audit: AuditRecord[]; nextBefore: string | null }
export interface AuditQuery { before?: string }
export interface SnapshotResponse { space: Space; entities: EntityCollections; grants: Grant[]; invitations: Invitation[]; audit: AuditRecord[] }
export interface ExportResponse extends SnapshotResponse { exportedAt: string; format: 'diabeatit-v2'; notice: string }
export interface InviteRequest { label: string; scopes: Scope[] }
export interface InviteResponse { id: string; token: string; expiresAt: string }
export interface AcceptInviteRequest { token: string }
export interface AcceptInviteResponse { spaceId: string; grantId: string }
export interface OkResponse { ok: true }
export interface ErrorResponse { error: string; code: string }
export interface MedicineReference { id: string; title: string; published: string | null; url: string }
export interface MedicineSearchResponse { results: MedicineReference[]; source: string; limitations: string }
export interface MedicineDetailResponse { result: MedicineReference; pdfUrl: string; source: string; limitations: string }
export interface LabelSections { adverse_reactions: string[]; warnings: string[]; drug_interactions: string[]; indications_and_usage: string[] }
export interface DrugLabel { id: string; title: string; generic: string[]; brand: string[]; manufacturer: string[]; route: string[]; sections: LabelSections; sourceUrl: string; updated: string | null; region: 'US' }
export interface LabelsResponse { results: DrugLabel[]; source: string; limitations: string }
/** Read-only, time-limited link a patient gives to a clinician. The token is shown once. */
export interface ClinicianLink { id: string; label: string; fromDate: string; expiresAt: string; createdAt: string; lastViewedAt: string | null }
export interface ClinicianLinkCreated extends ClinicianLink { token: string }
export interface ClinicianView { patientName: string; label: string; fromDate: string; expiresAt: string; generatedAt: string; entities: Pick<EntityCollections, 'medicines' | 'intakes' | 'glucose' | 'appointments' | 'labs' | 'symptoms' | 'questions' | 'meals'> }
/** Desktop sign-in approved from an already signed-in phone. */
export interface QrStartResponse { id: string; secret: string; match: string; expiresAt: string }
export interface QrPollResponse { status: 'pending' | 'approved' | 'denied' | 'expired'; me?: MeResponse }
export interface QrDetails { id: string; device: string; createdAt: string; expiresAt: string; choices: string[] }
export interface FoodResult { id: string; name: string; brand: string; per100g: Nutrition; source: string; sourceUrl: string }
export interface FoodsResponse { results: FoodResult[]; provider: 'OpenFoodFacts' | 'USDA FoodData Central'; notice: string }
export interface KnowledgeSearchQuery { q: string }
export type FoodsSearchQuery = { q: string; barcode?: never } | { barcode: string; q?: never };