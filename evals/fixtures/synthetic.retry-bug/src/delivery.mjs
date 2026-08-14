export async function deliverWithRetry(deliver) {
  try {
    return await deliver();
  } catch {
    return deliver();
  }
}
