const express = require("express");
const crypto = require("crypto");
const { Pool } = require("pg");

const app = express();
const PORT = process.env.PORT || 10000;

const required = [
  "DATABASE_URL",
  "META_PAGE_ACCESS_TOKEN",
  "META_APP_SECRET",
  "META_VERIFY_TOKEN",
  "META_PAGE_ID"
];

const missing = required.filter((key) => !process.env[key]);
if (missing.length) {
  console.error("Faltan variables de entorno:", missing.join(", "));
  process.exit(1);
}

const META_API_VERSION = process.env.META_API_VERSION || "v26.0";
const CRM_KEY = process.env.CRM_KEY || "";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const CATALOG = {
  entertainment: {
    label: "Entretenimiento",
    products: {
      netflix: {
        label: "Netflix",
        aliases: ["netflix","netfli","netfl","netf","net","neflix","netlix","netflixx","nf","la net"],
        plans: [
          { name: "HD", price: 13000, aliases: ["1","opcion 1","opción 1","hd","la de 13 mil"] },
          { name: "4K", price: 15000, aliases: ["2","opcion 2","opción 2","4k","la de 15 mil"] },
          { name: "PREMIUM 4K", price: 16000, aliases: ["3","opcion 3","opción 3","premium","premium 4k","la de 16 mil"] }
        ]
      },
      hbo: {
        label: "HBO",
        aliases: ["hbo","max","hbo max","hbomax","hbomaxx","la max"],
        plans: [
          { name: "HD", price: 6000, aliases: ["1","opcion 1","opción 1","hd","la de 6 mil"] },
          { name: "PLATINO", price: 7500, aliases: ["2","opcion 2","opción 2","platino","la de 7500"] }
        ]
      },
      amazon: {
        label: "Amazon",
        aliases: ["amazon","prime","amazon prime","prime video","primevideo","praim","prim","la prime"],
        plans: [
          { name: "HD", price: 6000, aliases: ["1","opcion 1","opción 1","hd","la de 6 mil"] },
          { name: "PREMIUM", price: 14000, aliases: ["2","opcion 2","opción 2","premium","la de 14 mil"] }
        ]
      },
      disney: {
        label: "Disney",
        aliases: ["disney","disney plus","disney+","disneyplus","disnei","disny","la disney"],
        plans: [
          { name: "HD", price: 8000, aliases: ["1","opcion 1","opción 1","hd","la de 8 mil"] },
          { name: "4K", price: 10000, aliases: ["2","opcion 2","opción 2","4k","la de 10 mil"] },
          { name: "PREMIUM 4K", price: 12000, aliases: ["3","opcion 3","opción 3","premium","premium 4k","la de 12 mil"] }
        ]
      }
    }
  },
  games: {
    label: "Juegos",
    products: {
      ff341: { label: "341 Diamantes Free Fire", aliases: ["free fire","freefire","ff","diamantes","diamantes ff","recarga ff","341"], fixedPrice: 14600 },
      ff1166: { label: "1166 Diamantes Free Fire", aliases: ["1166"], fixedPrice: 34000 },
      gta: { label: "GTA 5 PS4/5", aliases: ["gta","gta 5","gta v","gran theft auto","gta ps4","gta ps5"], fixedPrice: 110000 },
      fc: { label: "EA FC PS4/5", aliases: ["fifa","fc","fc 24","fc 25","fc 26","ea fc","fifa ps4","fifa ps5"], fixedPrice: 130000 },
      minecraft: { label: "Minecraft Premium", aliases: ["minecraft","mine","minecraft premium","minecraft pc","minecraft java"], fixedPrice: 40000 }
    }
  },
  music: {
    label: "Música",
    products: {
      spotify: { label: "Spotify", aliases: ["spotify","spoty","spotifi","spoti","spot","sp","la spotify"], fixedPrice: 11000 },
      youtube: { label: "YouTube Premium", aliases: ["youtube","youtube premium","yt","yout","ytb","youtub","la de youtube"], fixedPrice: 11000 },
      deezer: { label: "Deezer", aliases: ["deezer","deeser","deez","dezer","dee","la deezer"], fixedPrice: 10000 }
    }
  }
};

