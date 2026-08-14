export function recover(events) {
  const effects = [];
  for (const event of events) {
    if (event.type === "effect-applied") effects.push(event.key);
  }
  return effects;
}
