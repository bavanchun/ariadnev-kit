import { Command } from "commander";
import { describe, expect, it } from "vitest";
import { buildProgram } from "../index.js";
import { projectCli } from "./docs-bundle-projector.js";

describe("docs bundle nested CLI projection", () => {
  it("recursively projects every canonical workflow subcommand", () => {
    const commands = projectCli(buildProgram()).commands;
    expect(commands.filter(({ path }) => path.startsWith("ariadnev workflow ")).map(({ path }) => path)).toEqual([
      "ariadnev workflow cancel",
      "ariadnev workflow resume",
      "ariadnev workflow run",
      "ariadnev workflow status",
    ]);
    expect(commands.find(({ path }) => path === "ariadnev workflow resume")).toMatchObject({
      description: "Resume a durable run with the original graph and runtime identity",
      arguments: [{ name: "run-id", required: true, variadic: false, description: "existing run ID" }],
    });
  });

  it("projects `run` as dispatch alone, the harness verbs having gone with the shim", () => {
    // The projection is generated, so a docs bundle that still listed the
    // retired subcommands would document a binary that accepts invocations the
    // real one refuses, and nothing else would notice.
    const commands = projectCli(buildProgram()).commands;
    expect(commands.filter(({ path }) => path.startsWith("ariadnev run ")).map(({ path }) => path)).toEqual([]);
    expect(commands.find(({ path }) => path === "ariadnev run")?.description).toContain("<kit>/<skill>");
  });

  it("walks arbitrary depth while exposing only deterministic public fields", () => {
    const root = new Command().name("root").description("Root");
    const child = root.command("child").alias("c").description("Child");
    child.command("grandchild <item>").alias("g").description("Grandchild").option("--count <n>", "Count", "private-default");

    const projected = projectCli(root);
    expect(projected.commands.map(({ path }) => path)).toEqual(["root", "root child", "root child grandchild"]);
    expect(projected.commands[2]).toEqual({
      path: "root child grandchild",
      aliases: ["g"],
      description: "Grandchild",
      arguments: [{ name: "item", required: true, variadic: false, description: "" }],
      options: [{ flags: "--count <n>", description: "Count", required: true, optionalValue: false, variadic: false, defaultValueShape: "string" }],
    });
    expect(JSON.stringify(projected)).not.toContain("private-default");
  });
});
