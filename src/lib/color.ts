/**
 * Calculates the perceived luminance of an RGB color using the ITU-R BT.709 standard.
 * This formula accounts for human perception, which is more sensitive to green light
 * than red, and more sensitive to red than blue.
 *
 * This is the modern standard for HDTV and digital displays, matching the sRGB color space
 * used in web browsers.
 *
 * @param r - Red channel value (0-255)
 * @param g - Green channel value (0-255)
 * @param b - Blue channel value (0-255)
 * @returns Perceived luminance value (0-255)
 */
export function getPerceivedLuminance(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
