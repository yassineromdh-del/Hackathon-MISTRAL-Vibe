// DEMO ONLY — deliberately vulnerable code used to showcase the security gate.
// This branch must never be merged into main.

export function runUserCode(userInput) {
  return eval(userInput)
}

export const config = {
  region: 'us-east-1',
  // Fabricated key (not real) — realistic enough to trigger the secrets scanner
  accessKey: 'AKIAP81IEHNJX9BIA5IH',
}
