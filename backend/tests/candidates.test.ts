import request from "supertest";
import app from "../src/app";
import { prismaMock, resetPrismaMock } from "./helpers/prisma-mock";
import { ADMIN, RECRUITER } from "./helpers/auth";

const candidate = {
  id: "cand-1",
  fullName: "Mamadou Bah",
  email: "mamadou@test.fr",
  phone: "0612345678",
};

beforeEach(() => resetPrismaMock());

describe("Candidats", () => {
  it("GET /v1/candidates liste les candidats avec pagination", async () => {
    prismaMock.candidate.findMany.mockResolvedValue([candidate]);
    prismaMock.candidate.count.mockResolvedValue(25);

    const res = await request(app)
      .get("/v1/candidates?page=2&limit=10")
      .set("Authorization", RECRUITER());

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.pagination).toEqual({
      page: 2,
      limit: 10,
      total: 25,
      totalPages: 3,
    });
    expect(prismaMock.candidate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 10, take: 10 })
    );
  });

  it("GET /v1/candidates/:id retourne un candidat", async () => {
    prismaMock.candidate.findUnique.mockResolvedValue(candidate);

    const res = await request(app)
      .get("/v1/candidates/cand-1")
      .set("Authorization", RECRUITER());

    expect(res.status).toBe(200);
    expect(res.body.data.fullName).toBe("Mamadou Bah");
  });

  it("GET /v1/candidates/:id retourne 404 si introuvable", async () => {
    prismaMock.candidate.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .get("/v1/candidates/inconnu")
      .set("Authorization", RECRUITER());

    expect(res.status).toBe(404);
    expect(res.body.error.message).toBe("Candidat introuvable.");
  });

  it("POST /v1/candidates crée un candidat (email normalisé)", async () => {
    prismaMock.candidate.findUnique.mockResolvedValue(null);
    prismaMock.candidate.create.mockResolvedValue(candidate);

    const res = await request(app)
      .post("/v1/candidates")
      .set("Authorization", RECRUITER())
      .send({ fullName: "Mamadou Bah", email: "MAMADOU@TEST.FR" });

    expect(res.status).toBe(201);
    expect(prismaMock.candidate.create).toHaveBeenCalledWith({
      data: { fullName: "Mamadou Bah", email: "mamadou@test.fr" },
    });
  });

  it("POST /v1/candidates refuse un email déjà utilisé (409)", async () => {
    prismaMock.candidate.findUnique.mockResolvedValue(candidate);

    const res = await request(app)
      .post("/v1/candidates")
      .set("Authorization", RECRUITER())
      .send({ fullName: "Mamadou Bah", email: "mamadou@test.fr" });

    expect(res.status).toBe(409);
    expect(prismaMock.candidate.create).not.toHaveBeenCalled();
  });

  it("POST /v1/candidates refuse des données invalides (400)", async () => {
    const res = await request(app)
      .post("/v1/candidates")
      .set("Authorization", RECRUITER())
      .send({ fullName: "Ab", email: "pas-un-email" });

    expect(res.status).toBe(400);
    const fields = res.body.error.details.map((d: { field: string }) => d.field);
    expect(fields).toEqual(expect.arrayContaining(["fullName", "email"]));
  });

  it("PUT /v1/candidates/:id met à jour un candidat", async () => {
    prismaMock.candidate.findUnique.mockResolvedValue(candidate);
    prismaMock.candidate.update.mockResolvedValue({
      ...candidate,
      phone: "0699999999",
    });

    const res = await request(app)
      .put("/v1/candidates/cand-1")
      .set("Authorization", RECRUITER())
      .send({ phone: "0699999999" });

    expect(res.status).toBe(200);
    expect(res.body.data.phone).toBe("0699999999");
  });

  it("PUT /v1/candidates/:id retourne 404 si introuvable", async () => {
    prismaMock.candidate.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .put("/v1/candidates/inconnu")
      .set("Authorization", RECRUITER())
      .send({ phone: "0699999999" });

    expect(res.status).toBe(404);
    expect(prismaMock.candidate.update).not.toHaveBeenCalled();
  });

  it("DELETE /v1/candidates/:id supprime un candidat (ADMIN)", async () => {
    prismaMock.candidate.findUnique.mockResolvedValue(candidate);
    prismaMock.candidate.delete.mockResolvedValue(candidate);

    const res = await request(app)
      .delete("/v1/candidates/cand-1")
      .set("Authorization", ADMIN());

    expect(res.status).toBe(200);
    expect(prismaMock.candidate.delete).toHaveBeenCalledWith({
      where: { id: "cand-1" },
    });
  });
});
