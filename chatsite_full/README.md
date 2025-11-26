# ChatSite - Full scaffold (MongoDB integrated)

## What is included
- `server/` — Node.js + Express + Socket.IO server with MongoDB (Mongoose) integration
- `public/` — Static frontend: index.html, rooms.html, room.html, styles.css
- `.env.example` in server/
- Simple Message model: `server/models/message.model.js`

## Quick local run
1. cd server
2. npm install
3. create a `.env` file based on `.env.example` with your MongoDB connection string:
   `MONGO_URI=mongodb+srv://username:password@cluster0....mongodb.net/chatdb`
4. npm start
5. Open browser at http://localhost:5000

## Deploying on Render.com (recommended)
1. Push this project to GitHub.
2. On Render, create a new **Web Service** and connect your GitHub repo.
3. Set the Start Command to:
   `cd server && npm install && npm start`
4. Add Environment Variables on Render:
   - `MONGO_URI` = your connection string
   - `PORT` = (optional)
5. Deploy — Render will start the server and serve the frontend from `/public`.

## Notes
- This is a starter scaffold. For production: add auth, rate-limiting, input sanitization, moderation, backups.
- Owner/Admin panel isn't included yet — can be added later as a separate route and UI.
