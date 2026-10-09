export interface ServiceLogger {
  event(
    name: string,
    fields?: Readonly<Record<string, number | boolean>>,
  ): void;
  error(name: string, error?: unknown): void;
}

const sensitivePattern =
  /authorization|credential|token|ticket|secret|content|document|attachment|url|email|subject|account/i;

export class SafeConsoleLogger implements ServiceLogger {
  event(name: string, fields: Readonly<Record<string, number | boolean>> = {}) {
    assertSafeFields(fields);
    console.info(JSON.stringify({ event: name, ...fields }));
  }

  error(name: string, error?: unknown) {
    console.error(
      JSON.stringify({
        event: name,
        failed: true,
        errorName: error instanceof Error ? error.name : "unknown",
      }),
    );
  }
}

export class MemorySafeLogger implements ServiceLogger {
  readonly lines: string[] = [];

  event(name: string, fields: Readonly<Record<string, number | boolean>> = {}) {
    assertSafeFields(fields);
    this.lines.push(JSON.stringify({ event: name, ...fields }));
  }

  error(name: string, error?: unknown) {
    this.lines.push(
      JSON.stringify({
        event: name,
        failed: true,
        errorName: error instanceof Error ? error.name : "unknown",
      }),
    );
  }
}

function assertSafeFields(fields: Readonly<Record<string, number | boolean>>) {
  for (const [key, value] of Object.entries(fields)) {
    if (sensitivePattern.test(key)) {
      throw new Error(`Sensitive telemetry field rejected: ${key}`);
    }
    if (typeof value !== "number" && typeof value !== "boolean") {
      throw new Error(`Non-scalar telemetry field rejected: ${key}`);
    }
  }
}
