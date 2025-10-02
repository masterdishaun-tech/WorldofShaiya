const express = require('express');
const sql = require('mssql');
require('dotenv').config();

const app = express();
app.use(express.json());

// Enable CORS for frontend
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
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

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Server Status API is running' });
});

/**
 * Get overall server status
 */
app.get('/api/server/status', async (req, res) => {
  try {
    const pool = await sql.connect(sqlConfig);

    // Check if server is online by attempting to query
    const isOnline = true; // If we got here, server is online

    // Get total players online (from PS_UserData.Users_Master where Status indicates online)
    const playersResult = await pool
      .request()
      .query('SELECT COUNT(*) as count FROM PS_UserData.dbo.Users_Master WHERE Status = 1');
    
    const playersOnline = playersResult.recordset[0].count;

    // Get total characters
    const charsResult = await pool
      .request()
      .query('SELECT COUNT(*) as count FROM PS_GameData.dbo.Chars WHERE Del = 0');
    
    const totalCharacters = charsResult.recordset[0].count;

    // Get total guilds
    const guildsResult = await pool
      .request()
      .query('SELECT COUNT(*) as count FROM PS_GameData.dbo.Guilds');
    
    const totalGuilds = guildsResult.recordset[0].count;

    await pool.close();

    res.json({
      success: true,
      data: {
        serverStatus: isOnline ? 'ONLINE' : 'OFFLINE',
        playersOnline: playersOnline,
        totalCharacters: totalCharacters,
        totalGuilds: totalGuilds,
        lastUpdate: new Date().toISOString(),
      },
    });

  } catch (error) {
    console.error('❌ Server status error:', error);
    res.json({
      success: true,
      data: {
        serverStatus: 'OFFLINE',
        playersOnline: 0,
        totalCharacters: 0,
        totalGuilds: 0,
        lastUpdate: new Date().toISOString(),
      },
    });
  }
});

/**
 * Get GRB (God Realm Battle) status
 */
app.get('/api/server/grb', async (req, res) => {
  try {
    const pool = await sql.connect(sqlConfig);

    // Get GRB status from WorldInfo
    const grbResult = await pool
      .request()
      .query('SELECT TOP 1 * FROM PS_GameData.dbo.WorldInfo ORDER BY RowID DESC');

    if (grbResult.recordset.length > 0) {
      const worldInfo = grbResult.recordset[0];
      
      // Calculate time since last world time
      const lastWorldTime = worldInfo.LastWorldTime;
      const currentTime = Math.floor(Date.now() / 1000);
      const timeDiff = currentTime - lastWorldTime;
      
      // GRB typically runs every X hours - adjust based on your server settings
      const grbInterval = 6 * 60 * 60; // 6 hours in seconds
      const nextGrbTime = lastWorldTime + grbInterval;
      const timeUntilGrb = Math.max(0, nextGrbTime - currentTime);
      
      // Format time remaining
      const hours = Math.floor(timeUntilGrb / 3600);
      const minutes = Math.floor((timeUntilGrb % 3600) / 60);

      await pool.close();

      res.json({
        success: true,
        data: {
          status: timeUntilGrb > 0 ? 'Scheduled' : 'Active',
          timeRemaining: `${hours}h ${minutes}m`,
          timeRemainingSeconds: timeUntilGrb,
          lightGodBlessing: worldInfo.GodBless_Light || 0,
          darkGodBlessing: worldInfo.GodBless_Dark || 0,
          lastUpdate: new Date().toISOString(),
        },
      });
    } else {
      await pool.close();
      res.json({
        success: true,
        data: {
          status: 'Unknown',
          timeRemaining: 'N/A',
          timeRemainingSeconds: 0,
          lightGodBlessing: 0,
          darkGodBlessing: 0,
          lastUpdate: new Date().toISOString(),
        },
      });
    }

  } catch (error) {
    console.error('❌ GRB status error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch GRB status',
    });
  }
});

/**
 * Get user's characters
 */
