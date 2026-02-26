const { Pool } = require('pg');
const { config } = require('../config');

const db = new Pool({
  connectionString: config.DATABASE_URL,
});

module.exports = { db };
