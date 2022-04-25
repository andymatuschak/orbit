import { Ingestible } from "@withorbit/ingester";

export interface Interpreter {
  interpret(files: InterpretableFile[]): Promise<Ingestible>;
}

export type InterpretableFile = {
  name: string;
  path: string;
  content: string;
};
