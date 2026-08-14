import { Command } from "commander";
import { describe, expect, it } from "vitest";
import { buildProgram } from "../index.js";
import { projectCli } from "./docs-bundle-projector.js";

describe("docs bundle nested CLI projection", () => {
  it("recursively projects every canonical run subcommand", () => {
    const commands = projectCli(buildProgram()).commands;
    expect(commands.filter(({ path }) => path.startsWith("ariadnev run ")).map(({ path }) => path)).toEqual([
      "ariadnev run cancel",
      "ariadnev run resume",
      "ariadnev run status",
    ]);
    expect(commands.find(({ path }) => path === "ariadnev run resume")).toMatchObject({
      description: "Resume a durable run with the original graph and runtime identity",
      arguments: [{ name: "run-id", required: true, variadic: false, description: "existing run ID" }],
    });
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
