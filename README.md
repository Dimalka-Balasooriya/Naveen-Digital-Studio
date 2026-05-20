# Naveen Digital Studio Management System

Single-link full-stack app for Naveen Digital Studio.

This project is now prepared for **Vercel-only hosting**:

- `client/` contains the Vite React frontend.
- `server/` contains the existing Express app logic.
- `api/[...path].js` exposes the Express routes as Vercel Serverless API routes.
- `database/` contains MySQL schema, seed data, and migrations.

The final hosted app can run from one URL such as:

```text
https://naveen-digital-studio.vercel.app
```

## How It Works on Vercel

Frontend pages are served by Vercel from `client/dist`.

Backend APIs are served from the same domain under `/api`:

```text
/api/auth/login
/api/orders
/api/customers/search
/api/employees
/api/commissions
/api/reports
/api/production
/api/analytics
```

The frontend uses relative API URLs by default, so it can call the backend from the same Vercel link.

## Project Structure

```text
api/           Vercel Serverless API entrypoint
client/        Vite React frontend
server/        Express routes, middleware, database logic
database/      MySQL schema, sample data, migrations
vercel.json    Vercel build/output/function config
```

## Environment Variables

Set these in **Vercel Project Settings > Environment Variables**:

```env
DB_HOST=your_railway_mysql_host
DB_PORT=3306
DB_USER=your_railway_mysql_user
DB_PASSWORD=your_railway_mysql_password
DB_NAME=your_railway_mysql_database
JWT_SECRET=replace-with-a-long-random-secret
JWT_EXPIRES_IN=7d
DB_CONNECTION_LIMIT=3
```

`VITE_API_URL` is not required on Vercel because the frontend uses `/api` by default.

For local development, you can use:

```env
VITE_API_URL=http://localhost:5000/api
```

inside `client/.env` when running the frontend and backend separately.

## Railway MySQL Setup

1. Create a Railway project.
2. Add a MySQL database service.
3. Open the MySQL service variables.
4. Copy Railway values into Vercel:

```env
DB_HOST=<MYSQLHOST>
DB_PORT=<MYSQLPORT>
DB_USER=<MYSQLUSER>
DB_PASSWORD=<MYSQLPASSWORD>
DB_NAME=<MYSQLDATABASE>
```

5. Import schema and sample data into Railway MySQL:

```bash
mysql -h <MYSQLHOST> -P <MYSQLPORT> -u <MYSQLUSER> -p <MYSQLDATABASE> < database/schema.sql
mysql -h <MYSQLHOST> -P <MYSQLPORT> -u <MYSQLUSER> -p <MYSQLDATABASE> < database/sample-data.sql
```

For an existing database, run migrations as needed:

```bash
mysql -h <MYSQLHOST> -P <MYSQLPORT> -u <MYSQLUSER> -p <MYSQLDATABASE> < database/advanced-migration.sql
mysql -h <MYSQLHOST> -P <MYSQLPORT> -u <MYSQLUSER> -p <MYSQLDATABASE> < database/order-quantity-migration.sql
mysql -h <MYSQLHOST> -P <MYSQLPORT> -u <MYSQLUSER> -p <MYSQLDATABASE> < database/admin-role-assignment-report-migration.sql
```

## Deploy to Vercel from GitHub

1. Push this project to GitHub.
2. Open Vercel and click **Add New Project**.
3. Import the GitHub repository.
4. Use the project root, not `client/`, as the Vercel root.
5. Vercel will use `vercel.json`.
6. Confirm these settings:
   - Build Command: `npm run vercel-build`
   - Output Directory: `client/dist`
7. Add the database/JWT environment variables listed above.
8. Deploy.

After deploy, test:

```text
https://your-vercel-app.vercel.app/api/health
```

Then open:

```text
https://your-vercel-app.vercel.app
```

## Local Development

1. Copy env examples:

```bash
cp server/.env.example server/.env
cp client/.env.example client/.env
```

2. For local frontend-to-backend development, set `client/.env`:

```env
VITE_API_URL=http://localhost:5000/api
```

3. Install dependencies:

```bash
npm run install:all
npm install
```

4. Run local frontend and backend:

```bash
npm run dev
```

Frontend:

```text
http://localhost:5173
```

Backend:

```text
http://localhost:5000/api/health
```

## Build Check

Run:

```bash
npm run build
```

For Vercel build:

```bash
npm run vercel-build
```

## Demo Accounts

After importing `database/sample-data.sql`:

- Owner: `admin@naveendigitalstudio.com` / `password123`
- Production: `kasun@naveendigitalstudio.com` / `password123`
- Production: `amali@naveendigitalstudio.com` / `password123`

Change all demo passwords before real shop use.

## Notes

- No Render deployment is required.
- All backend routes are available under `/api` on the same Vercel domain.
- MySQL credentials are stored only in Vercel environment variables.
- `mysql2/promise` is used for database access.
- The MySQL pool is configured with a low connection limit for serverless use.
- Reports PDF/Excel APIs are also served from Vercel Serverless Functions.
