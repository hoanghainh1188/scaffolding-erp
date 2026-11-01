// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ErrorReporter } from "./error-reporter";

describe("ErrorReporter component", () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;
  let sendBeaconSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response());
    sendBeaconSpy = vi.fn().mockReturnValue(true);
    Object.defineProperty(navigator, "sendBeacon", {
      value: sendBeaconSpy,
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    fetchSpy.mockRestore();
    vi.restoreAllMocks();
  });

  it("captures unhandled error event and dispatches report", () => {
    const { unmount } = render(<ErrorReporter />);

    const errorEvent = new ErrorEvent("error", {
      message: "Uncaught script error",
      error: new Error("Test unhandled error"),
    });

    window.dispatchEvent(errorEvent);

    expect(sendBeaconSpy).toHaveBeenCalledTimes(1);
    const call1 = sendBeaconSpy.mock.calls[0];
    expect(call1).toBeDefined();
    expect(call1![0]).toBe("/api/telemetry/errors");

    unmount();
  });

  it("captures unhandled promise rejection event and dispatches report", () => {
    const { unmount } = render(<ErrorReporter />);

    const rejectionEvent = new Event("unhandledrejection") as PromiseRejectionEvent;
    Object.defineProperty(rejectionEvent, "reason", {
      value: new Error("Unhandled async rejection"),
    });

    window.dispatchEvent(rejectionEvent);

    expect(sendBeaconSpy).toHaveBeenCalledTimes(1);
    const call2 = sendBeaconSpy.mock.calls[0];
    expect(call2).toBeDefined();
    expect(call2![0]).toBe("/api/telemetry/errors");

    unmount();
  });

  it("debounces rapid duplicate errors", () => {
    const { unmount } = render(<ErrorReporter />);

    const errorEvent = new ErrorEvent("error", {
      message: "Spamming error",
      error: new Error("Spamming error"),
    });

    window.dispatchEvent(errorEvent);
    window.dispatchEvent(errorEvent);
    window.dispatchEvent(errorEvent);

    expect(sendBeaconSpy).toHaveBeenCalledTimes(1);

    unmount();
  });

  it("removes event listeners on unmount", () => {
    const removeSpy = vi.spyOn(window, "removeEventListener");
    const { unmount } = render(<ErrorReporter />);
    unmount();

    expect(removeSpy).toHaveBeenCalledWith("error", expect.any(Function));
    expect(removeSpy).toHaveBeenCalledWith(
      "unhandledrejection",
      expect.any(Function),
    );

    removeSpy.mockRestore();
  });
});
