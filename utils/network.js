import { FIREBASE_DB_URL } from '../constants/config';

// asks firebase where the laptop is, given a 6-digit room pin
export async function resolveIp(roomPin) {
  try {
    const res = await fetch(`${FIREBASE_DB_URL}/pins/${roomPin}.json`);
    const data = await res.json();
    if (!data || !data.ip) {
      return null; // pin doesn't exist or has no ip
    }
    return data.ip;
  } catch (err) {
    return null; // internet cut out mid-request
  }
}