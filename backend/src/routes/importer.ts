import { Router, Request, Response } from 'express';
import multer from 'multer';
import * as XLSX from 'xlsx';
import { db } from '../db/client';
import { authenticate, requireRole } from '../middleware';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

router.use(authenticate, requireRole('Super_Admin', 'Department_Admin'));

type RowError = { row: number; field: string; message: string };

function parseSheet(wb: XLSX.WorkBook, sheetName: string): any[] {
  const ws = wb.Sheets[sheetName];
  if (!ws) throw new Error(`Sheet "${sheetName}" not found`);
  return XLSX.utils.sheet_to_json(ws, { defval: null });
}

// POST /api/import/rooms
router.post('/rooms', upload.single('file'), async (req: Request, res: Response) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const wb = XLSX.read(req.file.buffer, { type: 'buffer' });
  let rows: any[];
  try { rows = parseSheet(wb, 'Rooms'); } catch (e: any) { return res.status(400).json({ error: e.message }); }

  const errors: RowError[] = [];
  const valid: any[] = [];

  rows.forEach((r, i) => {
    const rowNum = i + 2;
    if (!r.room_number) errors.push({ row: rowNum, field: 'room_number', message: 'Required' });
    if (!r.room_type) errors.push({ row: rowNum, field: 'room_type', message: 'Required' });
    const cap = parseInt(r.capacity, 10);
    if (isNaN(cap) || cap <= 0) errors.push({ row: rowNum, field: 'capacity', message: 'Must be > 0' });
    if (errors.filter(e => e.row === rowNum).length === 0) valid.push(r);
  });

  if (errors.length > 0) return res.status(422).json({ errors });

  const client = await db.connect();
  try {
    await client.query('BEGIN');
    for (const r of valid) {
      await client.query(
        `INSERT INTO rooms (room_number, room_type, capacity, building, features)
         VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (room_number) DO UPDATE SET room_type=$2, capacity=$3, building=$4, features=$5`,
        [r.room_number, r.room_type, parseInt(r.capacity), r.building ?? null, r.features ?? null]
      );
    }
    await client.query('COMMIT');
    res.json({ imported: valid.length });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

// POST /api/import/faculty
router.post('/faculty', upload.single('file'), async (req: Request, res: Response) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const wb = XLSX.read(req.file.buffer, { type: 'buffer' });
  let rows: any[];
  try { rows = parseSheet(wb, 'Faculty'); } catch (e: any) { return res.status(400).json({ error: e.message }); }

  const errors: RowError[] = [];
  const valid: any[] = [];

  rows.forEach((r, i) => {
    const rowNum = i + 2;
    if (!r.full_name) errors.push({ row: rowNum, field: 'full_name', message: 'Required' });
    if (!r.email) errors.push({ row: rowNum, field: 'email', message: 'Required' });
    if (!r.department_id) errors.push({ row: rowNum, field: 'department_id', message: 'Required' });
    if (errors.filter(e => e.row === rowNum).length === 0) valid.push(r);
  });

  if (errors.length > 0) return res.status(422).json({ errors });

  const client = await db.connect();
  try {
    await client.query('BEGIN');
    for (const r of valid) {
      await client.query(
        `INSERT INTO faculty_profiles (full_name, email, department_id, max_classes_per_day)
         VALUES ($1,$2,$3,$4)
         ON CONFLICT (email) DO UPDATE SET full_name=$1, department_id=$3`,
        [r.full_name, r.email, r.department_id, r.max_classes_per_day ?? 4]
      );
    }
    await client.query('COMMIT');
    res.json({ imported: valid.length });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

// POST /api/import/subjects
router.post('/subjects', upload.single('file'), async (req: Request, res: Response) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const wb = XLSX.read(req.file.buffer, { type: 'buffer' });
  let rows: any[];
  try { rows = parseSheet(wb, 'Subjects'); } catch (e: any) { return res.status(400).json({ error: e.message }); }

  const errors: RowError[] = [];
  const valid: any[] = [];

  rows.forEach((r, i) => {
    const rowNum = i + 2;
    if (!r.name) errors.push({ row: rowNum, field: 'name', message: 'Required' });
    if (!r.code) errors.push({ row: rowNum, field: 'code', message: 'Required' });
    const wh = parseInt(r.weekly_hours, 10);
    const cpw = parseInt(r.classes_per_week, 10);
    const sd = parseInt(r.session_duration, 10);
    if (isNaN(wh) || isNaN(cpw) || isNaN(sd)) {
      errors.push({ row: rowNum, field: 'weekly_hours/classes_per_week/session_duration', message: 'Must be integers' });
    } else if (wh !== cpw * sd) {
      errors.push({ row: rowNum, field: 'weekly_hours', message: `Must equal classes_per_week × session_duration (${cpw * sd})` });
    }
    if (errors.filter(e => e.row === rowNum).length === 0) valid.push(r);
  });

  if (errors.length > 0) return res.status(422).json({ errors });

  const client = await db.connect();
  try {
    await client.query('BEGIN');
    for (const r of valid) {
      await client.query(
        `INSERT INTO subjects (name, code, subject_type, weekly_hours, classes_per_week, session_duration, department_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT (code) DO UPDATE SET name=$1, subject_type=$3, weekly_hours=$4`,
        [r.name, r.code, r.subject_type ?? 'Theory', parseInt(r.weekly_hours), parseInt(r.classes_per_week), parseInt(r.session_duration), r.department_id ?? null]
      );
    }
    await client.query('COMMIT');
    res.json({ imported: valid.length });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

// POST /api/import/batches
router.post('/batches', upload.single('file'), async (req: Request, res: Response) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const wb = XLSX.read(req.file.buffer, { type: 'buffer' });
  let rows: any[];
  try { rows = parseSheet(wb, 'Batches'); } catch (e: any) { return res.status(400).json({ error: e.message }); }

  const errors: RowError[] = [];
  const valid: any[] = [];

  rows.forEach((r, i) => {
    const rowNum = i + 2;
    if (!r.department_id) errors.push({ row: rowNum, field: 'department_id', message: 'Required' });
    if (!r.academic_year) errors.push({ row: rowNum, field: 'academic_year', message: 'Required' });
    if (!r.section_label) errors.push({ row: rowNum, field: 'section_label', message: 'Required' });
    const str = parseInt(r.student_strength, 10);
    if (isNaN(str) || str <= 0) errors.push({ row: rowNum, field: 'student_strength', message: 'Must be > 0' });
    if (errors.filter(e => e.row === rowNum).length === 0) valid.push(r);
  });

  if (errors.length > 0) return res.status(422).json({ errors });

  const client = await db.connect();
  try {
    await client.query('BEGIN');
    for (const r of valid) {
      await client.query(
        `INSERT INTO batches (department_id, academic_year, section_label, student_strength)
         VALUES ($1,$2,$3,$4)
         ON CONFLICT (department_id, academic_year, section_label) DO UPDATE SET student_strength=$4`,
        [r.department_id, r.academic_year, r.section_label, parseInt(r.student_strength)]
      );
    }
    await client.query('COMMIT');
    res.json({ imported: valid.length });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

// GET /api/import/templates/:entity — download Excel template
router.get('/templates/:entity', authenticate, (req: Request, res: Response) => {
  const entity = req.params['entity'];

  const templates: Record<string, { sheet: string; headers: string[] }> = {
    rooms: {
      sheet: 'Rooms',
      headers: ['room_number', 'room_type', 'capacity', 'building', 'features'],
    },
    faculty: {
      sheet: 'Faculty',
      headers: ['full_name', 'email', 'department_id', 'max_classes_per_day'],
    },
    subjects: {
      sheet: 'Subjects',
      headers: ['name', 'code', 'subject_type', 'weekly_hours', 'classes_per_week', 'session_duration', 'department_id'],
    },
    batches: {
      sheet: 'Batches',
      headers: ['department_id', 'academic_year', 'section_label', 'student_strength'],
    },
  };

  const tpl = templates[entity];
  if (!tpl) return res.status(404).json({ error: 'Unknown entity type' });

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([tpl.headers]);
  XLSX.utils.book_append_sheet(wb, ws, tpl.sheet);

  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Disposition', `attachment; filename="${entity}_template.xlsx"`);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.send(buf);
});

export default router;
