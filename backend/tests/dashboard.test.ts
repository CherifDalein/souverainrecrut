import request from "supertest";
import app from "../src/app";
import { prismaMock, resetPrismaMock } from "./helpers/prisma-mock";
import { RECRUITER } from "./helpers/auth";

beforeEach(() => resetPrismaMock());

describe("GET /v1/dashboard/stats", () => {
  it("retourne les statistiques globales", async () => {
    prismaMock.user.count.mockResolvedValue(3);
    prismaMock.candidate.count.mockResolvedValue(12);
    prismaMock.job.count.mockResolvedValue(5);
    prismaMock.application.count
      .mockResolvedValueOnce(20) // total
      .mockResolvedValueOnce(7); // en attente

    const res = await request(app)
      .get("/v1/dashboard/stats")
      .set("Authorization", RECRUITER());

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      users: 3,
      candidates: 12,
      jobs: 5,
      applications: 20,
      pendingApplications: 7,
    });
    expect(prismaMock.application.count).toHaveBeenCalledWith({
      where: { status: "PENDING" },
    });
  });
});
