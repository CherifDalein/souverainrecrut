/** @type {import('jest').Config} */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>/tests"],
  setupFiles: ["<rootDir>/tests/setup.ts"],
  testPathIgnorePatterns: ["/node_modules/", "/tests/helpers/", "/tests/setup.ts"],
  // Prisma est remplacé par un mock : aucun PostgreSQL requis dans la CI
  moduleNameMapper: {
    "^(\\.{1,2}/)+config/prisma$": "<rootDir>/tests/helpers/prisma-mock.ts",
  },
  clearMocks: true,
  transform: {
    "^.+\\.ts$": ["ts-jest", { tsconfig: "tsconfig.test.json" }],
  },
  collectCoverageFrom: [
    "src/**/*.ts",
    "!src/server.ts",
    "!src/docs/**",
    "!src/swagger/**",
  ],
  coverageDirectory: "coverage",
  coverageReporters: ["text", "lcov"],
  // Rapport d'exécution des tests au format Generic Test Data de SonarQube
  reporters: [
    "default",
    ["jest-sonar", { outputDirectory: "coverage", outputName: "test-report.xml" }],
  ],
};
