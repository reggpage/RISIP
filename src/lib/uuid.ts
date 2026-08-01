// UUID v4 generator that works everywhere the app runs.
//
// Why not `crypto.randomUUID()` directly? That API is only exposed in a Secure
// Context (HTTPS or localhost). When staff open the app over a LAN IP for testing
// (http://192.168.0.224:5174) it's undefined and every call throws:
//     TypeError: crypto.randomUUID is not a function
//
// `crypto.getRandomValues()` IS available in insecure contexts, so we build the
// UUID ourselves from 16 random bytes with the RFC 4122 v4 markers applied.
export function uuidv4(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  // Set version (4) and variant (10xx) bits per RFC 4122.
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex: string[] = [];
  for (let i = 0; i < 16; i++) hex.push(bytes[i].toString(16).padStart(2, '0'));
  return (
    hex.slice(0, 4).join('') + '-' +
    hex.slice(4, 6).join('') + '-' +
    hex.slice(6, 8).join('') + '-' +
    hex.slice(8, 10).join('') + '-' +
    hex.slice(10, 16).join('')
  );
}
