// Keep all web Automerge code behind one async module boundary. Multiple lazy
// chunks sharing the Wasm runtime are otherwise hoisted into Metro's eagerly
// loaded common bundle, including for the signed-out embed shell.
export { tryOpenHostedReviewDatabase } from "../sync/openHostedReviewDatabase.js";
