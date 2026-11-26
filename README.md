# RG Beauty Spa · Módulo Agendamiento y pago de abono

Implementación de la Unidad III (Proyecto Integrado) del módulo **Agendamiento y pago de abono**, diseñado en la Unidad II.

- **Frontend:** React + TypeScript (Vite)
- **Backend:** Node.js + Express + TypeScript
- **Relacional:** PostgreSQL (citas, pagos, usuarios, auditoría)
- **No relacional:** MongoDB (colección `portafolio`)

## 1. Alcance implementado

| Historia (Unidad II) | Qué hace | Dónde |
|---|---|---|
| HU-01 Ver horarios | Horas libres por profesional, servicio y día | P2 · `GET /api/horarios` |
| HU-02 Reservar y pagar abono | Reserva retenida 15 min, abono calculado en el servidor, pago y confirmación | P3–P6 · `POST /api/citas`, `POST /api/pagos/simular` |
| HU-03 Sin traslapes | Transacción con bloqueo + restricción de exclusión en PostgreSQL | `services/agenda.ts`, `sql/001_schema.sql` |
| HU-04 Cancelar | Cancela y libera el horario | P7–P8 · `POST /api/citas/:id/cancelar` |
| HU-05 Agenda del profesional | Solo sus citas (id tomado del token) | A2 · `GET /api/agenda` |
| HU-06 Disponibilidad y pagos | Bloquear/liberar horarios; registrar/revertir pagos con auditoría | A3, Pagos |
| HU-07 Indicadores y reporte | Ocupación, cancelación, tiempo muerto, traslapes + **tabla de citas por rango de fechas** con filtros y CSV | A4 Reportes · `GET /api/admin/indicadores`, `GET /api/admin/reporte/citas` |
| HU-08 Notificación | Evento por cita confirmada/cancelada (**correo simulado**: queda en el log) | `services/notificaciones.ts` |
| Portafolio (datos no estructurados) | Galería pública y gestión por profesional/administración | `GET /api/portafolio`, `/api/portafolio/gestion` |

Reglas de negocio: RN-01 abono en el servidor (`domain/abono.ts`) · RN-02 anti-traslape · RN-03 pago idempotente (`services/pagos.ts`) · RN-04 expiración a los 15 min · RN-05 cancelación libera horario · RN-06 pagos solo con perfil autorizado y auditoría.

### CRUD por entidad (evidencia para la pauta)

| Entidad | Crear | Consultar | Actualizar | Eliminar | Dónde |
|---|---|---|---|---|---|
| Servicio | `POST /api/admin/servicios` | `GET /api/servicios` | `PUT /api/admin/servicios/:id` | `DELETE …/:id` (409 si tiene citas) | Catálogo |
| Profesional + horario semanal | `POST /api/admin/profesionales` | `GET /api/admin/profesionales` | `PUT …/:id`, `PUT …/:id/horario` | `DELETE …/:id` (409 si tiene citas o cuenta) | Catálogo |
| Cita | `POST /api/citas` | `GET /api/citas/mias`, reporte | `PUT /api/citas/:id/reprogramar`, cancelar | `DELETE /api/admin/citas/:id` (solo canceladas/expiradas sin pagos) | Mis citas, Reportes |
| Clienta | registro | `GET /api/auth/yo` | `PUT /api/auth/yo` | `DELETE /api/auth/yo` (solo si nunca tuvo citas) | Mi perfil |
| Bloqueo de horario | `POST /api/bloqueos` | `GET /api/bloqueos` | `PUT /api/bloqueos/:id` | `DELETE /api/bloqueos/:id` | Disponibilidad |
| Portafolio (MongoDB) | `POST /api/portafolio/gestion` | `GET /api/portafolio` | `PUT …/:id` | `DELETE …/:id` | Mis trabajos |
| Pago | simulado/manual | Pagos | reversa (estado REVERTIDO) | **no se elimina** | Pagos |

**Justificación para la presentación:** las citas confirmadas se *cancelan* (no se borran) y los pagos nunca se eliminan: son registros contables y de auditoría (baja lógica). La base de datos lo refuerza con claves foráneas; la API devuelve un mensaje claro (409) en vez de un error técnico. Cambiar el precio de un servicio no altera el abono de citas ya reservadas (se guarda en cada cita). El vínculo portafolio↔servicio no lo valida una clave foránea porque son dos motores distintos.

**Portafolio sin MongoDB (solo demostración):** `PORTAFOLIO_EN_MEMORIA=true` en `backend/.env` usa datos en memoria (se pierden al reiniciar; se rechaza en producción). Para la entrega final usa MongoDB Atlas (sección 6).

