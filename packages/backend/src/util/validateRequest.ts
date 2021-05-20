import express from "express";
import { APIValidator } from "@withorbit/api";

type CurriedMiddleware = (validator: APIValidator) => express.RequestHandler;

export const validateRequest: CurriedMiddleware = (validator) => (
  req,
  res,
  next,
) => {
  convertNumbersToPrimitiveType(req.query);

  const validationResult = validator.validateRequest({
    method: req.method,
    path: req.path,
    query: req.query,
    body: req.body,
  });

  if (validationResult === true) {
    next();
  } else {
    res.status(400).send(validationResult);
  }
};

function convertNumbersToPrimitiveType(object: Record<string, unknown>) {
  for (const [key, val] of Object.entries(object)) {
    if (typeof val !== "string") continue;

    if (!isNaN(Number(val))) {
      object[key] = Number(val);
    }
  }
}
