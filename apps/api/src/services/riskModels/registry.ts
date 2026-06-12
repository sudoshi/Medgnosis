// =============================================================================
// Pluggable risk-model registry
// A model declares its eligible cohort and how to compute a score from a
// patient context. runRiskModels gathers the context once and dispatches.
// =============================================================================

export interface PatientRiskContext {
  patient_id: number;
  age: number;
  gender: string;
  conditions: string[]; // active problem-list ICD-10 codes
  onAnticoagulant: boolean;
  // Gail inputs (typically absent in structured EHR data)
  menarcheAge?: number;
  firstBirthAge?: number;
  firstDegreeRelatives?: number;
  biopsies?: number;
}

export interface RiskComputation {
  score: number | null;
  category: string;
  components: Record<string, unknown>;
  careGap: boolean;
}

export interface RiskModel {
  code: string;
  eligible(ctx: PatientRiskContext): boolean;
  compute(ctx: PatientRiskContext): RiskComputation;
}

/** True if any active problem code starts with the given ICD-10 prefix. */
export function hasDx(ctx: PatientRiskContext, prefix: string): boolean {
  return ctx.conditions.some((c) => c?.startsWith(prefix));
}

const models = new Map<string, RiskModel>();

export function register(model: RiskModel): void {
  models.set(model.code, model);
}

export function getModel(code: string): RiskModel | undefined {
  return models.get(code);
}

export function allModels(): RiskModel[] {
  return [...models.values()];
}
