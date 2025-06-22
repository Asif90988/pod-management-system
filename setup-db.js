const pool = require('./db');

async function setupDatabase() {
  try {
    // Create users table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(100) UNIQUE NOT NULL,
        name VARCHAR(100) NOT NULL,
        role VARCHAR(20) DEFAULT 'developer',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    // Create CCB items table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ccb_items (
        id SERIAL PRIMARY KEY,
        ccb_id VARCHAR(50) UNIQUE NOT NULL,
        business_line VARCHAR(10) NOT NULL,
        country VARCHAR(3) NOT NULL,
        title VARCHAR(200) NOT NULL,
        description TEXT,
        status VARCHAR(20) DEFAULT 'New',
        created_by INTEGER REFERENCES users(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create PODs table
// Create PODs table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS pods (
        id SERIAL PRIMARY KEY,
        pod_id VARCHAR(50) UNIQUE NOT NULL,
        pod_name VARCHAR(200) NOT NULL,
        ccb_item_id INTEGER REFERENCES ccb_items(id),
        business_line VARCHAR(10) NOT NULL,
        country VARCHAR(3) NOT NULL,
        status VARCHAR(20) DEFAULT 'Planning',
        start_date DATE,
        end_date DATE,
        pod_lead INTEGER REFERENCES users(id),
        estimated_hours INTEGER,
        scope TEXT,
        deliverables TEXT,
        success_criteria TEXT,
        team_size INTEGER,
        sprint_duration INTEGER,
        ba_handover BOOLEAN DEFAULT false,
        reverse_walkthrough BOOLEAN DEFAULT false,
        review_day VARCHAR(20),
        required_skills JSONB,
        created_by INTEGER REFERENCES users(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    console.log('✅ PODs table created successfully!');
    
    console.log('✅ CCB items table created successfully!');
    
    console.log('✅ Users table created successfully!');
    
  } catch (error) {
    console.error('❌ Error creating table:', error);
  }
}

setupDatabase();