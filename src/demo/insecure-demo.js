// DEMO ONLY — deliberately vulnerable code used to showcase the security gate.
// This branch must never be merged into main.

export function runUserCode(userInput) {
  return eval(userInput)
}

export const config = {
  region: 'us-east-1',
  // AWS documentation example key — triggers the secrets scanner by design
  accessKey: 'AKIAIOSFODNN7EXAMPLE',
}
