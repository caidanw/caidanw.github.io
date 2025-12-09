/**
 * Type representing a constructor for an HTML element
 */
type ElementConstructor<T extends HTMLElement> = new (...args: any[]) => T

/**
 * Generic helper to get an element by ID and verify its type
 * @param id - The element ID to search for
 * @param type - The constructor/class to verify against (e.g., HTMLInputElement, HTMLCanvasElement)
 * @returns The element cast to the specified type
 * @throws Error if element not found or wrong type
 */
function getElementByIdTyped<T extends HTMLElement>(id: string, type: ElementConstructor<T>): T {
  const el = document.getElementById(id)

  if (!el) throw new Error(`Element with id "${id}" not found.`)
  if (!(el instanceof type)) throw new Error(`Element with id "${id}" is not an instance of ${type.name}.`)

  return el
}

/**
 * Factory function to create type-specific element getters
 * @param type - The constructor/class to verify against
 * @returns A function that takes an ID and returns the element of the specified type
 */
export function getElementById<T extends HTMLElement>(type: ElementConstructor<T>) {
  return (id: string) => getElementByIdTyped(id, type)
}

export const getInputElement = getElementById(HTMLInputElement)
export const getButtonElement = getElementById(HTMLButtonElement)
export const getCanvasElement = getElementById(HTMLCanvasElement)
export const getSpanElement = getElementById(HTMLSpanElement)