app.get('/api/user/:userUID/characters', async (req, res) => {
  try {
    const { userUID } = req.params;

    if (!userUID) {
      return res.status(400).json({
        success: false,
        error: 'UserUID is required',
      });
    }

    const pool = await sql.connect(sqlConfig);

    // Get user's characters
    const charsResult = await pool
      .request()
      .input('userUID', sql.Int, parseInt(userUID))
      .query(`
        SELECT 
          CharID,
          CharName,
          Level,
          Job,
          Family,
          Grow,
          Money,
          Map,
          Del,
          Slot
        FROM PS_GameData.dbo.Chars
        WHERE UserUID = @userUID AND Del = 0
        ORDER BY Slot
      `);

    await pool.close();

    // Map job and family to readable names
    const jobNames = {
      0: 'Fighter', 1: 'Defender', 2: 'Ranger', 3: 'Archer',
      4: 'Mage', 5: 'Priest', 6: 'Assassin', 7: 'Warrior'
    };

    const factionNames = {
      0: 'Human', 1: 'Elf', 2: 'Vail', 3: 'Nordein'
    };

    const characters = charsResult.recordset.map(char => ({
      id: char.CharID,
      name: char.CharName,
      level: char.Level,
      job: jobNames[char.Job] || 'Unknown',
      faction: factionNames[char.Family] || 'Unknown',
      gold: char.Money,
      map: char.Map,
      slot: char.Slot,
    }));

    res.json({
      success: true,
      data: {
        characters: characters,
        count: characters.length,
      },
    });

  } catch (error) {
    console.error('❌ Characters fetch error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch characters',
    });
  }
});

/**
 * Get rankings/leaderboard
 */
app.get('/api/rankings/:type', async (req, res) => {
  try {
    const { type } = req.params;
    const limit = parseInt(req.query.limit) || 10;

    const pool = await sql.connect(sqlConfig);

    let query = '';
    
    switch (type) {
      case 'level':
        query = `
          SELECT TOP ${limit}
            CharName,
            Level,
            Job,
            Family
          FROM PS_GameData.dbo.Chars
          WHERE Del = 0
          ORDER BY Level DESC, CharID ASC
        `;
        break;
      
      case 'kills':
        query = `
          SELECT TOP ${limit}
            CharName,
            Level,
            Kills,
            Deaths
          FROM PS_GameData.dbo.Chars
          WHERE Del = 0
          ORDER BY Kills DESC, CharID ASC
        `;
        break;
        
      default:
        query = `
          SELECT TOP ${limit}
            CharName,
            Level,
            Job
          FROM PS_GameData.dbo.Chars
          WHERE Del = 0
          ORDER BY Level DESC
        `;
    }

    const result = await pool.request().query(query);
    await pool.close();

    res.json({
      success: true,
      data: result.recordset,
    });

  } catch (error) {
    console.error('❌ Rankings fetch error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch rankings',
    });
  }
});

/**
 * Get guild rankings
 */
app.get('/api/rankings/guilds', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const pool = await sql.connect(sqlConfig);

    const result = await pool
      .request()
      .query(`
        SELECT TOP ${limit}
          g.GuildName,
          g.Rank,
          COUNT(gc.CharID) as MemberCount
        FROM PS_GameData.dbo.Guilds g
        LEFT JOIN PS_GameData.dbo.GuildChars gc ON g.GuildID = gc.GuildID
        GROUP BY g.GuildName, g.Rank
        ORDER BY g.Rank DESC
      `);

    await pool.close();

    res.json({
      success: true,
      data: result.recordset,
    });

  } catch (error) {
    console.error('❌ Guild rankings fetch error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch guild rankings',
    });
  }
});

// Start server
const PORT = process.env.SERVER_STATUS_PORT || 30902;
app.listen(PORT, '0.0.0.0', () => {
  console.log('===========================================');
  console.log('📊 Shaiya Server Status API');
  console.log('===========================================');
  console.log(`✅ Server running on port ${PORT}`);
  console.log(`🔗 SQL Server: ${sqlConfig.server}:${sqlConfig.port}`);
  console.log('===========================================');
  console.log('Endpoints:');
  console.log('  GET  /api/health');
  console.log('  GET  /api/server/status');
  console.log('  GET  /api/server/grb');
  console.log('  GET  /api/user/:userUID/characters');
  console.log('  GET  /api/rankings/:type');
  console.log('  GET  /api/rankings/guilds');
  console.log('===========================================');
  console.log('Ready to serve data!');
  console.log('');
});
