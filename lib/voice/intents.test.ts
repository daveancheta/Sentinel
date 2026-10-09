import { describe, expect, it } from "vitest";
import { matchVoiceIntent } from "./intents";

describe("voice intent matching", () => {
  it.each([["sino ang nandito", "whosHere"], ["walking mode", "walking"], ["hanap upuan", "seat"], ["banyo", "findCr"], ["room b204", "findRoom"], ["tigil", "stop"], ["repeat", "repeat"]])("matches %s", (phrase, type) => {
    expect(matchVoiceIntent(phrase).intent?.type).toBe(type);
  });
  it("normalizes room identifiers and rejects unknown phrases", () => {
    expect(matchVoiceIntent("kwarto b 204").intent).toEqual({ type: "findRoom", room: "B204" });
    expect(matchVoiceIntent("blue banana").intent).toBeNull();
  });
});
