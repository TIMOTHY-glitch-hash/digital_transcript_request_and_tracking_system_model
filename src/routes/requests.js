import { Router } from 'express';
import { supabase } from '../db/client.js';

const router = Router();
const TABLE = 'transcript_requests';

const TYPES = ['official', 'unofficial'];
const DELIVERY = ['pickup', 'email'];
const STUDENT_STATUS = ['finalist', 'continuing'];
const CHECKS = ['identityVerified', 'feesCleared', 'eligible'];
const FLOW = {
  submitted: ['under_review'],
  under_review: ['approved', 'rejected'],
  approved: ['issued'],
  rejected: [],
  issued: [],
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ---------- helpers ----------
const fail = (res, status, code, message, details) =>
  res.status(status).json({ success: false, error: { code, message, ...(details && { details }) } });

// lets async route handlers send errors to the global error handler
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// returns data or throws the Supabase error
const unwrap = ({ data, error }) => {
  if (error) throw error;
  return data;
};

// database row (snake_case) -> API response (camelCase)
const toApi = (r) => ({
  id: r.id,
  studentNumber: r.student_number,
  fullName: r.full_name,
  email: r.email,
  program: r.program,
  studentStatus: r.student_status,
  type: r.type,
  copies: r.copies,
  deliveryMethod: r.delivery_method,
  status: r.status,
  history: r.history,
  createdAt: r.created_at,
});

async function findById(id) {
  if (!UUID.test(id)) return null; // not a valid id, so it cannot exist
  return unwrap(await supabase.from(TABLE).select('*').eq('id', id).maybeSingle());
}

function validateCreate(b) {
  const errors = [];
  if (!/^[A-Za-z0-9\/-]{5,20}$/.test(b.studentNumber ?? '')) errors.push('studentNumber must be 5-20 chars (letters, digits, / or -)');
  if (typeof b.fullName !== 'string' || b.fullName.trim().length < 3) errors.push('fullName must be at least 3 characters');
  if (!/^\S+@\S+\.\S+$/.test(b.email ?? '')) errors.push('email is invalid');
  if (typeof b.program !== 'string' || !b.program.trim()) errors.push('program is required');
  if (!STUDENT_STATUS.includes(b.studentStatus)) errors.push(`studentStatus must be one of: ${STUDENT_STATUS.join(', ')}`);
  if (!TYPES.includes(b.type)) errors.push(`type must be one of: ${TYPES.join(', ')}`);
  if (!Number.isInteger(b.copies) || b.copies < 1 || b.copies > 5) errors.push('copies must be an integer between 1 and 5');
  if (!DELIVERY.includes(b.deliveryMethod)) errors.push(`deliveryMethod must be one of: ${DELIVERY.join(', ')}`);
  return errors;
}

// ---------- CREATE ----------
router.post('/', wrap(async (req, res) => {
  const b = req.body ?? {};
  const errors = validateCreate(b);
  if (errors.length) return fail(res, 400, 'VALIDATION_ERROR', 'Invalid request data', errors);

  // Business rule: official transcripts are for finalists only
  if (b.type === 'official' && b.studentStatus !== 'finalist')
    return fail(res, 422, 'NOT_ELIGIBLE', 'Official transcripts are only available to finalists. Continuing students can request an unofficial (provisional) transcript.');

  // Duplicate check: one open request per student per type
  const open = unwrap(
    await supabase.from(TABLE).select('id')
      .eq('student_number', b.studentNumber).eq('type', b.type)
      .not('status', 'in', '(rejected,issued)').limit(1)
  );
  if (open.length) return fail(res, 409, 'DUPLICATE_REQUEST', 'An open request of this type already exists for this student');

  const now = new Date().toISOString();
  const { data, error } = await supabase.from(TABLE).insert({
    student_number: b.studentNumber,
    full_name: b.fullName.trim(),
    email: b.email,
    program: b.program.trim(),
    student_status: b.studentStatus,
    type: b.type,
    copies: b.copies,
    delivery_method: b.deliveryMethod,
    status: 'submitted',
    history: [{ status: 'submitted', at: now, note: 'Request created' }],
  }).select().single();

  // the unique index in the database also blocks duplicates (covers race conditions)
  if (error?.code === '23505') return fail(res, 409, 'DUPLICATE_REQUEST', 'An open request of this type already exists for this student');
  if (error) throw error;

  res.status(201).json({ success: true, data: toApi(data) });
}));

// ---------- LIST (filter by ?status=&studentNumber=) ----------
router.get('/', wrap(async (req, res) => {
  const { status, studentNumber } = req.query;
  let q = supabase.from(TABLE).select('*').order('created_at', { ascending: false });
  if (status) q = q.eq('status', status);
  if (studentNumber) q = q.eq('student_number', studentNumber);
  const rows = unwrap(await q);
  res.json({ success: true, count: rows.length, data: rows.map(toApi) });
}));

// ---------- GET ONE ----------
router.get('/:id', wrap(async (req, res) => {
  const row = await findById(req.params.id);
  if (!row) return fail(res, 404, 'NOT_FOUND', 'Transcript request not found');
  res.json({ success: true, data: toApi(row) });
}));

// ---------- UPDATE STATUS (registrar) ----------
router.patch('/:id/status', wrap(async (req, res) => {
  const row = await findById(req.params.id);
  if (!row) return fail(res, 404, 'NOT_FOUND', 'Transcript request not found');

  const { status, note, checks } = req.body ?? {};
  if (!Object.keys(FLOW).includes(status)) return fail(res, 400, 'VALIDATION_ERROR', `status must be one of: ${Object.keys(FLOW).join(', ')}`);
  if (!FLOW[row.status].includes(status)) return fail(res, 422, 'INVALID_TRANSITION', `Cannot move from '${row.status}' to '${status}'`);
  if (status === 'rejected' && !note) return fail(res, 400, 'VALIDATION_ERROR', 'A note is required when rejecting');

  // Approval criteria: all three checks must be explicitly true
  if (status === 'approved') {
    const failed = CHECKS.filter((c) => checks?.[c] !== true);
    if (failed.length)
      return fail(res, 422, 'APPROVAL_CRITERIA_NOT_MET', 'All approval checks must be confirmed before approving', failed.map((c) => `${c} must be true`));
  }

  const entry = { status, at: new Date().toISOString(), note: note ?? '', ...(status === 'approved' && { checks }) };

  // only update if the status is still what we read (stops two registrars clashing)
  const updated = unwrap(
    await supabase.from(TABLE)
      .update({ status, history: [...row.history, entry] })
      .eq('id', row.id).eq('status', row.status)
      .select().maybeSingle()
  );
  if (!updated) return fail(res, 409, 'CONFLICT', 'This request was changed by someone else. Refresh and try again.');

  res.json({ success: true, data: toApi(updated) });
}));

// ---------- CANCEL (only while submitted) ----------
router.delete('/:id', wrap(async (req, res) => {
  const row = await findById(req.params.id);
  if (!row) return fail(res, 404, 'NOT_FOUND', 'Transcript request not found');
  if (row.status !== 'submitted') return fail(res, 422, 'NOT_CANCELLABLE', 'Only submitted requests can be cancelled');

  unwrap(await supabase.from(TABLE).delete().eq('id', row.id).eq('status', 'submitted'));
  res.status(204).send();
}));

export default router;