### Cambios de alcance respecto de la Unidad II (documentar en el informe)

1. **Backend en Node/Express en vez de Python/FastAPI.** Se unifica el lenguaje (TypeScript en todo el proyecto) para que una sola persona lo mantenga. La arquitectura en capas (routers → services → repositories) y todas las reglas se mantienen.
2. **Cuenta para la clienta.** P3 "Datos de la clienta" incluye crear contraseña (o ingresar). Es necesario para que el sistema tome la identidad desde el token y no desde el formulario (amenaza A5).
3. **Pasarela de pago simulada.** No se conecta a Flow/Webpay. Ver sección 9.
4. **Imágenes del portafolio por URL https** (no hay carga de archivos), por lo que PS-06 se cubre validando URL y texto alternativo.
5. **Tablas nuevas** para completar el modelo: `profesional_servicio`, `disponibilidad`, `bloqueo`, `usuario`, `sesion`, `auditoria`.
6. **Restricción anti-traslape en PostgreSQL** con `EXCLUDE USING gist` sobre `tsrange` (en la Unidad II se demostró con SQLite y un índice único parcial; aquí es la versión de producción prevista en la sección 6.2).

## 2. Estructura

```
rg-beauty/
├─ docker-compose.yml        PostgreSQL y MongoDB locales
├─ docker/postgres-init/     crea el usuario de la API (solo lee/escribe datos)
├─ backend/
│  ├─ sql/001_schema.sql     esquema relacional
│  ├─ src/domain/            abono y horarios (lógica pura)
│  ├─ src/repositories/      consultas parametrizadas (SQL y MongoDB)
│  ├─ src/services/          reglas de negocio: agenda, pagos, auth, reportes
│  ├─ src/security/          claves Argon2id, JWT, cookies, CSRF, roles, errores
│  ├─ src/routes/            endpoints + validación (zod)
│  ├─ scripts/               migrate.ts, seed.ts
│  └─ tests/                 76 pruebas automáticas
└─ frontend/src/paginas/     P1–P7, E1, E2, A1–A4, Pagos, Portafolio
```

## 3. Requisitos

- Node.js 20 o superior (probado con 22) y npm
- Docker Desktop (para las bases locales). Sin Docker: ver sección 6 (bases en la nube).

## 4. Instalación y ejecución local (paso a paso)

**1. Claves de las bases locales.** En la carpeta raíz:

```bash
cp .env.example .env
```

Edita `.env` y pon claves propias (no las subas al repositorio).

**2. Levantar las bases.**

```bash
docker compose up -d
docker compose ps        # postgres debe quedar "healthy"
```

**3. Configurar el backend.**

```bash
cd backend
cp .env.example .env
```

Edita `backend/.env`:
- Reemplaza las claves de `DATABASE_URL`, `DATABASE_ADMIN_URL` y `MONGO_URI` por las del paso 1.
- Genera `JWT_SECRET` y `PASARELA_SECRET`: `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`
- Define `SEED_PASSWORD` (≥10 caracteres): es la contraseña de las cuentas **ficticias** de demostración.

**4. Instalar, crear tablas y cargar datos ficticios.**

```bash
npm install
npm run db:reset         # borra y crea el esquema, luego carga datos ficticios
```

Resultado esperado: `Migración lista.` y `PostgreSQL: datos ficticios cargados` (y `MongoDB: 3 documentos de portafolio insertados`).

**5. Iniciar la API** (puerto 3000):

```bash
npm run dev
curl http://localhost:3000/api/salud     # {"estado":"ok","postgres":"ok","mongo":"configurado"}
```

**6. Iniciar el frontend** (otra terminal):

```bash
cd frontend
npm install
npm run dev
```

Abre **http://localhost:5173**.

### Cuentas de demostración (ficticias)

La contraseña es la que pusiste en `SEED_PASSWORD`.

| Perfil | Correo |
|---|---|
| Administración (con perfil de pagos) | `admin@rgbeauty.test` |
| Administración (sin perfil de pagos) | `consulta@rgbeauty.test` |
| Profesional A / B | `prof.a@rgbeauty.test` / `prof.b@rgbeauty.test` |
| Clientas | `camila.soto@example.com`, `vale.rojas@example.com`, `dani.pino@example.com` |

También puedes crear una clienta nueva desde P3.

### Flujo para la demostración