const PAYMENT = ["nequi","nqui","daviplata","davi","banco","transferencia","transfer","cuenta"];
const MENU = ["menu","menú","inicio","volver al menu","volver al menú","volver inicio","ir al menu","ir al menú"];

function normalize(value = "") {
  return value.toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}\s$]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function distance(a, b) {
  a = normalize(a); b = normalize(b);
  const matrix = Array.from({ length: b.length + 1 }, (_, i) => [i]);
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      matrix[i][j] = b[i - 1] === a[j - 1]
        ? matrix[i - 1][j - 1]
        : Math.min(
            matrix[i - 1][j] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j - 1] + 1
          );
    }
  }
  return matrix[b.length][a.length];
}

function similarity(a, b) {
  a = normalize(a); b = normalize(b);
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.includes(b) || b.includes(a)) return 0.86;
  return 1 - distance(a, b) / Math.max(a.length, b.length);
}

function bestAlias(text, items) {
  let best = null;
  let score = 0;
  for (const item of items) {
    for (const alias of item.aliases || []) {
      const current = similarity(text, alias);
      if (current > score) {
        score = current;
        best = item;
      }
    }
  }
  return score >= 0.68 ? best : null;
}

function money(value) {
  return "$" + Number(value).toLocaleString("es-CO");
}

function menuText() {
  return "👋 ¡Hola! Sí, tenemos varias opciones digitales desde $10.000.\n\n1️⃣ Entretenimiento\n2️⃣ Juegos\n3️⃣ Música\n\n¿Cuál buscas? Puedes responder con el número o la palabra.";
}

function categoryText(category) {
  if (category === "entertainment") {
    return "¡Listo! Elegiste Entretenimiento 🎬. ¿Cuál te interesa?\n\n1️⃣ Netflix\n2️⃣ HBO\n3️⃣ Amazon\n4️⃣ Disney\n\nResponde con el número o el nombre del servicio.";
  }
  if (category === "games") {
    return "¡Listo! Elegiste Juegos 🎮. ¿Qué opción buscas?\n\n1️⃣ 341 Diamantes Free Fire — $14.600\n2️⃣ 1166 Diamantes Free Fire — $34.000\n3️⃣ GTA 5 PS4/5 — $110.000\n4️⃣ EA FC PS4/5 — $130.000\n5️⃣ Minecraft Premium — $40.000";
  }
  return "¡Listo! Elegiste Música 🎵. Tenemos estas opciones:\n\n1️⃣ Spotify — $11.000\n2️⃣ YouTube Premium — $11.000\n3️⃣ Deezer — $10.000";
}

function planText(product) {
  return `Perfecto. Estas son las opciones para ${product.label}:\n\n` +
    product.plans.map((plan, index) => `${index + 1}️⃣ ${plan.name} — ${money(plan.price)}`).join("\n") +
    `\n\n💰 Desde ${money(Math.min(...product.plans.map((p) => p.price)))}\n⚡ Entrega digital\n\nElige por número o escribe el plan.`;
}

function paymentText() {
  return "¡Excelente! 💰\n\nPor favor indícame por cuál medio de pago prefieres realizar la transferencia (Nequi, Daviplata o Banco) para enviarte los datos de cuenta e instrucciones de entrega.";
}

function categoryFromText(text) {
  const n = normalize(text);
  const list = [
    ["entertainment", ["1","entretenimiento","entrete","streaming","series","peliculas","películas"]],
    ["games", ["2","juegos","juego","gamer","gaming","videojuegos"]],
    ["music", ["3","musica","música","music","canciones"]]
  ];

  for (const [key, aliases] of list) {
    if (aliases.some((alias) => n === normalize(alias) || n.includes(normalize(alias)))) return key;
  }

  let best = null;
  let score = 0;
  for (const [key, aliases] of list) {
    for (const alias of aliases) {
      const current = similarity(n, alias);
      if (current > score) {
        score = current;
        best = key;
      }
    }
  }
  return score >= 0.68 ? best : null;
}

