declare global {
  interface Response {
    ok: boolean;
    status: number;
    json(): Promise<unknown>;
    text(): Promise<string>;
  }
}

export {};

