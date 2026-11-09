import request from "supertest";
import { Request, Response } from "express";
import app from "../src/app";
import { authorize } from "../src/middlewares/authorize.middleware";
import { AppError } from "../src/errors/app.error";
import { prismaMock, resetPrismaMock } from "./helpers/prisma-mock";
import { ADMIN, RECRUITER } from "./helpers/auth";

beforeEach(() => resetPrismaMock());

describe("Contrôle d'accès : routes protégées sans token (401)", () => {
  it.each([
    ["get", "/v1/users"],
    ["get", "/v1/candidates"],
    ["get", "/v1/jobs"],
    ["get", "/v1/applications"],
    ["get", "/v1/dashboard/stats"],
    ["post", "/v1/candidates"],
  ] as const)("%s %s", async (method, url) => {
    const res = await request(app)[method](url);

    expect(res.status).toBe(401);
  });
});

describe("Contrôle d'accès : RECRUITER (403 sur les actions ADMIN)", () => {
  it.each([
    ["get", "/v1/users"],
    ["delete", "/v1/candidates/cand-1"],
    ["delete", "/v1/jobs/job-1"],
    ["delete", "/v1/applications/app-1"],
  ] as const)("%s %s est interdit", async (method, url) => {
    const res = await request(app)[method](url).set("Authorization", RECRUITER());

    expect(res.status).toBe(403);
    expect(res.body.error.message).toBe(
      "Accès refusé. Permissions insuffisantes."
    );
  });

  it("aucune requête en base n'est faite quand l'accès est refusé", async () => {
    await request(app)
      .delete("/v1/candidates/cand-1")
      .set("Authorization", RECRUITER());

    expect(prismaMock.candidate.findUnique).not.toHaveBeenCalled();
    expect(prismaMock.candidate.delete).not.toHaveBeenCalled();
  });
});

describe("Contrôle d'accès : ADMIN", () => {
  it("peut lister les utilisateurs", async () => {
    prismaMock.user.findMany.mockResolvedValue([]);
    prismaMock.user.count.mockResolvedValue(0);

    const res = await request(app)
      .get("/v1/users")
      .set("Authorization", ADMIN());

    expect(res.status).toBe(200);
  });
});

describe("Middleware authorize", () => {
  it("renvoie 401 si aucun utilisateur n'est attaché à la requête", () => {
    const next = jest.fn();

    authorize("ADMIN")({} as Request, {} as Response, next);

    const error = next.mock.calls[0][0] as AppError;
    expect(error).toBeInstanceOf(AppError);
    expect(error.statusCode).toBe(401);
  });
});
