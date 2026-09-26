# BotFlow API

Backend de BotFlow Ventas.

## Qué hace

- Recibe mensajes de Facebook Messenger por `/webhook/messenger`.
- Verifica la firma `X-Hub-Signature-256`.
- Ejecuta el Bot Engine de 4 niveles.
- Guarda conversaciones y mensajes en PostgreSQL.
- Responde a Messenger usando el Send API.
- Expone la API que usará el CRM:
  - `GET /api/conversaciones`
  - `GET /api/conversaciones/:id`
  - `GET /api/leads`
- `GET /health` comprueba que el servicio está vivo.

## Variables de entorno

- `DATABASE_URL`
- `META_PAGE_ID`
- `META_API_VERSION`
- `META_PAGE_ACCESS_TOKEN`
- `META_APP_SECRET`
- `META_VERIFY_TOKEN`
- `CRM_KEY`

No pongas credenciales dentro de GitHub.

## Render

Tipo: Web Service
Runtime: Node
Build command: `npm install`
Start command: `npm start`

Render proporciona una URL pública `onrender.com` para el Web Service.

## Webhook de Meta

Callback URL:

`https://TU-SERVICIO.onrender.com/webhook/messenger`

Verify Token:
el mismo valor configurado como `META_VERIFY_TOKEN`.

Una vez configurado el webhook, suscribe la Página a eventos de Messenger y usa `messages` como evento necesario para recibir mensajes.

## CRM

Después conectaremos el `index.html` de GitHub Pages a:

`https://TU-SERVICIO.onrender.com/api/conversaciones`

y

`https://TU-SERVICIO.onrender.com/api/leads`
