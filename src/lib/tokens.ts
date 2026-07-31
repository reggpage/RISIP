// 24 random bytes → 32-char URL-safe base64 string. That's ~192 bits of entropy;
// collisions are astronomically unlikely, and the DB has a unique constraint anyway.
export function generateInviteToken(bytes = 24): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  let bin = '';
  for (const b of arr) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function inviteJoinUrl(token: string): string {
  return `${window.location.origin}/join/${token}`;
}
