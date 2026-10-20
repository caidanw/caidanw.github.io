// Post dates are authored in Pacific time. Formatting in an explicit time zone keeps the
// rendered day from shifting when the site is built on a UTC machine.
const POST_TIME_ZONE = 'America/Los_Angeles'

const shortDateFormat = new Intl.DateTimeFormat('en-US', { timeZone: POST_TIME_ZONE, month: 'short', day: '2-digit', year: 'numeric' })
const longDateFormat = new Intl.DateTimeFormat('en-US', { timeZone: POST_TIME_ZONE, month: 'long', day: 'numeric', year: 'numeric' })

/** e.g. "Jan 29, 2026" */
export const formatShortPostDate = (date: string) => shortDateFormat.format(new Date(date))

/** e.g. "January 29, 2026" */
export const formatLongPostDate = (date: string) => longDateFormat.format(new Date(date))
