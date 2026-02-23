import { db } from './client';
import bcrypt from 'bcrypt';

const BCRYPT_COST = 12;

async function seed() {
  const client = await db.connect();

  try {
    await client.query('BEGIN');

    // ── Departments ──────────────────────────────────────────────────────────
    console.log('Seeding departments...');
    await client.query(`
      INSERT INTO departments (name, code) VALUES
        ('Computer Science & Engineering',       'CSE'),
        ('AI & Machine Learning',                'AIML'),
        ('Electronics & Communication',          'ECE'),
        ('Mechanical Engineering',               'MECH'),
        ('Master of Business Administration',    'MBA')
      ON CONFLICT (code) DO NOTHING
    `);

    // ── Academic Term ─────────────────────────────────────────────────────────
    console.log('Seeding academic term...');
    await client.query(`
      INSERT INTO academic_terms (label, start_date, end_date, is_active) VALUES
        ('2026_Sem1', '2026-07-01', '2026-11-30', true)
      ON CONFLICT (label) DO NOTHING
    `);

    // ── Timeslots ─────────────────────────────────────────────────────────────
    console.log('Seeding timeslots...');

    // Insert all timeslots except the lab-block link first
    await client.query(`
      INSERT INTO timeslots (label, start_time, end_time, shift, is_break, is_lab_block_start) VALUES
        ('P1',     '09:00', '10:00', 'Morning', false, false),
        ('P2',     '10:00', '11:00', 'Morning', false, false),
        ('Break',  '11:00', '11:15', 'Morning', true,  false),
        ('P3',     '11:15', '12:15', 'Morning', false, false),
        ('P4',     '12:15', '13:15', 'Morning', false, false),
        ('Lunch',  '13:15', '14:00', 'Morning', true,  false),
        ('P5',     '14:00', '15:00', 'Evening', false, false),
        ('P6',     '15:00', '16:00', 'Evening', false, false),
        ('P7',     '16:00', '17:00', 'Evening', false, false)
      ON CONFLICT DO NOTHING
    `);

    // Link P5 → P6 as a lab block (two-step: fetch IDs then UPDATE)
    const p5Row = await client.query(`SELECT id FROM timeslots WHERE label = 'P5'`);
    const p6Row = await client.query(`SELECT id FROM timeslots WHERE label = 'P6'`);

    if (p5Row.rows.length && p6Row.rows.length) {
      const p5Id = p5Row.rows[0].id as string;
      const p6Id = p6Row.rows[0].id as string;
      await client.query(
        `UPDATE timeslots SET is_lab_block_start = true, lab_block_partner_id = $1 WHERE id = $2`,
        [p6Id, p5Id],
      );
      console.log(`  Lab block linked: P5 (${p5Id}) → P6 (${p6Id})`);
    }

    // ── Rooms ─────────────────────────────────────────────────────────────────
    console.log('Seeding rooms...');
    const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
    await client.query(`
      INSERT INTO rooms (room_number, room_type, capacity, building, available_days) VALUES
        ('R101', 'Classroom',    60,  'Block A', $1),
        ('R102', 'Classroom',    60,  'Block A', $1),
        ('L101', 'Lab',          30,  'Block B', $1),
        ('L102', 'Lab',          30,  'Block B', $1),
        ('S101', 'Seminar_Hall', 120, 'Block C', $1),
        ('R201', 'Classroom',    60,  'Block A', $1)
      ON CONFLICT DO NOTHING
    `, [weekdays]);

    // ── Users ─────────────────────────────────────────────────────────────────
    console.log('Hashing passwords (bcrypt cost 12)...');
    const adminHash   = await bcrypt.hash('Admin@123',   BCRYPT_COST);
    const facultyHash = await bcrypt.hash('Faculty@123', BCRYPT_COST);

    console.log('Seeding users...');

    // Super_Admin — no department
    await client.query(`
      INSERT INTO users (email, password_hash, role)
      VALUES ($1, $2, 'Super_Admin')
      ON CONFLICT (email) DO NOTHING
    `, ['super@college.edu', adminHash]);

    // Department_Admin — CSE
    const cseRow = await client.query(`SELECT id FROM departments WHERE code = 'CSE'`);
    const cseId  = cseRow.rows[0]?.id as string;

    await client.query(`
      INSERT INTO users (email, password_hash, role, department_id)
      VALUES ($1, $2, 'Department_Admin', $3)
      ON CONFLICT (email) DO NOTHING
    `, ['admin.cse@college.edu', adminHash, cseId]);

    // Faculty — CSE
    await client.query(`
      INSERT INTO users (email, password_hash, role, department_id)
      VALUES ($1, $2, 'Faculty', $3)
      ON CONFLICT (email) DO NOTHING
    `, ['faculty1@college.edu', facultyHash, cseId]);

    await client.query('COMMIT');
    console.log('✅ Seed completed successfully.');
    process.exit(0);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Seed failed, transaction rolled back:', err);
    process.exit(1);
  } finally {
    client.release();
  }
}

seed();
