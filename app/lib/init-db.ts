import { Pool } from 'pg';

export async function initializeDatabase() {
  // Connect to default postgres database to create the target database
  const adminPool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    database: 'postgres', // Connect to default postgres database
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
    ssl: false,
    connectionTimeoutMillis: 10000,
    idleTimeoutMillis: 30000,
  });

  const client = await adminPool.connect();
  
  try {
    console.log('Connecting to PostgreSQL server...');
    console.log('PostgreSQL connection established successfully');
    
    const dbName = process.env.DB_NAME || 'mgsem';
    
    // Validate database name (only alphanumeric and underscores)
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(dbName)) {
      throw new Error(`Invalid database name: ${dbName}. Database names must start with a letter or underscore and contain only alphanumeric characters and underscores.`);
    }
    
    // Check if database exists
    const dbCheck = await client.query(
      `SELECT 1 FROM pg_database WHERE datname = $1`,
      [dbName]
    );
    
    if (dbCheck.rows.length === 0) {
      console.log(`Creating database '${dbName}'...`);
      // Note: CREATE DATABASE cannot use parameterized queries, but we've validated the name
      await client.query(`CREATE DATABASE "${dbName}"`);
      console.log(`Database '${dbName}' created successfully`);
    } else {
      console.log(`Database '${dbName}' already exists`);
    }
    
    console.log('Database initialization completed. You can now import tables and data using DBeaver.');
    
  } catch (error) {
    console.error('Error initializing database:', error);
    throw error;
  } finally {
    client.release();
    await adminPool.end();
  }
}
