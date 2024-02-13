import express from "express";
import cors from "cors";

const corsHandler: express.RequestHandler = cors({
  origin: [
    /\.withorbit.com$/,
    /^https?:\/\/localhost(:\d+)?$/,
    // HACK for fall 2022 prototype
    "https://orbit-app--fall-2022-yzhqe6jr.web.app",
    "https://orbit-mk.vercel.app",
  ],
});
export default corsHandler;
