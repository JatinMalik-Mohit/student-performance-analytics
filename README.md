# Student Performance & Academic Analytics System (Node.js + Express + Mongoose + MongoDB)

Records marks and attendance and analyses student performance (grades, CGPA, rank, class statistics,
attendance-vs-marks correlation, at-risk detection). Sky-blue and white UI; Chart.js is bundled (no CDN).

## Run on your PC
1. Install **Node.js 18 or newer** (nodejs.org).
2. Get **MongoDB** running, either:
   - **Local:** install *MongoDB Community Server* (mongodb.com/try/download/community) and start it (on Windows it runs as a service; default address `mongodb://127.0.0.1:27017`), **or**
   - **Cloud:** create a free *MongoDB Atlas* cluster and copy its connection string.
3. Open a terminal **inside this folder** and run `npm install`.
4. *(Atlas / non-default MongoDB only)* set the connection string first:
   - Windows PowerShell: `$env:MONGO_URI="mongodb+srv://user:pass@cluster/student_analytics"`
   - Mac/Linux: `export MONGO_URI="mongodb+srv://user:pass@cluster/student_analytics"`
5. Create the demo data (**synthetic**): `npm run seed`
6. Start the server: `npm start`
7. Open **http://127.0.0.1:3000**

| Role | Username | Password |
|------|----------|----------|
| Admin (faculty) | `admin` | `admin123` |
| Student (demo)  | `DEMO2401` ... `DEMO2440` | `student123` |

Change the default passwords and set `SESSION_SECRET` before any real use.

## Tests
`npm test` runs 15 tests. The 8 API tests need MongoDB running and use a separate database
(`student_analytics_test`, override with `TEST_MONGO_URI`), which is wiped on each run; your real data is not touched.

## Files
`server.js` (connect + listen) · `app.js` (routes/API) · `models.js` (Mongoose schemas) · `analytics.js` (calculations) ·
`seed.js` · `test/` · `public/` (index.html, app.js, style.css, chart.umd.js)

## Troubleshooting
- *"Could not connect to MongoDB"*: MongoDB is not running, or `MONGO_URI` is wrong.
- Port 3000 busy: `PORT=4000 npm start` (PowerShell: `$env:PORT=4000; npm start`).
- Reset all data: `npm run seed` again (it empties the collections first).
