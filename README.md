# Shaiya API Servers

This folder contains the authentication API servers for the Shaiya game integration.

## Contents

- **registration-api.js** - Handles user registration and creates PS_GameWeb entries
- **game-login-server.js** - Validates game logins and manages game accounts
- **package.json** - Dependencies and scripts for both servers
- **railway-registration.json** - Railway config for registration API
- **railway-game-login.json** - Railway config for game login server
- **.env.example** - Environment variables template

## Local Development

### 1. Install Dependencies

```bash
cd api-servers
npm install
```

### 2. Create Environment Variables

```bash
# Copy the example file
cp .env.example .env

# Edit .env with your actual credentials
```

### 3. Run Servers Locally

```bash
# Registration API (Port 30901)
npm run dev:registration

# Game Login Server (Port 30900)
npm run dev:game-login
```

### 4. Test Health Endpoints

```bash
# Test registration API
npm run test:registration

# Test game login server
npm run test:game-login
```

## Railway Deployment

### Deploy Registration API

1. Go to https://railway.app
2. Create new project from GitHub
3. Select this repository
4. Set root directory to: `api-servers`
5. Use config: `railway-registration.json`
6. Set start command: `npm run start:registration`
7. Add environment variables from `.env.example`

### Deploy Game Login Server

1. Create another Railway project
2. Select same repository
3. Set root directory to: `api-servers`
4. Use config: `railway-game-login.json`
5. Set start command: `npm run start:game-login`
6. Add environment variables from `.env.example`

## Environment Variables

Required variables for both servers:

```bash
DB_SERVER=20.0.138.200
DB_PORT=1433
DB_USER=shaiya
DB_PASSWORD=your_password
VITE_SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_key
REG_API_PORT=30901
GAME_LOGIN_PORT=30900
NODE_ENV=production
```

## API Endpoints

### Registration API (Port 30901)

- **GET** `/api/health` - Health check
- **POST** `/api/post-registration` - Create new user entry

### Game Login Server (Port 30900)

- **GET** `/health` - Health check
- **POST** `/game/login` - Validate game login

## Production Notes

- Both servers connect to SQL Server databases
- Registration API creates entries in `PS_GameWeb.users`
- Game login server creates entries in `PS_UserData.Users_Master` on first login
- Passwords are stored for game authentication
- CORS is enabled for web requests

## Troubleshooting

### Cannot connect to SQL Server

1. Check SQL Server is accepting remote connections
2. Verify firewall allows port 1433
3. Ensure TCP/IP is enabled in SQL Server Configuration Manager

### Railway deployment fails

1. Check Railway logs for errors
2. Verify all environment variables are set
3. Ensure `package.json` dependencies are correct

### Port already in use

```bash
# Windows: Find process using port
netstat -ano | findstr :30901

# Kill the process
taskkill /PID <process_id> /F
```

## Security

⚠️ **Never commit `.env` file to Git**

The `.gitignore` file prevents this, but always double-check:

```bash
git status  # Should NOT show .env file
```

## Support

For detailed deployment instructions, see:
- `/RAILWAY_SETUP.md` - Railway deployment guide
- `/AUTHENTICATION_SYSTEM.md` - Complete auth system documentation
