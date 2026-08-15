import { describe, it, expect } from "vitest";
import { evaluateMarker, markerEnvironment, MarkerError } from "./marker.js";

const MAC = markerEnvironment("3.11.9", "darwin", "arm64");
const WIN = markerEnvironment("3.11.9", "win32", "x64");
const LINUX = markerEnvironment("3.9.18", "linux", "x64");

describe("evaluateMarker", () => {
  it("keeps a Windows-only package off macOS and on Windows", () => {
    // Without this, `mcp`'s lock asks pip to install pywin32 on a Mac. There is
    // no such distribution for the platform, so the whole environment fails to
    // build — one marker away from a lock that works nowhere but Windows.
    expect(evaluateMarker("sys_platform == 'win32'", MAC)).toBe(false);
    expect(evaluateMarker("sys_platform == 'win32'", WIN)).toBe(true);
  });

  it("treats no marker as applying everywhere", () => {
    expect(evaluateMarker(undefined, MAC)).toBe(true);
    expect(evaluateMarker("  ", MAC)).toBe(true);
  });

  it("orders python versions as versions, not as strings", () => {
    // "3.9" > "3.10" lexically, and a lock that believes that installs the
    // wrong backports on the wrong interpreter.
    expect(evaluateMarker("python_version >= '3.10'", LINUX)).toBe(false);
    expect(evaluateMarker("python_version >= '3.10'", MAC)).toBe(true);
    expect(evaluateMarker("python_full_version < '3.11'", LINUX)).toBe(true);
  });

  it("handles and, or, negation and grouping", () => {
    expect(evaluateMarker("implementation_name != 'PyPy' and platform_python_implementation != 'PyPy'", MAC)).toBe(true);
    expect(evaluateMarker("sys_platform == 'win32' or sys_platform == 'darwin'", MAC)).toBe(true);
    expect(evaluateMarker("(sys_platform == 'win32' or sys_platform == 'linux') and python_version >= '3.11'", MAC)).toBe(
      false,
    );
    expect(evaluateMarker("python_full_version >= '3.12' and sys_platform == 'emscripten'", MAC)).toBe(false);
  });

  it("supports membership and compatible-release comparisons", () => {
    expect(evaluateMarker("sys_platform in 'linux darwin'", MAC)).toBe(true);
    expect(evaluateMarker("sys_platform not in 'linux darwin'", MAC)).toBe(false);
    expect(evaluateMarker("python_version ~= '3.11'", MAC)).toBe(true);
    expect(evaluateMarker("python_version ~= '3.12'", MAC)).toBe(false);
  });

  it("refuses a marker it cannot answer rather than guessing", () => {
    // The answer decides whether a package is installed; a guess there is worse
    // than a stop.
    expect(() => evaluateMarker("sys_platform > 'darwin'", MAC)).toThrow(MarkerError);
    expect(() => evaluateMarker("weather == 'sunny'", MAC)).toThrow(/unknown marker variable/);
    expect(() => evaluateMarker("sys_platform ==", MAC)).toThrow(MarkerError);
    expect(() => evaluateMarker("(sys_platform == 'darwin'", MAC)).toThrow(/unbalanced/);
    expect(() => evaluateMarker("sys_platform == 'darwin'))", MAC)).toThrow(MarkerError);
    expect(() => evaluateMarker("sys_platform == 'darwin", MAC)).toThrow(/unterminated/);
    expect(() => evaluateMarker("sys_platform === 'darwin' not", MAC)).toThrow(/"not" must be followed by "in"/);
    expect(() => evaluateMarker("sys_platform == 'darwin' and", MAC)).toThrow(/ended early/);
    expect(() => evaluateMarker("sys_platform @ 'darwin'", MAC)).toThrow(/cannot read marker/);
  });
});

describe("markerEnvironment", () => {
  it("names the machine the way Python names it, per platform", () => {
    expect(markerEnvironment("3.12.0", "darwin", "arm64").platform_machine).toBe("arm64");
    expect(markerEnvironment("3.12.0", "linux", "arm64").platform_machine).toBe("aarch64");
    expect(markerEnvironment("3.12.0", "linux", "x64").platform_machine).toBe("x86_64");
    expect(markerEnvironment("3.12.0", "win32", "x64").platform_machine).toBe("AMD64");
  });

  it("derives the version pair from the full version", () => {
    const env = markerEnvironment("3.14.6", "darwin", "arm64");
    expect(env.python_version).toBe("3.14");
    expect(env.python_full_version).toBe("3.14.6");
    expect(env.os_name).toBe("posix");
    expect(env.platform_system).toBe("Darwin");
    expect(env.implementation_name).toBe("cpython");
  });
});
