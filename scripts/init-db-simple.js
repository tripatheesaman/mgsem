const { Pool } = require('pg');

const adminPool = new Pool({
  host: process.env.DB_HOST || 'db',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: 'postgres', // connect to default DB to create new one
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl: false,
  connectionTimeoutMillis: 10000,
});

async function initDatabase() {
  let client;
  try {
    client = await adminPool.connect();
    const dbName = process.env.DB_NAME || 'mgsem';
    const result = await client.query(
      'SELECT 1 FROM pg_database WHERE datname = $1',
      [dbName]
    );

    if (result.rows.length === 0) {
      console.log(`Database ${dbName} does not exist. Creating...`);
      await client.query(`CREATE DATABASE "${dbName}"`);
      console.log(`Database ${dbName} created.`);
    } else {
      console.log(`Database ${dbName} already exists.`);
    }
  } catch (err) {
    console.error('Error initializing database:', err);
  } finally {
    if (client) client.release();
    await adminPool.end();
  }
}

initDatabase();
