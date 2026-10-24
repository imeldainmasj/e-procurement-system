import bcrypt from 'bcrypt';

const BCRYPT_COST = 12;

// Compared against when the email is unknown so response time does not reveal which emails exist.
const DUMMY_HASH = '$2b$12$Sn8ncRVeeV6ZL/Jp15QKf.nLiYzVt5oJmEchjRsYtHVgVrXM1v73a';

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_COST);
}

export function verifyPassword(plain: string, hash: string | null | undefined): Promise<boolean> {
  return bcrypt.compare(plain, hash ?? DUMMY_HASH).then((ok) => ok && hash != null);
}
