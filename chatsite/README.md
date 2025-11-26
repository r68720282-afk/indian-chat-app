# ChatSite Demo (minimal)

## What's inside
- `server/` - Node.js Express + Socket.IO server
- `public/` - Static frontend (index.html, rooms.html, room.html)
- In-memory messages/rooms (demo only). Replace with DB for production.

## Quick start
1. cd server
2. npm install
3. npm start
4. Open http://localhost:5000

## Notes
- This is a demo scaffold. It does NOT include owner/admin panel yet.
- For production, add persistent DB, auth, rate-limiting, sanitization.
