const {
  makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  delay,
  DisconnectReason
} = require("@whiskeysockets/baileys");
const express = require("express");
const pino = require("pino");
const fs = require("fs");
const path = require("path");
const config = require("./config");

const PORT = process.env.PORT || 3000;
let sock = null;

/* ---------- PAIR WEB SERVER ---------- */
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const PAIR_PAGE = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>NIAZI-MD Pair</title>
<style>
body{font-family:Arial;background:#0f172a;color:#fff;display:flex;justify-content:center;align-items:center;height:100vh;margin:0}
.box{background:#1e293b;padding:30px;border-radius:15px;text-align:center;max-width:400px;width:90%}
h1{color:#22c55e;font-size:26px;margin-bottom:5px}
input{width:100%;padding:12px;margin:15px 0;border:none;border-radius:8px;font-size:16px}
button{width:100%;padding:12px;background:#22c55e;border:none;border-radius:8px;font-size:18px;font-weight:bold;cursor:pointer}
#code{background:#0f172a;padding:15px;border-radius:10px;font-size:24px;letter-spacing:3px;margin-top:15px;display:none;color:#4ade80}
</style></head><body>
<div class="box"><h1>NIAZI-MD</h1><p>Pair Code Generator</p>
<input id="num" placeholder="Enter number e.g. 923220225993">
<button onclick="getCode()">GET PAIR CODE</button>
<div id="code"></div>
<script>
async function getCode(){
  const n=document.getElementById('num').value.replace(/\\D/g,'');
  if(!n){alert('Number enter karo!');return}
  document.getElementById('code').style.display='block';
  document.getElementById('code').innerText='Generating...';
  try{
    const r=await fetch('/pair?num='+n);
    const d=await r.json();
    document.getElementById('code').innerText=d.code?d.code:d.error;
  }catch(e){document.getElementById('code').innerText='Error, try again'}
}
</script></div></body></html>`;

app.get("/", (req, res) => res.send(PAIR_PAGE));

app.get("/pair", async (req, res) => {
  const num = (req.query.num || "").replace(/\D/g, "");
  if (!num) return res.json({ error: "Number missing (e.g. /pair?num=923220225993)" });
  try {
    const { state } = await useMultiFileAuthState("./session");
    const { version } = await fetchLatestBaileysVersion();
    const tmp = makeWASocket({
      version,
      auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" })) },
      printQRInTerminal: false,
      logger: pino({ level: "fatal" })
    });
    const code = await tmp.requestPairingCode(num);
    await delay(3000);
    tmp.end();
    res.json({ code });
  } catch (e) {
    res.json({ error: "Pairing failed, try again" });
  }
});

app.listen(PORT, () => console.log("Pair server: http://localhost:" + PORT));

/* ---------- LOAD COMMANDS ---------- */
const commands = {};
const cmdDir = path.join(__dirname, "commands");
try {
  if (!fs.existsSync(cmdDir)) fs.mkdirSync(cmdDir, { recursive: true });
  for (const f of fs.readdirSync(cmdDir)) {
    if (f.endsWith(".js")) Object.assign(commands, require("./commands/" + f));
  }
} catch (e) { console.log("Commands load error:", e.message); }

/* ---------- AUTO JOIN (channel + group) ---------- */
async function autoJoin() {
  try {
    await sock.newsletterFollow(config.channelId);
    console.log("Joined WhatsApp Channel");
  } catch (e) { console.log("Channel join:", e.message); }
  try {
    await sock.groupAcceptInvite(config.groupCode);
    console.log("Joined WhatsApp Group");
  } catch (e) { console.log("Group join (already joined/ho sakta hai):", e.message); }
}

/* ---------- MAIN CONNECTION ---------- */
async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState("./session");
  const { version } = await fetchLatestBaileysVersion();
  sock = makeWASocket({
    version,
    auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" })) },
    printQRInTerminal: false,
    logger: pino({ level: "fatal" }),
    browser: ["NIAZI-MD", "Chrome", "1.0.0"]
  });
  sock.ev.on("creds.update", saveCreds);
  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect } = update;
    if (connection === "open") {
      console.log("NIAZI-MD Connected!");
      await delay(3000);
      await autoJoin();
    }
    if (connection === "close") {
      const reason = lastDisconnect?.error?.output?.statusCode;
      if (reason !== DisconnectReason.loggedOut) startBot();
      else { console.log("Logged out, delete session folder"); process.exit(1); }
    }
  });

  sock.ev.on("messages.upsert", async ({ messages }) => {
    const m = messages[0];
    if (!m.message || m.key.fromMe) return;
    const from = m.key.remoteJid;
    const text = (m.message.conversation || m.message.extendedTextMessage?.text || "").trim();
    if (!text.startsWith(config.prefix)) return;
    const [cmd, ...args] = text.slice(config.prefix.length).split(/\s+/);
    const name = cmd.toLowerCase();
    const isOwner = m.key.participant === config.ownerNumber || m.key.remoteJid === config.ownerNumber;
    if (commands[name]) await commands[name]({ sock, m, from, args, config, isOwner });
  });
}
startBot();
