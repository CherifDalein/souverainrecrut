/**
 * Variables d'environnement pour les tests.
 * Chargé avant chaque fichier de test (voir jest.config.js → setupFiles).
 * Aucune vraie base de données n'est utilisée : Prisma est mocké.
 */
process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-secret-not-for-production";
process.env.API_VERSION = "v1";
process.env.DATABASE_URL =
  "postgresql://test:test@localhost:5432/test?schema=public";
