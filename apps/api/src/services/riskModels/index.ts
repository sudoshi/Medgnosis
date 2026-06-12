// =============================================================================
// Risk model registration — import for side effects, then use allModels().
// =============================================================================

import { register, hasDx, type RiskModel } from './registry.js';
import { scoreCha2ds2Vasc } from './cha2ds2vasc.js';
import { scoreGail } from './gail.js';

const cha2ds2VascModel: RiskModel = {
  code: 'CHA2DS2_VASC',
  eligible: (ctx) => hasDx(ctx, 'I48'), // atrial fibrillation/flutter
  compute: (ctx) => {
    const r = scoreCha2ds2Vasc({
      age: ctx.age,
      gender: ctx.gender,
      chf: hasDx(ctx, 'I50'),
      htn: hasDx(ctx, 'I10') || hasDx(ctx, 'I11'),
      dm: hasDx(ctx, 'E10') || hasDx(ctx, 'E11'),
      stroke: hasDx(ctx, 'I63') || hasDx(ctx, 'G45'),
      vascular: hasDx(ctx, 'I25') || hasDx(ctx, 'I70') || hasDx(ctx, 'I71'),
    });
    return {
      score: r.score,
      category: r.category,
      components: { ...r.components, anticoag_indicated: r.anticoag_indicated },
      // The gap nobody computed: anticoagulation indicated but not prescribed.
      careGap: r.anticoag_indicated && !ctx.onAnticoagulant,
    };
  },
};

const gailModel: RiskModel = {
  code: 'GAIL_BCRA',
  eligible: (ctx) => (ctx.gender ?? '').toLowerCase().startsWith('f') && ctx.age >= 35 && ctx.age <= 85,
  compute: (ctx) => {
    const r = scoreGail({
      age: ctx.age,
      gender: ctx.gender,
      menarcheAge: ctx.menarcheAge,
      firstBirthAge: ctx.firstBirthAge,
      firstDegreeRelatives: ctx.firstDegreeRelatives,
      biopsies: ctx.biopsies,
    });
    return { score: r.score, category: r.category, components: r.components, careGap: false };
  },
};

register(cha2ds2VascModel);
register(gailModel);

export { allModels, getModel, type PatientRiskContext, type RiskComputation } from './registry.js';
