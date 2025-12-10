/**
 * A utility function to conditionally join class names.
 * Similar to the popular `clsx` or `classnames` libraries.
 *
 * @param args - An array of strings, objects, or arrays containing class names.
 * @returns A single string with all valid class names joined by spaces.
 *
 * @example
 * clsx('btn', { 'btn-primary': isPrimary, 'btn-disabled': isDisabled }, ['extra-class'])
 * // returns 'btn btn-primary extra-class' if isPrimary is true and isDisabled is false
 */
export default function clsx(...args: any[]): string {
  return args
    .flat(Infinity)
    .map((arg) => {
      if (!arg) return ''
      if (typeof arg === 'string') return arg
      if (typeof arg === 'object') {
        return Object.entries(arg)
          .filter(([_, value]) => !!value)
          .map(([key]) => key)
          .join(' ')
      }
      return ''
    })
    .filter(Boolean)
    .join(' ')
}
