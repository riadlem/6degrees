const SUSPICIOUS_NAMES = new Set([
  "nda","n/a","na","n/d","nd","tbd","tba","-","--","...","private",
  "confidential","stealth","stealth startup","self-employed","self employed",
  "freelance","freelancer","independent","independant","independent contractor","independant contractor",
  "consultant","various","none","unknown","undisclosed","not disclosed",
])

export function isSuspicious(name: string): boolean {
  return SUSPICIOUS_NAMES.has(name.toLowerCase().trim())
}