1. Inicio → elegir **Manicure semipermanente** → Profesional A → el próximo martes (ya hay una cita 10:00–11:00, no se ofrecen 09:30–10:30).
2. Crear cuenta → Resumen (abono y saldo) → **Pagar abono**.
3. En la pasarela simulada: **pago rechazado** (E2) → Reintentar → **pago aprobado** → comprobante.
4. Mis citas → Cancelar (P8) → el horario vuelve a quedar libre.
5. Mis citas → **Reprogramar** (mueve la cita y conserva el abono); **Mi perfil** (editar datos).
6. Con `admin@rgbeauty.test`: **Reportes** (cambia el rango/filtros y la tabla cambia; Descargar CSV; eliminar una cita cancelada), **Catálogo** (crear/editar/eliminar servicio y profesional, horario semanal), Agenda, Pagos.
7. Con `prof.a@rgbeauty.test`: solo ve su agenda; **Mis trabajos** (CRUD del portafolio); no aparece Reportes, Catálogo ni Pagos.

## 5. Pruebas

```bash
cd backend
npm test            # 76 pruebas; necesitan DATABASE_URL (PostgreSQL) en backend/.env
npm run perf        # solo PR-01 (rendimiento)
```

Las pruebas **borran y recargan los datos de la base** a la que apunta `DATABASE_URL`. Úsalas con una base de desarrollo, nunca con datos reales. No necesitan MongoDB (usan el motor de consultas de MongoDB en memoria para el portafolio).

| ID | Qué verifica | Archivo |
|---|---|---|
| PU-01…04 | `calcularAbono`: 20 %, redondeo 6.667, datos inválidos, límites 0 % y 100 % | `unitarias.test.ts` |
| PU-05…08 | Traslape parcial/bordes, horas libres, tiempo muerto, fechas | `unitarias.test.ts` |
| PU-09 | Validación de registro por campo | `unitarias.test.ts` |
| PI-01 | Rechaza traslape parcial (10:30 vs 10:00–11:00) | `integracion.test.ts` |
| PI-02 | Horario libre → PENDIENTE_PAGO con abono 6.000 | `integracion.test.ts` |
| PI-03 / 03c | Confirma solo tras pago; notificación repetida (incluso 5 simultáneas) no duplica | `integracion.test.ts` |
| PI-04 | Pago rechazado no confirma; se puede reintentar | `integracion.test.ts` |
| PI-05 | Monto manipulado se rechaza | `integracion.test.ts` |
| PI-06 | La BD impide traslapes aunque se salte el servicio (`23P01`) | `integracion.test.ts` |
| PI-07 | Cancelar libera el horario | `integracion.test.ts` |
| PI-08 | 5 reservas simultáneas al mismo horario: queda 1 | `integracion.test.ts` |
| PI-09 | Expiración a los 15 min; pago tardío se rechaza | `integracion.test.ts` |
| PI-10 | Webhook con firma inválida/alterada → 401; válida → procesa; monto distinto → 422 | `api.test.ts` |
| PI-11…16 | Horas disponibles y bloqueos, servicio por profesional, revertir pago, cancelación, indicadores | `integracion.test.ts` |
| PS-01 | Inyección SQL: parametrizada 0 filas; concatenada (demostración) 3 filas | `api.test.ts` |
| PS-02 | Clienta no ve/cancela citas ajenas (403) | `api.test.ts` |
| PS-03 | Bloqueo tras 5 intentos fallidos | `api.test.ts` |
| PS-04 | Política de contenido (CSP) y sin cabecera `X-Powered-By` | `api.test.ts` |
| PS-05 | Sin token CSRF → 403 | `api.test.ts` |
| PS-06 | Portafolio: URL `javascript:`/http rechazada, alt obligatorio | `unitarias.test.ts`, `portafolio.test.ts` |
| PS-07 | Matriz de roles y perfil autorizado de pagos | `api.test.ts` |
| CR-01…17 | CRUD de servicios, profesionales y horario, reprogramar, eliminar cita, reporte por rango (cambia con los datos), bloqueos y perfil, con validaciones (422), conflictos (409) y permisos (403) | `crud.test.ts` |
| PR-01 | 7.300 citas, 5 profesionales, 1.000 consultas | `rendimiento.test.ts` |

Los IDs PI-09 a PI-16 y PS-07 son nuevos: la tabla del informe de la Unidad II numeraba otros (PI-09 falla de pasarela, PS-04 a PS-06). Actualiza el plan del informe con esta tabla.

### Resultados de la ejecución de entrega

Ejecutadas contra **PostgreSQL 16** y Node 22: **76 de 76 aprobadas**. PR-01: 7.300 citas, 1.000 consultas, promedio 1,3 ms, p95 **2,5 ms** (umbral 100 ms). Además se recorrió el flujo completo (clienta, profesional y administración, escritorio y móvil) en un navegador automatizado, sin errores de la aplicación.

