import { describe, expect, it } from "vitest";
import { isSameRequestOrigin } from "./request-origin";

describe("isSameRequestOrigin", () => {
  it("accepts same-host requests when a reverse proxy changes the protocol", () => {
    const headers = new Headers({ host: "app.makka.example:3000", "x-forwarded-host": "app.makka.example" });
    expect(isSameRequestOrigin("https://app.makka.example", new URL("http://app.makka.example:3000/api/ai/chat"), headers)).toBe(true);
  });

  it("accepts the externally forwarded host when the internal host differs", () => {
    const headers = new Headers({ host: "app:3000", "x-forwarded-host": "finance.example.com" });
    expect(isSameRequestOrigin("https://finance.example.com", new URL("http://app:3000/api/ai/chat"), headers)).toBe(true);
  });

  it("rejects unrelated and malformed origins", () => {
    const headers = new Headers({ host: "finance.example.com" });
    const url = new URL("https://finance.example.com/api/ai/chat");
    expect(isSameRequestOrigin("https://attacker.example", url, headers)).toBe(false);
    expect(isSameRequestOrigin("not-an-origin", url, headers)).toBe(false);
  });

  it("continues allowing requests without an Origin header", () => {
    expect(isSameRequestOrigin(null, new URL("http://localhost:3000"), new Headers())).toBe(true);
  });
});
