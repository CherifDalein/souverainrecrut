import request from "supertest";
import app from "../src/app";
import { ApplicationService } from "../src/services/application.service";
import { prismaMock, resetPrismaMock } from "./helpers/prisma-mock";
import { ADMIN, RECRUITER } from "./helpers/auth";

const application = {
  id: "app-1",
  candidateId: "cand-1",
  jobId: "job-1",
  status: "PENDING",
  candidate: { id: "cand-1", fullName: "Mamadou Bah" },
  job: { id: "job-1", title: "Développeur Backend" },
};

beforeEach(() => resetPrismaMock());

describe("Candidatures", () => {
  it("GET /v1/applications liste les candidatures avec candidat et offre", async () => {
    prismaMock.application.findMany.mockResolvedValue([application]);
    prismaMock.application.count.mockResolvedValue(1);

    const res = await request(app)
      .get("/v1/applications")
      .set("Authorization", RECRUITER());

    expect(res.status).toBe(200);
    expect(res.body.data[0].candidate.fullName).toBe("Mamadou Bah");
    expect(prismaMock.application.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ include: { candidate: true, job: true } })
    );
  });

  it("GET /v1/applications/:id retourne une candidature", async () => {
    prismaMock.application.findUnique.mockResolvedValue(application);

    const res = await request(app)
      .get("/v1/applications/app-1")
      .set("Authorization", RECRUITER());

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe("PENDING");
  });

  it("GET /v1/applications/:id retourne 404 si introuvable", async () => {
    prismaMock.application.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .get("/v1/applications/inconnue")
      .set("Authorization", RECRUITER());

    expect(res.status).toBe(404);
    expect(res.body.error.message).toBe("Candidature introuvable.");
  });

  it("POST /v1/applications crée une candidature", async () => {
    prismaMock.application.create.mockResolvedValue(application);

    const res = await request(app)
      .post("/v1/applications")
      .set("Authorization", RECRUITER())
      .send({ candidateId: "cand-1", jobId: "job-1" });

    expect(res.status).toBe(201);
    expect(res.body.data.id).toBe("app-1");
  });

  it("POST /v1/applications refuse un statut inconnu (400)", async () => {
    const res = await request(app)
      .post("/v1/applications")
      .set("Authorization", RECRUITER())
      .send({ candidateId: "cand-1", jobId: "job-1", status: "INCONNU" });

    expect(res.status).toBe(400);
  });

  it("PUT /v1/applications/:id change le statut", async () => {
    prismaMock.application.findUnique.mockResolvedValue(application);
    prismaMock.application.update.mockResolvedValue({
      ...application,
      status: "ACCEPTED",
    });

    const res = await request(app)
      .put("/v1/applications/app-1")
      .set("Authorization", RECRUITER())
      .send({ status: "ACCEPTED" });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe("ACCEPTED");
  });

  it("PUT /v1/applications/:id exige un statut (400)", async () => {
    const res = await request(app)
      .put("/v1/applications/app-1")
      .set("Authorization", RECRUITER())
      .send({});

    expect(res.status).toBe(400);
  });

  it("DELETE /v1/applications/:id supprime une candidature (ADMIN)", async () => {
    prismaMock.application.findUnique.mockResolvedValue(application);
    prismaMock.application.delete.mockResolvedValue(application);

    const res = await request(app)
      .delete("/v1/applications/app-1")
      .set("Authorization", ADMIN());

    expect(res.status).toBe(200);
  });
});

describe("ApplicationService.updateStatus", () => {
  const service = new ApplicationService();

  it("met à jour le statut d'une candidature existante", async () => {
    prismaMock.application.findUnique.mockResolvedValue(application);
    prismaMock.application.update.mockResolvedValue({
      ...application,
      status: "REJECTED",
    });

    const result = await service.updateStatus("app-1", "REJECTED");

    expect(result.status).toBe("REJECTED");
    expect(prismaMock.application.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "REJECTED" } })
    );
  });

  it("lève une erreur 404 si la candidature n'existe pas", async () => {
    prismaMock.application.findUnique.mockResolvedValue(null);

    await expect(
      service.updateStatus("inconnue", "REJECTED")
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});
