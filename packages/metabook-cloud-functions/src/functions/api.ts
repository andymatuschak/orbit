import * as functions from "firebase-functions";
import { createAPIApp } from "../api";

export const api = functions.https.onRequest(createAPIApp());
