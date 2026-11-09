import request from "supertest";
import app from "../src/app";
import { prismaMock, resetPrismaMock } from "./helpers/prisma-mock";
import { ADMIN, RECRUITER } from "./helpers/auth";

const job = {
  id: "job-1",
  title: "Développeur Backend",
  description: "API Node.js, Express et PostgreSQL",
  location: "Rennes",
  company: "SouverainRecrut",
  recruiterId: "recruiter-1",
};

const { id: _, ...jobInput } = job;

beforeEach(() => resetPrismaMock());

describe("Offres d'emploi", () => {
  it("GET /v1/jobs liste les offres (pagination par défaut)", async () => {
    prismaMock.job.findMany.mockResolvedValue([job]);
    prismaMock.job.count.mockResolvedValue(1);

    const res = await request(app)
      .get("/v1/jobs")
      .set("Authorization", RECRUITER());

    expect(res.status).toBe(200);
    expect(res.body.pagination).toEqual({
      page: 1,
      limit: 10,
      total: 1,
      totalPages: 1,
    });
  });

  it("GET /v1/jobs/:id retourne une offre", async () => {
    prismaMock.job.findUnique.mockResolvedValue(job);

    const res = await request(app)
      .get("/v1/jobs/job-1")
      .set("Authorization", RECRUITER());

    expect(res.status).toBe(200);
    expect(res.body.data.title).toBe("Développeur Backend");
  });

  it("GET /v1/jobs/:id retourne 404 si introuvable", async () => {
    prismaMock.job.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .get("/v1/jobs/inconnu")
      .set("Authorization", RECRUITER());

    expect(res.status).toBe(404);
    expect(res.body.error.message).toBe("Offre introuvable.");
  });

  it("POST /v1/jobs crée une offre", async () => {
    prismaMock.job.create.mockResolvedValue(job);

    const res = await request(app)
      .post("/v1/jobs")
      .set("Authorization", RECRUITER())
      .send(jobInput);

    expect(res.status).toBe(201);
    expect(prismaMock.job.create).toHaveBeenCalledWith({ data: jobInput });
  });

  it("POST /v1/jobs refuse une offre incomplète (400)", async () => {
    const res = await request(app)
      .post("/v1/jobs")
      .set("Authorization", RECRUITER())
      .send({ title: "Dev" });

    expect(res.status).toBe(400);
    expect(prismaMock.job.create).not.toHaveBeenCalled();
  });

  it("PUT /v1/jobs/:id met à jour une offre", async () => {
    prismaMock.job.findUnique.mockResolvedValue(job);
    prismaMock.job.update.mockResolvedValue({ ...job, location: "Paris" });

    const res = await request(app)
      .put("/v1/jobs/job-1")
      .set("Authorization", RECRUITER())
      .send({ location: "Paris" });

    expect(res.status).toBe(200);
    expect(res.body.data.location).toBe("Paris");
  });

  it("DELETE /v1/jobs/:id supprime une offre (ADMIN)", async () => {
    prismaMock.job.findUnique.mockResolvedValue(job);
    prismaMock.job.delete.mockResolvedValue(job);

    const res = await request(app)
      .delete("/v1/jobs/job-1")
      .set("Authorization", ADMIN());

    expect(res.status).toBe(200);
  });

  it("DELETE /v1/jobs/:id retourne 404 si introuvable", async () => {
    prismaMock.job.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .delete("/v1/jobs/inconnu")
      .set("Authorization", ADMIN());

    expect(res.status).toBe(404);
    expect(prismaMock.job.delete).not.toHaveBeenCalled();
  });
});
