/**
 * Mock du client Prisma.
 * Le module src/config/prisma est remplacé par ce fichier
 * (voir jest.config.js → moduleNameMapper), ce qui permet
 * d'exécuter les tests sans PostgreSQL dans la pipeline.
 */
const model = () => ({
  findMany: jest.fn(),
  findUnique: jest.fn(),
  count: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
});

export const prisma = {
  user: model(),
  candidate: model(),
  job: model(),
  application: model(),
  $queryRaw: jest.fn(),
};

export const prismaMock = prisma;

export function resetPrismaMock(): void {
  for (const value of Object.values(prisma)) {
    if (typeof value === "function") {
      (value as jest.Mock).mockReset();
    } else {
      Object.values(value).forEach((fn) => (fn as jest.Mock).mockReset());
    }
  }
}
