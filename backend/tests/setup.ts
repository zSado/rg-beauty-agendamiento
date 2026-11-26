// Variables de entorno SOLO para pruebas. DATABASE_URL viene de .env o del entorno (no se escribe aquí).
// Los secretos de abajo son constantes desechables que solo existen al ejecutar las pruebas.
process.env.NODE_ENV = "test";
process.env.JWT_SECRET ??= "secreto-solo-para-pruebas-0123456789abcdefghij";
process.env.PASARELA_SECRET ??= "secreto-pasarela-solo-pruebas";
process.env.MONGO_URI = ""; // las pruebas usan el repositorio en memoria del portafolio