**No ejecutado en la entrega** (hazlo y registra la evidencia con fecha en el informe):

- Pruebas contra un servidor MongoDB real: el código está escrito y `db:seed` inserta el portafolio, pero en el entorno de desarrollo no había servidor MongoDB. Se verificó el mismo filtro con el motor de consultas de MongoDB en memoria.
- PR-02 (carga con 30 usuarios simultáneos, k6), PA-01 (accesibilidad manual con teclado), PI-09 de la Unidad II (caída real de pasarela) y la restauración de respaldo.

## 6. Bases de datos en la nube (lo que pide la pauta)

La pauta exige integrar una base relacional o no relacional en la nube. El código solo necesita cambiar variables de entorno.

**PostgreSQL en Neon (plan gratuito)**

1. Crea una cuenta en neon.tech y un proyecto (región cercana, por ejemplo São Paulo).
2. En el SQL Editor crea el usuario limitado de la API (cambia la clave):
   ```sql
   CREATE ROLE rg_app LOGIN PASSWORD 'una-clave-larga';
   ```
3. Copia la cadena de conexión del propietario (`neondb_owner`) y úsala en `DATABASE_ADMIN_URL`; arma `DATABASE_URL` igual pero con usuario `rg_app` y su clave. Agrega `?sslmode=require` al final de ambas.
4. `npm run db:reset` (la extensión `btree_gist` está disponible en Neon).

**MongoDB en Atlas (plan gratuito M0)**

1. Crea cuenta en mongodb.com/atlas y un cluster M0.
2. *Database Access*: crea un usuario con permiso de lectura y escritura sobre la base `rg_beauty`.
3. *Network Access*: agrega tu IP (o `0.0.0.0/0` solo para la demostración).
4. *Connect → Drivers*: copia la cadena `mongodb+srv://...` en `MONGO_URI`.
5. `npm run db:seed` inserta el portafolio (o `db:reset` para todo).

Captura las evidencias ocultando usuario, clave y host. Para el informe, la consulta que debes mostrar:

```js
db.portafolio.find({ publicado: true, etiquetas: { $in: ["facial", "manicure"] } }, { titulo: 1, etiquetas: 1 })
```

### Producción (un solo proceso)

```bash
cd frontend && npm run build
cd ../backend && npm run build
# En backend/.env: NODE_ENV=production, COOKIE_SECURE=true, FRONTEND_DIST=../frontend/dist
npm start        # la API sirve /api y el frontend; ponla detrás de HTTPS
```

## 7. Variables de entorno (`backend/.env`)

| Variable | Uso |
|---|---|
| `DATABASE_URL` | PostgreSQL con el usuario `rg_app` (solo datos) |
| `DATABASE_ADMIN_URL` | PostgreSQL con permiso de crear tablas (solo `db:migrate`/`db:reset`) |
| `MONGO_URI`, `MONGO_DB` | MongoDB. Vacía = el portafolio responde "no disponible" y el resto funciona |
| `JWT_SECRET` | Firma de tokens (≥32 caracteres) |
| `PASARELA_SECRET` | Secreto compartido para firmar el webhook (HMAC-SHA256) |
| `COOKIE_SECURE` | `true` bajo HTTPS |
| `RETENCION_MINUTOS` | Retención de una reserva sin pago (15) |
| `SEED_PASSWORD` | Clave de las cuentas ficticias (solo `db:seed`) |
| `FRONTEND_DIST` | Carpeta del frontend compilado (producción) |
| `PORTAFOLIO_EN_MEMORIA` | `true` = portafolio en memoria sin MongoDB (solo demostración) |

Si falta una obligatoria, la API no inicia y dice cuál.

## 8. Seguridad aplicada

