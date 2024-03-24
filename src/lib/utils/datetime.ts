import dayjs, { type Dayjs } from 'dayjs';
import calendar from 'dayjs/plugin/calendar';

dayjs.extend(calendar);

export const formatCalendar = (date: Dayjs) => dayjs().calendar(date);

export const formatDate = (date: Dayjs | string) => dayjs(date).format('MMMM D, YYYY');
