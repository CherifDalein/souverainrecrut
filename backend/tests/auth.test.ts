import request from "supertest";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import app from "../src/app";
import { prismaMock, resetPrismaMock } from "./helpers/prisma-mock";
import { ADMIN } from "./helpers/auth";

const password = "MotDePasse123";
let hashedPassword: string;

const user = () => ({
  id: "user-1",
  firstName: "Awa",
  lastName: "Diallo",
  email: "awa@souverainrecrut.test",
  password: hashedPassword,
  role: "ADMIN",
  createdAt: new Date(),
  updatedAt: new Date(),
});

beforeAll(async () => {
  hashedPassword = await bcrypt.hash(password, 4);
});

beforeEach(() => resetPrismaMock());

describe("POST /v1/auth/login", () => {
  it("retourne un token JWT et l'utilisateur sans mot de passe", async () => {
    prismaMock.user.findUnique.mockResolvedValue(user());

    const res = await request(app)
      .post("/v1/auth/login")
      .send({ email: "awa@souverainrecrut.test", password });

    expect(res.status).toBe(200);
    expect(res.body.data.token).toBeDefined();
    expect(res.body.data.user.password).toBeUndefined();

    const decoded = jwt.verify(
      res.body.data.token,
      process.env.JWT_SECRET as string
    ) as { id: string; role: string };
    expect(decoded.id).toBe("user-1");
    expect(decoded.role).toBe("ADMIN");
  });

  it("refuse un email inconnu (401)", async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .post("/v1/auth/login")
      .send({ email: "inconnu@test.fr", password });

    expect(res.status).toBe(401);
    expect(res.body.error.message).toBe("Email ou mot de passe invalide.");
  });

  it("refuse un mauvais mot de passe (401)", async () => {
    prismaMock.user.findUnique.mockResolvedValue(user());

    const res = await request(app)
      .post("/v1/auth/login")
      .send({ email: "awa@souverainrecrut.test", password: "mauvais" });

    expect(res.status).toBe(401);
  });
});

describe("GET /v1/auth/me", () => {
  it("retourne le profil de l'utilisateur connecté", async () => {
    const { password: _, ...profile } = user();
    prismaMock.user.findUnique.mockResolvedValue(profile);

    const res = await request(app)
      .get("/v1/auth/me")
      .set("Authorization", ADMIN());

    expect(res.status).toBe(200);
    expect(res.body.data.email).toBe("awa@souverainrecrut.test");
    expect(prismaMock.user.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "admin-1" } })
    );
  });

  it("retourne 404 si l'utilisateur n'existe plus", async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .get("/v1/auth/me")
      .set("Authorization", ADMIN());

    expect(res.status).toBe(404);
  });

  it("refuse une requête sans token (401)", async () => {
    const res = await request(app).get("/v1/auth/me");

    expect(res.status).toBe(401);
    expect(res.body.error.message).toBe("Authentification requise.");
  });

  it("refuse un header qui n'est pas de type Bearer (401)", async () => {
    const res = await request(app)
      .get("/v1/auth/me")
      .set("Authorization", "Basic abc123");

    expect(res.status).toBe(401);
    expect(res.body.error.message).toBe("Token invalide.");
  });

  it("refuse un token signé avec une autre clé (401)", async () => {
    const forged = jwt.sign({ id: "x", role: "ADMIN" }, "mauvaise-cle");

    const res = await request(app)
      .get("/v1/auth/me")
      .set("Authorization", `Bearer ${forged}`);

    expect(res.status).toBe(401);
    expect(res.body.error.message).toBe("Token invalide ou expiré.");
  });

  it("refuse un token expiré (401)", async () => {
    const expired = jwt.sign(
      { id: "x", role: "ADMIN" },
      process.env.JWT_SECRET as string,
      { expiresIn: -10 }
    );

    const res = await request(app)
      .get("/v1/auth/me")
      .set("Authorization", `Bearer ${expired}`);

    expect(res.status).toBe(401);
  });
});