| Riesgo (Unidad II) | Control | Dónde |
|---|---|---|
| A1 Inyección SQL | Consultas parametrizadas, validación con zod, usuario de BD sin permisos de estructura | `repositories/`, `routes/esquemas.ts`, `001_schema.sql` |
| A2 Monto manipulado | El monto sale del servidor; el webhook compara contra el abono y verifica firma HMAC | `services/pagos.ts` |
| A3 Pagos duplicados | `referencia_externa` única, índice de un solo pago aprobado por cita, una transacción con la cita bloqueada | `services/pagos.ts`, `001_schema.sql` |
| A4 Doble reserva | Bloqueo del profesional en transacción + `EXCLUDE USING gist` | `services/agenda.ts`, `001_schema.sql` |
| A5 Acceso indebido | Rol y propietario en cada endpoint; identidad desde el token | `security/middleware.ts`, `routes/` |
| A6 Fuerza bruta | Bloqueo 15 min tras 5 fallos + límite por IP; error genérico; Argon2id | `services/auth.ts`, `routes/auth.ts` |
| A7 XSS | React escapa la salida, CSP `script-src 'self'`, validación de largo/formato, cookies HttpOnly | `app.ts`, `routes/esquemas.ts` |
| A8 CSRF | Cookies SameSite=Strict + token de doble envío | `security/middleware.ts` |
| A9 Datos en logs/errores | Registro que oculta claves, correos y teléfonos; errores genéricos con código de referencia | `util/log.ts`, `security/errores.ts` |
| A10 Caída de pasarela | Reserva retenida 15 min, mensaje con Reintentar | P5, E2 |
| A12 Abuso de administración | Mínimo privilegio, perfil autorizado para pagos (se consulta a la BD), auditoría | `middleware.ts`, tabla `auditoria` |

Sesiones: token de acceso de 15 min y token de renovación rotativo (7 días, se guarda solo su hash), ambos en cookies HttpOnly. Secretos solo en variables de entorno (`.env` está en `.gitignore`).

**Dependencias.** `npm audit --omit=dev` en el frontend: 0 vulnerabilidades. En el backend queda una de `zod` (consumo de memoria con colecciones muy grandes); está mitigada porque el cuerpo de las solicitudes se limita a 20 KB y los arreglos tienen máximo. Subir a zod 4 es un cambio mayor que conviene probar aparte. Las vulnerabilidades que reporta `npm audit` (sin `--omit=dev`) son de herramientas de desarrollo (vitest/esbuild) y no llegan a producción.

**Pendiente de la Unidad II que no se implementó:** doble factor para administración y recuperación de contraseña por correo.

## 9. Qué está simulado

- **Pasarela de pago.** `POST /api/pagos/simular`: la clienta elige "aprobado" o "rechazado"; el servidor arma la misma notificación firmada que enviaría la pasarela y la procesa con el mismo código que el webhook real (`POST /api/pagos/webhook`, que sí exige firma). El monto lo fija el servidor. **En producción:** se reemplaza por Flow o Webpay Plus en modo sandbox; la pasarela llama al webhook y la ruta `/simular` se elimina.
- **Correo de confirmación.** Solo deja un registro sin datos personales (`services/notificaciones.ts`). En producción se reemplaza ahí por el proveedor de correo.
- **Datos.** Todos ficticios (`@example.com`, `@rgbeauty.test`). No hay datos reales ni credenciales en el código.

## 10. Respaldo y restauración

```bash
# PostgreSQL
pg_dump "$DATABASE_ADMIN_URL" -Fc -f respaldo_rg_beauty.dump
pg_restore --clean --if-exists -d "$DATABASE_ADMIN_URL" respaldo_rg_beauty.dump
# MongoDB
mongodump --uri "$MONGO_URI" --db rg_beauty --out respaldo_mongo
mongorestore --uri "$MONGO_URI" --nsInclude "rg_beauty.*" respaldo_mongo
```

En Neon y Atlas también hay respaldos administrados desde su panel.

## 11. Colaboración y evidencia de trabajo

El trabajo es individual. Para dejar evidencia verificable, usa git con commits pequeños y descriptivos (`git init`, un commit por funcionalidad: esquema, reserva, pagos, seguridad, frontend, pruebas) y registra las tareas del tablero Scrum de la Unidad II.

## 12. Problemas frecuentes

| Síntoma | Causa y solución |
|---|---|
| `Configuración inválida. Revisa tu archivo .env` | Falta o es corta una variable obligatoria; el mensaje indica cuál |
| `ECONNREFUSED` al iniciar | PostgreSQL no está corriendo: `docker compose up -d` y espera "healthy" |
| `permission denied for table` | El esquema se creó sin dar permisos a `rg_app`: ejecuta `npm run db:reset` (el rol debe existir antes) |
| `extension "btree_gist" is not available` | Usa PostgreSQL 14+ con extensiones estándar (la imagen `postgres:16` y Neon la incluyen) |
| El portafolio dice "no disponible" | `MONGO_URI` vacía o MongoDB apagado; el resto del sistema sigue funcionando |
| "No pudimos verificar tu solicitud" | Falta la cookie CSRF: recarga la página. En desarrollo entra por `localhost:5173` (el proxy mantiene el mismo origen) |
| Las fuentes no cargan | Sin internet se usa la tipografía del sistema; no afecta el funcionamiento |
