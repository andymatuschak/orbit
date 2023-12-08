import functions from "firebase-functions";
import { createAPIApp } from "../api.js";

export const api = functions
  .runWith({ memory: "1GB" })
  .https.onRequest(createAPIApp());
