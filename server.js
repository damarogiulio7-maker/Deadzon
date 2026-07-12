const http = require('http');
const WebSocket = require('ws');
const PORT = process.env.PORT || 3000;
const server = http.createServer((req, res) => {
  res.writeHead(200, {'Content-Type': 'text/plain'});
  res.end('Dead Zone Server OK');
});
const wss = new WebSocket.Server({ server });
const rooms = {};
function send(ws, obj) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
}
function broadcastAll(room, obj) {
  if (!rooms[room]) return;
  rooms[room].players.forEach(ws => send(ws, obj));
}
function broadcastOthers(room, obj, exclude) {
  if (!rooms[room]) return;
  rooms[room].players.forEach(ws => { if (ws !== exclude) send(ws, obj); });
}
wss.on('connection', ws => {
  ws.room = null;
  ws.playerIdx = -1;
  ws.isHost = false;
  ws.on('message', raw => {
    let msg;
    try { msg = JSON.parse(raw); } catch(e) { return; }
    if (msg.type === 'create') {
      const code = Math.random().toString(36).substr(2,6).toUpperCase();
      rooms[code] = { players: [ws], hostWs: ws, state: null };
      ws.room = code; ws.playerIdx = 0; ws.isHost = true;
      send(ws, { type: 'created', code, index: 0 });
    }
    else if (msg.type === 'join') {
      const code = msg.code;
      if (!rooms[code]) { send(ws, { type: 'error', msg: 'Stanza non trovata!' }); return; }
      if (rooms[code].players.length >= 4) { send(ws, { type: 'error', msg: 'Stanza piena!' }); return; }
      const idx = rooms[code].players.length;
      rooms[code].players.push(ws);
      ws.room = code; ws.playerIdx = idx; ws.isHost = false;
      send(ws, { type: 'joined', index: idx, playerCount: rooms[code].players.length });
      send(rooms[code].hostWs, { type: 'playerJoined', index: idx, name: msg.name, playerCount: rooms[code].players.length });
      if (rooms[code].state) send(ws, { type: 'state', state: rooms[code].state });
    }
    else if (msg.type === 'startGame') {
      if (!ws.room || !rooms[ws.room]) return;
      rooms[ws.room].state = msg.state;
      broadcastAll(ws.room, { type: 'startGame', state: msg.state });
    }
    else if (msg.type === 'state') {
      if (!ws.room || !rooms[ws.room]) return;
      rooms[ws.room].state = msg.state;
      broadcastOthers(ws.room, { type: 'state', state: msg.state }, ws);
    }
    else if (msg.type === 'playerUpdate') {
      if (!ws.room) return;
      broadcastOthers(ws.room, { type: 'playerUpdate', idx: msg.idx, player: msg.player }, ws);
    }
  });
  ws.on('close', () => {
    if (!ws.room || !rooms[ws.room]) return;
    rooms[ws.room].players = rooms[ws.room].players.filter(p => p !== ws);
    if (rooms[ws.room].players.length === 0) delete rooms[ws.room];
    else broadcastAll(ws.room, { type: 'playerLeft', index: ws.playerIdx });
  });
});
server.listen(PORT, () => console.log('Dead Zone server on port', PORT));
