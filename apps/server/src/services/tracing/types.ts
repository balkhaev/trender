export type SpanKind =
  | "internal"
  | "server"
  | "client"
  | "producer"
  | "consumer";
export type SpanStatus = "unset" | "ok" | "error";

export type TraceContext = {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
};

export type SpanOptions = {
  name: string;
  kind?: SpanKind;
  service?: string;
  parentSpanId?: string;
  attributes?: Record<string, unknown>;
};

export type SpanHandle = {
  spanId: string;
  traceId: string;
  addEvent: (name: string, attributes?: Record<string, unknown>) => void;
  setAttribute: (key: string, value: unknown) => void;
  setStatus: (status: SpanStatus, errorMessage?: string) => void;
  end: () => Promise<void>;
};

export type StartTraceOptions = {
  name: string;
  traceId?: string;
  rootService?: string;
  rootPath?: string;
  userId?: string;
  metadata?: Record<string, unknown>;
};
