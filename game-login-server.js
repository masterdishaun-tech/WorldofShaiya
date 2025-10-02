const express = require('express');
const sql = require('mssql');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config(); // Loads .env from current directory

const app = express();
const PORT = process.env.GAME_LOGIN_PORT || 30900;

app.use(express.json());

// Supabase client (server-side with service role key)
const supabase = createClient(
  process.env.VITE_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || '' // Use service role key for admin access
);

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

/**
 * Game Login Endpoint
 * Validates user credentials with Supabase, then ensures SQL Server account exists
 */
app.post('/game/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        success: false,
        error: 'Username and password required',
      });
    }

    console.log(`🎮 Login attempt: ${username}`);

    // Step 1: Connect to SQL Server
    let pool;
    try {
      pool = await sql.connect(sqlConfig);
    } catch (sqlError) {
      console.error('❌ SQL Server connection failed:', sqlError.message);
      return res.status(500).json({
        success: false,
        error: 'Database connection failed',
      });
    }

    // Step 2: Get user from PS_GameWeb.users table
    const webUserResult = await pool
      .request()
      .input('username', sql.NVarChar(50), username)
      .query('SELECT user_id, username, email, password_hash, supabase_uid, game_user_uid FROM PS_GameWeb.dbo.users WHERE username = @username');

    if (webUserResult.recordset.length === 0) {
      await pool.close();
      console.log(`❌ User not found: ${username}`);
      return res.status(401).json({
        success: false,
        error: 'Invalid username or password',
      });
    }

    const webUser = webUserResult.recordset[0];
    
    // Step 3: Verify password matches
    if (webUser.password_hash !== password) {
      await pool.close();
      console.log(`❌ Invalid password for: ${username}`);
      return res.status(401).json({
        success: false,
        error: 'Invalid username or password',
      });
    }

    console.log(`✅ Password verified for: ${username}`);
    
    // Step 4: Also validate with Supabase (optional, for double verification)
    if (webUser.supabase_uid && webUser.email) {
      try {
        const authResult = await supabase.auth.signInWithPassword({
          email: webUser.email,
          password: password,
        });
        
        if (authResult.error) {
          console.log(`⚠️ Supabase auth failed but SQL password matched for: ${username}`);
        } else {
          console.log(`✅ Supabase auth also successful for: ${username}`);
        }
      } catch (authException) {
        console.log(`⚠️ Supabase auth exception for: ${username}`);
      }
    }

    // Step 5: Check if user exists in PS_UserData.Users_Master (game accounts)
    let gameUserUID;
    let isNewGameUser = false;

    const gameUserResult = await pool
      .request()
      .input('username', sql.VarChar(18), username.substring(0, 18))
      .input('supabase_uid', sql.UniqueIdentifier, webUser.supabase_uid)
      .query(`
        SELECT UserUID, UserID, Status, Admin
        FROM PS_UserData.dbo.Users_Master 
        WHERE UserID = @username OR SupabaseUID = @supabase_uid
      `);

    if (gameUserResult.recordset.length === 0) {
      // Step 6: User doesn't exist in game database - Create them with their password!
      console.log(`📝 Creating game account for: ${username}`);

      await pool
        .request()
        .input('username', sql.VarChar(18), username.substring(0, 18))
        .input('password', sql.VarChar(128), password)
        .input('email', sql.VarChar, webUser.email)
        .input('supabase_uid', sql.UniqueIdentifier, webUser.supabase_uid)
        .query(`
          INSERT INTO PS_UserData.dbo.Users_Master (
            UserID,
            Pw,
            Email,
            SupabaseUID,
            JoinDate,
            Admin,
            AdminLevel,
            UseQueue,
            Status,
            Leave,
            UserType,
            Point,
            IsNew
          )
          VALUES (
            @username,
            @password,
            @email,
            @supabase_uid,
            GETDATE(),
            0,
            0,
            0,
            0,
            0,
            'U',
            0,
            1
          )
        `);

      // Get the newly created game UserUID
      const uidResult = await pool
        .request()
        .input('supabase_uid', sql.UniqueIdentifier, webUser.supabase_uid)
        .query('SELECT UserUID FROM PS_UserData.dbo.Users_Master WHERE SupabaseUID = @supabase_uid');
      
      gameUserUID = uidResult.recordset[0].UserUID;
      isNewGameUser = true;
      console.log(`✅ Game account created: ${username} (GameUserUID: ${gameUserUID})`);
      
      // Update PS_GameWeb.users with the game_user_uid
      await pool
        .request()
        .input('user_id', sql.Int, webUser.user_id)
        .input('game_user_uid', sql.Int, gameUserUID)
        .query('UPDATE PS_GameWeb.dbo.users SET game_user_uid = @game_user_uid WHERE user_id = @user_id');
      
    } else {
      // Game user already exists - update their password in case it changed
      gameUserUID = gameUserResult.recordset[0].UserUID;
      console.log(`✅ Existing game user: ${username} (GameUserUID: ${gameUserUID})`);
      
      console.log(`🔄 Updating game password for: ${username}`);
      await pool
        .request()
        .input('password', sql.VarChar(128), password)
        .input('supabase_uid', sql.UniqueIdentifier, webUser.supabase_uid)
        .query('UPDATE PS_UserData.dbo.Users_Master SET Pw = @password WHERE SupabaseUID = @supabase_uid');
      console.log(`✅ Game password updated for: ${username}`);
    }

    // Step 7: Update last_login in PS_GameWeb.users
    await pool
      .request()
      .input('user_id', sql.Int, webUser.user_id)
      .query('UPDATE PS_GameWeb.dbo.users SET last_login = GETDATE() WHERE user_id = @user_id');

    await pool.close();

    // Step 8: Return success with user info
    return res.json({
      success: true,
      message: 'Login successful',
      user: {
        webUserId: webUser.user_id,
        gameUserUID: gameUserUID,
        username: username,
        email: webUser.email,
        isNewGameUser: isNewGameUser,
      },
    });

  } catch (error) {
    console.error('❌ Login error:', error);
    console.error('Error stack:', error.stack);
    return res.status(500).json({
      success: false,
      error: 'Server error during login',
      details: error.message,
    });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'Game login server is running' });
});

// Start server
app.listen(PORT, () => {
  console.log(`🎮 Game Login Server running on port ${PORT}`);
  console.log(`📊 SQL Server: ${sqlConfig.server}:${sqlConfig.port}`);
  console.log(`🔐 Supabase: ${process.env.VITE_SUPABASE_URL}`);
  console.log(`\n✅ Ready to authenticate game clients!`);
});
