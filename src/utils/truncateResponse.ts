/**
 * Truncates a response result to a maximum length for logging purposes.
 *
 * @param data - The response data to be logged (will be JSON stringified)
 * @param maxLength - Maximum allowed length in characters (0 = no limit)
 * @returns Truncated JSON string with size indicator if truncated
 */
export function truncateResponseResult(data: any, maxLength: number): string {
  // If maxLength is 0 or negative, no truncation
  if (maxLength <= 0) {
    return JSON.stringify(data);
  }

  // Convert to JSON string
  const jsonString = JSON.stringify(data);

  // If within limit, return as-is
  if (jsonString.length <= maxLength) {
    return jsonString;
  }

  // Truncate and add indicator
  const truncated = jsonString.substring(0, maxLength);
  const indicator = `\n[TRUNCATED - original size: ${jsonString.length} characters]`;

  return truncated + indicator;
}