function processBot(state, input) {
  const n = normalize(input);

  if (MENU.some((item) => n === normalize(item) || n.includes(normalize(item)))) {
    return {
      reply: menuText(),
      state: { level: 1, category: null, product: null, plan: null, amount: null }
    };
  }

  const next = { ...state };

  if (next.level === 1) {
    const category = categoryFromText(n);
    if (!category) {
      return {
        reply: "No alcancé a identificar la categoría. Puedes elegir 1️⃣ Entretenimiento, 2️⃣ Juegos o 3️⃣ Música.",
        state: next
      };
    }
    next.category = category;
    next.level = 2;
    return { reply: categoryText(category), state: next };
  }

  if (next.level === 2) {
    const products = Object.values(CATALOG[next.category].products);
    let product = bestAlias(n, products);
    if (!product) {
      const index = Number.parseInt(n, 10) - 1;
      if (Number.isInteger(index) && index >= 0 && index < products.length) product = products[index];
    }

    if (!product) {
      return {
        reply: "No encontré ese producto en esta categoría. Responde con el número o nombre de una opción.",
        state: next
      };
    }

    next.product = product.label;

    if (product.fixedPrice) {
      next.plan = "Único";
      next.amount = product.fixedPrice;
      next.level = 4;
      return {
        reply: `Perfecto: ${product.label} — ${money(product.fixedPrice)}.\n\n${paymentText()}`,
        state: next
      };
    }

    next.level = 3;
    return { reply: planText(product), state: next };
  }

  if (next.level === 3) {
    const product = Object.values(CATALOG[next.category].products)
      .find((item) => item.label === next.product);

    if (!product?.plans) {
      return { reply: "No encontré las opciones de este producto.", state: next };
    }

    let plan = bestAlias(n, product.plans);
    if (!plan) {
      const index = Number.parseInt(n, 10) - 1;
      if (Number.isInteger(index) && index >= 0 && index < product.plans.length) plan = product.plans[index];
    }

    if (!plan) {
      return {
        reply: "No identifiqué el plan. Elige una opción por número o escribe HD, 4K o PREMIUM.",
        state: next
      };
    }

    next.plan = plan.name;
    next.amount = plan.price;
    next.level = 4;

    return {
      reply: `¡Perfecto! Elegiste ${product.label} ${plan.name} — ${money(plan.price)}.\n\n${paymentText()}`,
      state: next
    };
  }

  if (next.level === 4) {
    if (PAYMENT.some((item) => n === normalize(item) || n.includes(normalize(item)))) {
      return {
        reply: "Perfecto. Método seleccionado. Aquí se enviarían los datos de pago correspondientes. ⚠️ Llegar al Nivel 4 no confirma que el pago haya sido realizado.",
        state: next
      };
    }
    return {
      reply: "Ya estás en la etapa de pago. Indícame si prefieres Nequi, Daviplata o Banco.",
      state: next
    };
  }

  return { reply: menuText(), state: { level: 1, category: null, product: null, plan: null, amount: null } };
}

function verifyMetaSignature(rawBody, signature) {
  if (!signature || !signature.startsWith("sha256=")) return false;
  const received = signature.slice(7);
  const expected = crypto
    .createHmac("sha256", process.env.META_APP_SECRET)
    .update(rawBody)
    .digest("hex");

  if (received.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(received), Buffer.from(expected));
}

async function getConversation(idUsuario) {
  const result = await pool.query(
    "SELECT * FROM conversaciones WHERE id_usuario = $1",
    [idUsuario]
  );
  return result.rows[0] || null;
}

async function getProfileName(psid) {
  try {
    const url = new URL(`https://graph.facebook.com/${META_API_VERSION}/${encodeURIComponent(psid)}`);
    url.searchParams.set("fields", "first_name,last_name");
    url.searchParams.set("access_token", process.env.META_PAGE_ACCESS_TOKEN);

    const response = await fetch(url);
    if (!response.ok) return "Cliente Messenger";

    const data = await response.json();
    return [data.first_name, data.last_name].filter(Boolean).join(" ") || "Cliente Messenger";
  } catch {
    return "Cliente Messenger";
  }
}

