// =============================================================================
// Medgnosis API — HL7 v2 replay fixtures (surveillance real-feed tests)
// Sample messages used to verify the ORU parser/adapter map a real wire message
// into the correct SurveillanceEvent shape. Synthetic identifiers only; no PHI.
// Segments are \r-terminated to match real HL7 framing (the parser also accepts
// \n / \r\n). Mirrors __fixtures__/oru-vitals.hl7.
// =============================================================================

/**
 * Critical-deterioration ORU^R01: tachycardia, hypotension, tachypnea, hypoxia,
 * fever. Visit (PV1-19) = 7, patient (PID-3) = 4001. Temperature in Celsius.
 */
export const ORU_VITALS_CRITICAL = [
  'MSH|^~\\&|MONITOR|ICU|MEDGNOSIS|HOSP|20260626T101500||ORU^R01|MSG000123|P|2.5.1',
  'PID|1||4001^^^HOSP^MR||DOE^JANE||19550214|F',
  'PV1|1|I|ICU^04^A||||||||||||||||7',
  'OBR|1||OBS9001|VITALS^Vital signs^L|||20260626T101500',
  'OBX|1|NM|8867-4^Heart rate^LN||128|beats/min|||||F',
  'OBX|2|NM|8480-6^Systolic blood pressure^LN||88|mm[Hg]|||||F',
  'OBX|3|NM|9279-1^Respiratory rate^LN||26|breaths/min|||||F',
  'OBX|4|NM|2708-6^Oxygen saturation^LN||91|%|||||F',
  'OBX|5|NM|8310-5^Body temperature^LN||38.7|Cel|||||F',
  'OBX|6|CE|80327-7^Level of consciousness^LN||A|||||F',
  'OBX|7|NM|9269-2^Glasgow coma score total^LN||15|{score}|||||F',
].join('\r');

/** Same shape but temperature reported in Fahrenheit (units 'degF'). */
export const ORU_VITALS_FAHRENHEIT = [
  'MSH|^~\\&|MONITOR|ICU|MEDGNOSIS|HOSP|20260626T101500||ORU^R01|MSG000124|P|2.5.1',
  'PID|1||4002^^^HOSP^MR||ROE^RICHARD||19600101|M',
  'PV1|1|I|MED^12^B||||||||||||||||9',
  'OBR|1||OBS9002|VITALS^Vital signs^L|||20260626T101500',
  'OBX|1|NM|8310-5^Body temperature^LN||101.3|degF|||||F',
].join('\r');

/** Local-coded feed (no LOINC) — label-based mapping must still resolve HR. */
export const ORU_VITALS_LOCAL_CODES = [
  'MSH|^~\\&|MONITOR|ICU|MEDGNOSIS|HOSP|20260626T101500||ORU^R01|MSG000125|P|2.5.1',
  'PID|1||4003^^^HOSP^MR||SAMPLE^SAM||19700505|M',
  'PV1|1|I|MED^15^A||||||||||||||||11',
  'OBR|1||OBS9003|VITALS^Vital signs^L|||20260626T101500',
  'OBX|1|NM|HR^Heart rate^L||72|beats/min|||||F',
].join('\r');

/** A non-ORU message (ADT^A01) — the ORU parser must reject this. */
export const ADT_ADMIT = [
  'MSH|^~\\&|ADT|HOSP|MEDGNOSIS|HOSP|20260626T100000||ADT^A01|MSG000200|P|2.5.1',
  'PID|1||4001^^^HOSP^MR||DOE^JANE||19550214|F',
  'PV1|1|I|ICU^04^A||||||||||||||||7',
].join('\r');
