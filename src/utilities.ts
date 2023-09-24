import moment from 'moment';

export function toTimestamp(date: Date): number {
  return parseInt(moment(date).format('X'));
}
