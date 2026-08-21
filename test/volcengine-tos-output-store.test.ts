import { describe, expect, it } from "vitest";
import {
  VolcengineTosOutputStore,
  parseVolcengineVodStoreUri,
} from "../src/providers/volcengine-tos-output-store.js";

describe("parseVolcengineVodStoreUri", () => {
  it("splits VOD bucket and object keys without losing nested paths", () => {
    expect(
      parseVolcengineVodStoreUri("tos://tos-vod-cn-v-example/folder/output-file.mp4"),
    ).toEqual({
      bucket: "tos-vod-cn-v-example",
      key: "folder/output-file.mp4",
    });
  });

  it("creates a public TOS signed URL for a VOD-managed object", () => {
    const store = new VolcengineTosOutputStore({
      accessKeyId: "test-access-key",
      secretAccessKey: "test-secret-key",
      region: "cn-beijing",
      endpoint: "tos-cn-beijing.volces.com",
    });

    const signed = new URL(
      store.signRead("tos-vod-cn-v-example/folder/output.mp4", 3_600),
    );

    expect(signed.host).toBe("tos-vod-cn-v-example.tos-cn-beijing.volces.com");
    expect(signed.pathname).toBe("/folder/output.mp4");
    expect(signed.searchParams.get("X-Tos-Expires")).toBe("3600");
    expect(signed.searchParams.get("X-Tos-Credential")).toContain("test-access-key/");
    expect(signed.toString()).not.toContain("test-secret-key");
  });

  it("rejects missing bucket or object keys", () => {
    expect(() => parseVolcengineVodStoreUri("missing-slash")).toThrow(
      "bucket/object-key",
    );
    expect(() => parseVolcengineVodStoreUri("/object.mp4")).toThrow(
      "bucket/object-key",
    );
    expect(() => parseVolcengineVodStoreUri("bucket/")).toThrow("bucket/object-key");
  });
});
