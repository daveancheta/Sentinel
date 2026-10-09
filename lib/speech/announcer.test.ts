import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../db", () => ({ getSetting: vi.fn(async (_key: string, fallback: unknown) => fallback), setSetting: vi.fn(async () => {}) }));
vi.mock("../audio/earcons", () => ({ playEarcon: vi.fn() }));

class FakeUtterance {
  onend: (() => void) | null = null;
  onerror: (() => void) | null = null;
  voice: unknown = null;
  lang = "";
  rate = 1;
  pitch = 1;
  volume = 1;
  constructor(public text: string) {}
}

let spoken: FakeUtterance[];
let cancel: ReturnType<typeof vi.fn>;
let announcer: typeof import("./announcer");

describe("announcer queue", () => {
  beforeEach(async () => {
    vi.resetModules();
    vi.stubGlobal("SpeechSynthesisUtterance", FakeUtterance);
    spoken = [];
    cancel = vi.fn();
    vi.stubGlobal("window", { speechSynthesis: { speak: (item: FakeUtterance) => spoken.push(item), cancel, getVoices: () => [], onvoiceschanged: null } });
    announcer = await import("./announcer");
    await announcer.setCooldown(4000);
    await announcer.setQuietMode(false);
  });

  it("places warnings ahead of queued info and danger interrupts speech", () => {
    announcer.announce("current", "INFO");
    announcer.announce("queued info", "INFO");
    announcer.announce("warning", "WARNING");
    spoken[0].onend?.();
    expect(spoken[1].text).toBe("warning");
    announcer.announce("danger", "DANGER");
    expect(cancel).toHaveBeenCalled();
    expect(spoken.at(-1)?.text).toBe("danger");
  });

  it("suppresses duplicate speech within the cooldown", () => {
    announcer.announce("same", "INFO");
    announcer.announce("same", "INFO");
    expect(spoken).toHaveLength(1);
  });
});
