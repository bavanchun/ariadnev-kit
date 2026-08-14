import { exec } from "node:child_process";

export function showRevision(revision) {
  return exec(`git show ${revision}`);
}

export function renderMessage(message) {
  return `<section>${message}</section>`;
}
