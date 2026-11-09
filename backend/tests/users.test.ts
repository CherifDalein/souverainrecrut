import request from "supertest";
import bcrypt from "bcrypt";
import app from "../src/app";
import { prismaMock, resetPrismaMock } from "./helpers/prisma-mock";
import { ADMIN } from "./helpers/auth";

const user = {
  id: "user-2",
  firstName: "Fatou",
  lastName: "Camara",
  email: "fatou@test.fr",
  role: "RECRUITER",
};

beforeEach(() => resetPrismaMock());

describe("Utilisateurs (ADMIN)", () => {
  it("GET /v1/users liste les utilisateurs", async () => {
    prismaMock.user.findMany.mockResolvedValue([user]);
    prismaMock.user.count.mockResolvedValue(1);

    const res = await request(app)
      .get("/v1/users")
      .set("Authorization", ADMIN());

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
  });

  it("GET /v1/users/:id retourne un utilisateur", async () => {
    prismaMock.user.findUnique.mockResolvedValue(user);

    const res = await request(app)
      .get("/v1/users/user-2")
      .set("Authorization", ADMIN());

    expect(res.status).toBe(200);
    expect(res.body.data.email).toBe("fatou@test.fr");
  });

  it("GET /v1/users/:id retourne 404 si introuvable", async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .get("/v1/users/inconnu")
      .set("Authorization", ADMIN());

    expect(res.status).toBe(404);
  });

  it("POST /v1/users crée un utilisateur avec un mot de passe haché", async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);
    prismaMock.user.create.mockImplementation(async ({ data }) => ({
      id: "user-3",
      ...data,
    }));

    const res = await request(app)
      .post("/v1/users")
      .set("Authorization", ADMIN())
      .send({
        firstName: "Ibrahima",
        lastName: "Sow",
        email: "ibrahima@test.fr",
        password: "MotDePasse123",
        role: "RECRUITER",
      });

    expect(res.status).toBe(201);
    const saved = prismaMock.user.create.mock.calls[0][0].data;
    expect(saved.password).not.toBe("MotDePasse123");
    await expect(bcrypt.compare("MotDePasse123", saved.password)).resolves.toBe(true);
  });

  it("POST /v1/users refuse un email déjà utilisé (409)", async () => {
    prismaMock.user.findUnique.mockResolvedValue(user);

    const res = await request(app)
      .post("/v1/users")
      .set("Authorization", ADMIN())
      .send({
        firstName: "Fatou",
        lastName: "Camara",
        email: "fatou@test.fr",
        password: "MotDePasse123",
      });

    expect(res.status).toBe(409);
    expect(prismaMock.user.create).not.toHaveBeenCalled();
  });

  it("POST /v1/users refuse un mot de passe trop court (400)", async () => {
    const res = await request(app)
      .post("/v1/users")
      .set("Authorization", ADMIN())
      .send({
        firstName: "Fatou",
        lastName: "Camara",
        email: "fatou@test.fr",
        password: "court",
      });

    expect(res.status).toBe(400);
  });

  it("PUT /v1/users/:id met à jour un utilisateur", async () => {
    prismaMock.user.findUnique.mockResolvedValue(user);
    prismaMock.user.update.mockResolvedValue({ ...user, lastName: "Barry" });

    const res = await request(app)
      .put("/v1/users/user-2")
      .set("Authorization", ADMIN())
      .send({ lastName: "Barry" });

    expect(res.status).toBe(200);
    expect(res.body.data.lastName).toBe("Barry");
  });

  it("DELETE /v1/users/:id supprime un utilisateur", async () => {
    prismaMock.user.findUnique.mockResolvedValue(user);
    prismaMock.user.delete.mockResolvedValue(user);

    const res = await request(app)
      .delete("/v1/users/user-2")
      .set("Authorization", ADMIN());

    expect(res.status).toBe(200);
  });
});
