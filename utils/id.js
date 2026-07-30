// creates a random uuid-style string, used as this phone's session device id
export function generateId() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0; // random hex digit
    const v = c === 'x' ? r : (r & 0x3) | 0x8; // standard uuid v4 formatting
    return v.toString(16);
  });
}