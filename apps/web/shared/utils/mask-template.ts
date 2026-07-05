// '#' is a digit placeholder, every other character is a literal — shared by any masked-input
// util (phone, postal code, ...) that formats raw digits against a country-specific template.
export function applyMaskTemplate(digits: string, template: string): string {
  let result = '';
  let digitIndex = 0;
  for (const ch of template) {
    if (digitIndex >= digits.length) break;
    if (ch === '#') {
      result += digits[digitIndex];
      digitIndex += 1;
    } else {
      result += ch;
    }
  }
  return result;
}
