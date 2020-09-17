import express from "express";
import cors from "cors";

const corsHandler: express.RequestHandler = cors({
  origin: /(\.withorbit.com$)|(^https?:\/\/localhost(:\d+)?$)/,
});
export default corsHandler;
