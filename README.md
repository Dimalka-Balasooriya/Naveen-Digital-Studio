# Naveen Digital Studio Management System

Full-stack Order and Production Management System for Naveen Digital Studio.

## Stack

- Frontend: React, Vite, Tailwind CSS
- Backend: Node.js, Express
- Database: MySQL, Railway MySQL compatible
- Auth: JWT
- Hosting: Vercel for `client/`, Render for `server/`

## Project Structure

```text
client/        Vercel frontend
server/        Render backend API
database/      MySQL schema, seed data, migrations
render.yaml    Render blueprint
```

## Environment Variables

### Client: `client/.env`

```env
VITE_API_URL=http://localhost:5000/api
```

For Vercel, set it to your Render backend:

```env
VITE_API_URL=https://your-render-service.onrender.com/api
```

### Server: `server/.env`

```env
NODE_ENV=development
PORT=5000
CLIENT_URL=http://localhost:5173

DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_mysql_password
DB_NAME=naveen_digital_studio

JWT_SECRET=replace-with-a-long-random-secret
JWT_EXPIRES_IN=7d
```

For Render, set `CLIENT_URL` to your Vercel URL:

```env
CLIENT_URL=https://your-vercel-app.vercel.app
```

Multiple frontend origins are supported with commas:

```env
CLIENT_URL=https://your-vercel-app.vercel.app,https://www.yourdomain.com
```

## Local Setup

1. Create the database:

```sql
CREATE DATABASE naveen_digital_studio CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

2. Import schema and sample data:

```bash
mysql -u root -p naveen_digital_studio < database/schema.sql
mysql -u root -p naveen_digital_studio < database/sample-data.sql
```

3. Copy env files:

```bash
cp server/.env.example server/.env
cp client/.env.example client/.env
```

4. Edit `server/.env` and `client/.env`.

5. Install dependencies:

```bash
npm run install:all
```

6. Run locally:

```bash
npm run dev
```

## Demo Accounts

After importing sample data:

- Owner: `admin@naveendigitalstudio.com` / `password123`
- Production: `kasun@naveendigitalstudio.com` / `password123`
- Production: `amali@naveendigitalstudio.com` / `password123`

Change all demo passwords before real shop use.

## Railway MySQL Setup

1. Create a Railway project.
2. Add a MySQL database service.
3. Open the MySQL service variables.
4. Copy these values into Render backend environment variables:

```env
DB_HOST=<Railway MYSQLHOST>
DB_PORT=<Railway MYSQLPORT>
DB_USER=<Railway MYSQLUSER>
DB_PASSWORD=<Railway MYSQLPASSWORD>
DB_NAME=<Railway MYSQLDATABASE>
```

5. Import SQL into Railway MySQL using Railway's connection details:

```bash
mysql -h <MYSQLHOST> -P <MYSQLPORT> -u <MYSQLUSER> -p <MYSQLDATABASE> < database/schema.sql
mysql -h <MYSQLHOST> -P <MYSQLPORT> -u <MYSQLUSER> -p <MYSQLDATABASE> < database/sample-data.sql
```

If you are updating an existing database, run migrations as needed:

```bash
mysql -h <MYSQLHOST> -P <MYSQLPORT> -u <MYSQLUSER> -p <MYSQLDATABASE> < database/advanced-migration.sql
mysql -h <MYSQLHOST> -P <MYSQLPORT> -u <MYSQLUSER> -p <MYSQLDATABASE> < database/order-quantity-migration.sql
mysql -h <MYSQLHOST> -P <MYSQLPORT> -u <MYSQLUSER> -p <MYSQLDATABASE> < database/admin-role-assignment-report-migration.sql
```

## Deploy Backend to Render

1. Push this project to GitHub.
2. In Render, create a new **Web Service**.
3. Connect the GitHub repo.
4. Set:
   - Root Directory: `server`
   - Build Command: `npm install`
   - Start Command: `npm start`
5. Add environment variables:

```env
NODE_ENV=production
PORT=10000
CLIENT_URL=https://your-vercel-app.vercel.app
DB_HOST=<Railway MYSQLHOST>
DB_PORT=<Railway MYSQLPORT>
DB_USER=<Railway MYSQLUSER>
DB_PASSWORD=<Railway MYSQLPASSWORD>
DB_NAME=<Railway MYSQLDATABASE>
JWT_SECRET=<long-random-secret>
JWT_EXPIRES_IN=7d
```

6. Deploy and copy the Render service URL.
7. Test:

```text
https://your-render-service.onrender.com/api/health
```

The included `render.yaml` can also be used as a Render blueprint.

## Deploy Frontend to Vercel

1. In Vercel, import the same GitHub repo.
2. Set:
   - Root Directory: `client`
   - Framework Preset: Vite
   - Build Command: `npm run build`
   - Output Directory: `dist`
3. Add environment variable:

```env
VITE_API_URL=https://your-render-service.onrender.com/api
```

4. Deploy.
5. Copy the Vercel URL and add it to Render's backend `CLIENT_URL`.
6. Redeploy the Render backend after updating `CLIENT_URL`.

## Production Notes

- Do not commit real `.env` files.
- Use a strong `JWT_SECRET`.
- Change demo account passwords.
- Keep `CLIENT_URL` set to the exact Vercel domain to allow CORS.
- Keep `VITE_API_URL` set to the Render API URL ending in `/api`.
- Railway MySQL credentials must be added to Render, not Vercel.

## Useful Scripts

Root:

```bash
npm run install:all
npm run dev
npm run build
```

Client:

```bash
npm run dev
npm run build
npm run preview
```

Server:

```bash
npm run dev
npm run build
npm start
```
