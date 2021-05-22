import express from "express";
import { APIValidator } from "@withorbit/api";

type CurriedMiddleware = (validator: APIValidator) => express.RequestHandler;

export const validateRequest: CurriedMiddleware = (validator) => (
  req,
  res,
  next,
) => {
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
