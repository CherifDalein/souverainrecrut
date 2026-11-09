import { Request, Response } from "express";
import { errorMiddleware } from "../src/middlewares/error.middleware";
import { AppError } from "../src/errors/app.error";
import { getPagination, buildPaginationMeta } from "../src/utils/pagination";

function mockResponse() {
  const res = {} as Response;
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

describe("errorMiddleware", () => {
  it("renvoie le code et le message d'une AppError", () => {
    const res = mockResponse();

    errorMiddleware(new AppError("Interdit", 403), {} as Request, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: { status: 403, message: "Interdit" },
    });
  });

  it("masque les erreurs inattendues derrière une erreur 500", () => {
    const res = mockResponse();
    const spy = jest.spyOn(console, "error").mockImplementation(() => {});

    errorMiddleware(new Error("détail technique"), {} as Request, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: { status: 500, message: "Erreur interne du serveur." },
    });
    spy.mockRestore();
  });
});

describe("Pagination", () => {
  it("applique les valeurs par défaut", () => {
    expect(getPagination()).toEqual({ page: 1, limit: 10, skip: 0 });
  });

  it("borne la page à 1 et la limite entre 1 et 100", () => {
    expect(getPagination("-3", "500")).toEqual({ page: 1, limit: 100, skip: 0 });
    expect(getPagination("3", "0")).toEqual({ page: 3, limit: 1, skip: 2 });
  });

  it("calcule le nombre total de pages", () => {
    expect(buildPaginationMeta(1, 10, 21)).toEqual({
      page: 1,
      limit: 10,
      total: 21,
      totalPages: 3,
    });
  });
});
