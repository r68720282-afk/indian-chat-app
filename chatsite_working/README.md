# ChatSite - Working scaffold (in-memory)

This is a ready-to-run chat site scaffold using Node.js, Express and Socket.IO.

## Quick start
1. cd server
2. npm install
3. npm start
4. Open http://localhost:5000

Notes:
- This version stores messages in memory and will reset on server restart.
- To persist messages, integrate MongoDB later.
- To deploy to Render.com, push to GitHub and configure a Web Service pointing to the repo root with start command `cd server && npm install && npm start`.
