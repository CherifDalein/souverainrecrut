import request from "supertest";
import app from "../src/app";
import { prismaMock, resetPrismaMock } from "./helpers/prisma-mock";

beforeEach(() => resetPrismaMock());

describe("Endpoints publics", () => {
  it("GET / retourne le message de bienvenue", async () => {
    const res = await request(app).get("/");

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.api).toBe("/v1");
  });

  it("GET /v1/health retourne 200 et le statut UP", async () => {
    const res = await request(app).get("/v1/health");

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe("UP");
  });

  it("GET /v1/info retourne les informations de l'API", async () => {
    const res = await request(app).get("/v1/info");

    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe("SouverainRecrut API");
    expect(res.body.data.health).toBe("/v1/health");
  });

  it("GET /v1/ready retourne 200 quand la base répond", async () => {
    prismaMock.$queryRaw.mockResolvedValue([{ "?column?": 1 }]);

    const res = await request(app).get("/v1/ready");

    expect(res.status).toBe(200);
    expect(res.body.data.database).toBe("CONNECTED");
  });

  it("GET /v1/ready retourne 503 quand la base est indisponible", async () => {
    prismaMock.$queryRaw.mockRejectedValue(new Error("connexion refusée"));

    const res = await request(app).get("/v1/ready");

    expect(res.status).toBe(503);
    expect(res.body.success).toBe(false);
    expect(res.body.data.database).toBe("DISCONNECTED");
  });

  it("retourne 404 pour une route inconnue", async () => {
    const res = await request(app).get("/v1/route-inexistante");

    expect(res.status).toBe(404);
    expect(res.body.error.message).toContain("/v1/route-inexistante");
  });
});
