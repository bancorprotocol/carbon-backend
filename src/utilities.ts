import moment from 'moment';

export function toTimestamp(date: Date): number {
  return parseInt(moment(date).format('X'));
}

function toCamelCase(str) {
  return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}

export function convertKeysToCamelCase(obj) {
  if (Array.isArray(obj)) {
    // If it's an array, map over each item and apply the function recursively
    return obj.map((item) => convertKeysToCamelCase(item));
  } else if (obj !== null && typeof obj === 'object') {
    // If it's an object, process each key
    return Object.keys(obj).reduce((result, key) => {
      const camelKey = toCamelCase(key);
      result[camelKey] = convertKeysToCamelCase(obj[key]); // Recursively apply to values
      return result;
    }, {});
  }
  return obj; // If it's neither an array nor an object, return the value directly
}

export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const cotiMap = {
  '0x7637c7838ec4ec6b85080f28a678f8e234bb83d1': '0xaf2ca40d3fc4459436d11b94d21fa4b8a89fb51d', // gcoti
};
