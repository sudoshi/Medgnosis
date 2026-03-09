// =============================================================================
// Unit tests — Zod Validation Schemas (@medgnosis/shared)
// =============================================================================

import { describe, it, expect } from 'vitest';
import {
  loginRequestSchema,
  registerRequestSchema,
  changePasswordSchema,
  mfaVerifySchema,
  patientSearchSchema,
  patientCreateSchema,
  careGapUpdateSchema,
  alertAcknowledgeSchema,
  measureFilterSchema,
  placeOrderSchema,
} from '../schemas/index.js';

// ---------------------------------------------------------------------------
// loginRequestSchema
// ---------------------------------------------------------------------------

describe('loginRequestSchema', () => {
  it('accepts valid email + password', () => {
    const result = loginRequestSchema.safeParse({
      email: 'user@example.com',
      password: 'securepass1',
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing email', () => {
    const result = loginRequestSchema.safeParse({ password: 'securepass1' });
    expect(result.success).toBe(false);
  });

  it('rejects invalid email format', () => {
    const result = loginRequestSchema.safeParse({
      email: 'not-an-email',
      password: 'securepass1',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const flat = result.error.flatten().fieldErrors;
      expect(flat.email).toBeDefined();
      expect(flat.email![0]).toContain('email');
    }
  });

  it('rejects password shorter than 8 characters', () => {
    const result = loginRequestSchema.safeParse({
      email: 'user@example.com',
      password: 'short',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const flat = result.error.flatten().fieldErrors;
      expect(flat.password).toBeDefined();
    }
  });

  it('accepts password exactly 8 characters', () => {
    const result = loginRequestSchema.safeParse({
      email: 'user@example.com',
      password: '12345678',
    });
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// registerRequestSchema
// ---------------------------------------------------------------------------

describe('registerRequestSchema', () => {
  it('accepts valid registration', () => {
    const result = registerRequestSchema.safeParse({
      email: 'new@example.com',
      firstName: 'Jane',
      lastName: 'Doe',
    });
    expect(result.success).toBe(true);
  });

  it('accepts registration with optional phone', () => {
    const result = registerRequestSchema.safeParse({
      email: 'new@example.com',
      firstName: 'Jane',
      lastName: 'Doe',
      phone: '555-1234',
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty firstName', () => {
    const result = registerRequestSchema.safeParse({
      email: 'new@example.com',
      firstName: '',
      lastName: 'Doe',
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty lastName', () => {
    const result = registerRequestSchema.safeParse({
      email: 'new@example.com',
      firstName: 'Jane',
      lastName: '',
    });
    expect(result.success).toBe(false);
  });

  it('rejects firstName exceeding 100 chars', () => {
    const result = registerRequestSchema.safeParse({
      email: 'new@example.com',
      firstName: 'A'.repeat(101),
      lastName: 'Doe',
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// changePasswordSchema
// ---------------------------------------------------------------------------

describe('changePasswordSchema', () => {
  it('accepts valid password change', () => {
    const result = changePasswordSchema.safeParse({
      currentPassword: 'oldpass123',
      newPassword: 'newpass456',
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty currentPassword', () => {
    const result = changePasswordSchema.safeParse({
      currentPassword: '',
      newPassword: 'newpass456',
    });
    expect(result.success).toBe(false);
  });

  it('rejects newPassword shorter than 8 characters', () => {
    const result = changePasswordSchema.safeParse({
      currentPassword: 'oldpass123',
      newPassword: 'short',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const flat = result.error.flatten().fieldErrors;
      expect(flat.newPassword).toBeDefined();
    }
  });
});

// ---------------------------------------------------------------------------
// mfaVerifySchema
// ---------------------------------------------------------------------------

describe('mfaVerifySchema', () => {
  it('accepts valid 6-digit code with UUID', () => {
    const result = mfaVerifySchema.safeParse({
      code: '123456',
      factor_id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    });
    expect(result.success).toBe(true);
  });

  it('rejects code with wrong length', () => {
    const result = mfaVerifySchema.safeParse({
      code: '12345',
      factor_id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid UUID for factor_id', () => {
    const result = mfaVerifySchema.safeParse({
      code: '123456',
      factor_id: 'not-a-uuid',
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// patientSearchSchema
// ---------------------------------------------------------------------------

describe('patientSearchSchema', () => {
  it('provides defaults when no params given', () => {
    const result = patientSearchSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(1);
      expect(result.data.per_page).toBe(25);
      expect(result.data.sort_by).toBe('name');
      expect(result.data.sort_order).toBe('asc');
    }
  });

  it('coerces string page to number', () => {
    const result = patientSearchSchema.safeParse({ page: '3' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(3);
    }
  });

  it('rejects per_page above 100', () => {
    const result = patientSearchSchema.safeParse({ per_page: '200' });
    expect(result.success).toBe(false);
  });

  it('rejects invalid sort_by', () => {
    const result = patientSearchSchema.safeParse({ sort_by: 'invalid' });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// patientCreateSchema
// ---------------------------------------------------------------------------

describe('patientCreateSchema', () => {
  const validPatient = {
    first_name: 'John',
    last_name: 'Smith',
    mrn: 'MRN-001',
    date_of_birth: '1990-05-15',
    gender: 'male',
  };

  it('accepts valid patient data', () => {
    const result = patientCreateSchema.safeParse(validPatient);
    expect(result.success).toBe(true);
  });

  it('accepts with optional email and phone', () => {
    const result = patientCreateSchema.safeParse({
      ...validPatient,
      email: 'john@example.com',
      phone: '555-0100',
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid date_of_birth format', () => {
    const result = patientCreateSchema.safeParse({
      ...validPatient,
      date_of_birth: '15/05/1990',
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing mrn', () => {
    const { mrn: _, ...noMrn } = validPatient;
    const result = patientCreateSchema.safeParse(noMrn);
    expect(result.success).toBe(false);
  });

  it('rejects empty first_name', () => {
    const result = patientCreateSchema.safeParse({ ...validPatient, first_name: '' });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// careGapUpdateSchema
// ---------------------------------------------------------------------------

describe('careGapUpdateSchema', () => {
  it('accepts valid status update', () => {
    const result = careGapUpdateSchema.safeParse({ status: 'closed', notes: 'Resolved' });
    expect(result.success).toBe(true);
  });

  it('accepts status without notes', () => {
    const result = careGapUpdateSchema.safeParse({ status: 'open' });
    expect(result.success).toBe(true);
  });

  it('rejects invalid status value', () => {
    const result = careGapUpdateSchema.safeParse({ status: 'invalid_status' });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// alertAcknowledgeSchema
// ---------------------------------------------------------------------------

describe('alertAcknowledgeSchema', () => {
  it('accepts valid UUID alert_id', () => {
    const result = alertAcknowledgeSchema.safeParse({
      alert_id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    });
    expect(result.success).toBe(true);
  });

  it('rejects non-UUID alert_id', () => {
    const result = alertAcknowledgeSchema.safeParse({ alert_id: '12345' });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// measureFilterSchema
// ---------------------------------------------------------------------------

describe('measureFilterSchema', () => {
  it('accepts empty filter (all optional)', () => {
    const result = measureFilterSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('accepts valid domain + type', () => {
    const result = measureFilterSchema.safeParse({
      domain: 'preventive',
      type: 'process',
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid domain', () => {
    const result = measureFilterSchema.safeParse({ domain: 'nonexistent' });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// placeOrderSchema
// ---------------------------------------------------------------------------

describe('placeOrderSchema', () => {
  it('accepts valid order', () => {
    const result = placeOrderSchema.safeParse({
      patient_id: 1,
      care_gap_id: 5,
      order_set_item_id: 10,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.priority).toBe('routine'); // default
    }
  });

  it('accepts explicit priority', () => {
    const result = placeOrderSchema.safeParse({
      patient_id: 1,
      care_gap_id: 5,
      order_set_item_id: 10,
      priority: 'stat',
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing required fields', () => {
    const result = placeOrderSchema.safeParse({ patient_id: 1 });
    expect(result.success).toBe(false);
  });

  it('rejects non-positive patient_id', () => {
    const result = placeOrderSchema.safeParse({
      patient_id: 0,
      care_gap_id: 5,
      order_set_item_id: 10,
    });
    expect(result.success).toBe(false);
  });
});
