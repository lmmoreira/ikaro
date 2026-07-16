export const E164_PHONE_PATTERN = /^\+[1-9]\d{6,14}$/;

export function isValidPhoneNumber(phone: string): boolean {
  return E164_PHONE_PATTERN.test(phone);
}