async function sendMessengerMessage(recipientId, text) {
  const url = `https://graph.facebook.com/${META_API_VERSION}/${process.env.META_PAGE_ID}/messages`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.META_PAGE_ACCESS_TOKEN}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      recipient: { id: recipientId },
      message: { text }
    })
  });

  const body = await response.text();

  if (!response.ok) {
    console.error("Error Send API:", body);
    throw new Error(`Meta Send API respondió ${response.status}`);
  }

  try {
    return JSON.parse(body);
  } catch {
    return { raw: body };
  }
}

async function ensureTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS conversaciones (
      id_usuario TEXT PRIMARY KEY,
      nombre TEXT,
      plataforma TEXT NOT NULL,
      nivel_actual INTEGER NOT NULL DEFAULT 1,
      categoria TEXT,
      plataforma_interes TEXT,
      plan TEXT,
      monto_estimado INTEGER,
      fecha_inicio TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      ultima_interaccion TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      total_mensajes INTEGER NOT NULL DEFAULT 0,
      ultimo_evento TEXT
    );

    CREATE TABLE IF NOT EXISTS mensajes (
      id BIGSERIAL PRIMARY KEY,
      id_externo TEXT UNIQUE,
      id_usuario TEXT NOT NULL,
      tipo TEXT NOT NULL,
      mensaje TEXT NOT NULL,
      fecha TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_mensajes_usuario_fecha
      ON mensajes(id_usuario, fecha);

    CREATE INDEX IF NOT EXISTS idx_conversaciones_nivel
      ON conversaciones(nivel_actual);

    CREATE INDEX IF NOT EXISTS idx_conversaciones_ultima
      ON conversaciones(ultima_interaccion);
  `);
}

async function saveMessage({ idExterno, idUsuario, tipo, mensaje }) {
  await pool.query(
    `INSERT INTO mensajes (id_externo, id_usuario, tipo, mensaje)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (id_externo) DO NOTHING`,
    [idExterno || null, idUsuario, tipo, mensaje]
  );
}

async function upsertConversation(data) {
  await pool.query(
    `INSERT INTO conversaciones (
      id_usuario, nombre, plataforma, nivel_actual, categoria,
      plataforma_interes, plan, monto_estimado,
      fecha_inicio, ultima_interaccion, total_mensajes, ultimo_evento
    )
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
    ON CONFLICT (id_usuario)
    DO UPDATE SET
      nombre = EXCLUDED.nombre,
      plataforma = EXCLUDED.plataforma,
      nivel_actual = EXCLUDED.nivel_actual,
      categoria = EXCLUDED.categoria,
      plataforma_interes = EXCLUDED.plataforma_interes,
      plan = EXCLUDED.plan,
      monto_estimado = EXCLUDED.monto_estimado,
      ultima_interaccion = EXCLUDED.ultima_interaccion,
      total_mensajes = EXCLUDED.total_mensajes,
      ultimo_evento = EXCLUDED.ultimo_evento`,
    [
      data.id_usuario,
      data.nombre,
      data.plataforma,
      data.nivel_actual,
      data.categoria,
      data.plataforma_interes,
      data.plan,
      data.monto_estimado,
      data.fecha_inicio,
      data.ultima_interaccion,
      data.total_mensajes,
      data.ultimo_evento
    ]
  );
}

function requireCrmAuth(req, res, next) {
  if (!CRM_KEY) return next();

  const auth = req.get("authorization") || "";
  if (auth === `Bearer ${CRM_KEY}`) return next();

  return res.status(401).json({ error: "No autorizado" });
}

app.get("/health", (_req, res) => {
  res.json({ ok: true, servicio: "BotFlow API", fecha: new Date().toISOString() });
});

app.get("/webhook/messenger", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === process.env.META_VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }

  return res.sendStatus(403);
});

app.post("/webhook/messenger", express.raw({ type: "application/json" }), async (req, res) => {
  const rawBody = req.body;

  if (!Buffer.isBuffer(rawBody)) return res.sendStatus(400);

  const signature = req.get("x-hub-signature-256");
  if (!verifyMetaSignature(rawBody, signature)) {
    return res.sendStatus(403);
  }

  let body;
  try {
    body = JSON.parse(rawBody.toString("utf8"));
  } catch {
    return res.sendStatus(400);
  }

  // Meta necesita un 200 rápido para considerar recibido el evento.
  res.sendStatus(200);

  if (body.object !== "page") return;

  try {
    for (const entry of body.entry || []) {
      for (const event of entry.messaging || []) {
        if (!event.message || !event.sender?.id) continue;
        if (!event.message.text) continue;

        const idUsuario = event.sender.id;
        const texto = String(event.message.text).trim();
        const messageId = event.message.mid || crypto.randomUUID();
        const ahora = new Date();

        const messageExists = await pool.query(
          "SELECT 1 FROM mensajes WHERE id_externo = $1 LIMIT 1",
          [messageId]
        );
        if (messageExists.rowCount) continue;

        let conversation = await getConversation(idUsuario);

        if (!conversation) {
          conversation = {
            id_usuario: idUsuario,
            nombre: await getProfileName(idUsuario),
            plataforma: "Facebook Messenger",
            nivel_actual: 1,
            categoria: null,
            plataforma_interes: null,
            plan: null,
            monto_estimado: null,
            fecha_inicio: ahora.toISOString(),
            ultima_interaccion: ahora.toISOString(),
            total_mensajes: 0
          };
        }

        const state = {
          level: Number(conversation.nivel_actual || 1),
          category: conversation.categoria,
          product: conversation.plataforma_interes,
          plan: conversation.plan,
          amount: conversation.monto_estimado
        };

        const result = processBot(state, texto);

        const totalAfterUser = Number(conversation.total_mensajes || 0) + 1;

        await saveMessage({
          idExterno: messageId,
          idUsuario,
          tipo: "usuario",
          mensaje: texto
        });

        await upsertConversation({
          id_usuario: idUsuario,
          nombre: conversation.nombre || "Cliente Messenger",
          plataforma: "Facebook Messenger",
          nivel_actual: result.state.level,
          categoria: result.state.category,
          plataforma_interes: result.state.product,
          plan: result.state.plan,
          monto_estimado: result.state.amount,
          fecha_inicio: conversation.fecha_inicio || ahora.toISOString(),
          ultima_interaccion: ahora.toISOString(),
          total_mensajes: totalAfterUser,
          ultimo_evento: `Cliente: ${texto}`
        });

        await sendMessengerMessage(idUsuario, result.reply);

        await saveMessage({
          idExterno: null,
          idUsuario,
          tipo: "bot",
          mensaje: result.reply
        });

        await pool.query(
          `UPDATE conversaciones
           SET ultima_interaccion = NOW(),
               total_mensajes = total_mensajes + 1,
               ultimo_evento = $1
           WHERE id_usuario = $2`,
          [`Bot: ${result.reply}`, idUsuario]
        );
      }
    }
  } catch (error) {
    console.error("Error procesando Messenger:", error);
  }
});

app.get("/api/conversaciones", requireCrmAuth, async (_req, res) => {
  const result = await pool.query(
    "SELECT * FROM conversaciones ORDER BY ultima_interaccion DESC"
  );
  res.json(result.rows);
});

app.get("/api/conversaciones/:id", requireCrmAuth, async (req, res) => {
  const conversation = await getConversation(req.params.id);

  if (!conversation) return res.status(404).json({ error: "No encontrado" });

  const messages = await pool.query(
    "SELECT * FROM mensajes WHERE id_usuario = $1 ORDER BY fecha ASC",
    [req.params.id]
  );

  res.json({
    conversation,
    messages: messages.rows
  });
});

app.get("/api/leads", requireCrmAuth, async (_req, res) => {
  const result = await pool.query(`
    SELECT *,
      CASE
        WHEN nivel_actual = 4 THEN 'Lead avanzado'
        WHEN nivel_actual IN (2,3) THEN 'En seguimiento'
        ELSE 'Nuevo'
      END AS estado_lead
    FROM conversaciones
    ORDER BY ultima_interaccion DESC
  `);

  res.json(result.rows);
});

(async () => {
  await ensureTables();

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`BotFlow API escuchando en 0.0.0.0:${PORT}`);
  });
})().catch((error) => {
  console.error("No se pudo iniciar BotFlow API:", error);
  process.exit(1);
});
