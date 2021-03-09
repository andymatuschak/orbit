declare module "unified-stream" {
  import unified from "unified";
  import * as events from "events";
  export = createStream;

  function createStream(processor: unified.Processor): events.EventEmitter;
}
