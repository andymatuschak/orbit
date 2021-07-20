import * as functions from "firebase-functions";
import { createAPIApp } from "../api";

export const api = functions
  .runWith({ memory: "1GB" })
  .https.onRequest(createAPIApp());
