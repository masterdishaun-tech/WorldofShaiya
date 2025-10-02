const express = require('express');
const sql = require('mssql');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const app = express();
app.use(express.json());

// Enable CORS for frontend
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// SQL Server configuration
const sqlConfig = {
  server: process.env.DB_SERVER || '20.0.138.200',
  port: parseInt(process.env.DB_PORT || '1433'),
  user: process.env.DB_USER || 'shaiya',
  password: process.env.DB_PASSWORD || 'P_03t3cGkE+vZp#$w)P,',
  options: {
    encrypt: false,
    trustServerCertificate: true,
    enableArithAbort: true,
    connectTimeout: 30000,
    requestTimeout: 30000,
  },
};

// Initialize Supabase client
const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Registration API is running' });
});

/**
 * Post-registration endpoint
 * Called by frontend after Supabase user is created
 * Creates entries in PS_GameWeb database
 */
app.post('/api/post-registration', async (req, res) => {
  try {
    const { supabaseUserId, username, email, password } = req.body;

    console.log('🔍 Received registration request:', { 
      supabaseUserId, 
      username, 
      email, 
      passwordLength: password?.length 
    });

    if (!supabaseUserId || !username || !email || !password) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields',
      });
    }

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(supabaseUserId)) {
      console.error('❌ Invalid UUID format:', supabaseUserId);
      return res.status(400).json({
        success: false,
        error: 'Invalid user ID format',
      });
    }

    console.log(`📝 Post-registration for: ${username}`);

    // Connect to SQL Server
    console.log('🔌 Connecting to SQL Server...');
    const pool = await sql.connect(sqlConfig);
    console.log('✅ Connected to SQL Server');

    // Check if user already exists in PS_GameWeb.users
    const existingUser = await pool
      .request()
      .input('supabase_uid', sql.UniqueIdentifier, supabaseUserId)
      .query('SELECT user_id FROM PS_GameWeb.dbo.users WHERE supabase_uid = @supabase_uid');

    if (existingUser.recordset.length > 0) {
      await pool.close();
      console.log(`ℹ️ User already exists in PS_GameWeb: ${username}`);
      return res.json({
        success: true,
        message: 'User already exists',
        userId: existingUser.recordset[0].user_id,
      });
    }

    // Create user in PS_GameWeb.users
    await pool
      .request()
      .input('username', sql.NVarChar(50), username)
      .input('email', sql.NVarChar(100), email)
      .input('password_hash', sql.NVarChar(255), password)
      .input('supabase_uid', sql.UniqueIdentifier, supabaseUserId)
      .input('web_access_level', sql.Int, 1)
      .query(`
        INSERT INTO PS_GameWeb.dbo.users (username, email, password_hash, supabase_uid, web_access_level, created_at)
        VALUES (@username, @email, @password_hash, @supabase_uid, @web_access_level, GETDATE())
      `);

    // Get the newly created user_id (trigger will handle user_points and Users_Master)
    const newUser = await pool
      .request()
      .input('supabase_uid', sql.UniqueIdentifier, supabaseUserId)
      .query('SELECT user_id, game_user_uid FROM PS_GameWeb.dbo.users WHERE supabase_uid = @supabase_uid');

    const userId = newUser.recordset[0].user_id;
    const gameUserUid = newUser.recordset[0].game_user_uid;

    await pool.close();

    console.log(`✅ User created in PS_GameWeb: ${username} (user_id: ${userId}, game_user_uid: ${gameUserUid})`);
    console.log(`✅ Trigger automatically created user_points and Users_Master entries`);

    return res.json({
      success: true,
      message: 'User created successfully',
      userId: userId,
      gameUserUid: gameUserUid,
    });

  } catch (error) {
    console.error('❌ Registration error:', error);
    console.error('❌ Error details:', {
      message: error.message,
      number: error.number,
      state: error.state,
      class: error.class,
      stack: error.stack
    });
    
    // Handle duplicate username
    if (error.number === 2627 || error.number === 2601) {
      return res.status(409).json({
        success: false,
        error: 'Username already exists',
      });
    }

    // Handle SQL connection errors
    if (error.code === 'ESOCKET' || error.code === 'ETIMEOUT') {
      return res.status(503).json({
        success: false,
        error: 'Database connection failed',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined,
      });
    }

    return res.status(500).json({
      success: false,
      error: 'Failed to complete registration',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
});

// Start server
const PORT = process.env.REG_API_PORT || 30901;
app.listen(PORT, '0.0.0.0', () => {
  console.log('===========================================');
  console.log('📝 Shaiya Registration API');
  console.log('===========================================');
  console.log(`✅ Server running on port ${PORT}`);
  console.log(`🔗 SQL Server: ${sqlConfig.server}:${sqlConfig.port}`);
  console.log('===========================================');
  console.log('Ready to process registrations!');
  console.log('');
});
