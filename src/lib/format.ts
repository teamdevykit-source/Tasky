/**
 * Formats a date string (ISO or YYYY-MM-DD or YYYY-MM-DDTHH:mm) 
 * into a human-readable format with time support.
 */
export const formatDateTime = (dateStr?: string) => {
  if (!dateStr) return 'TBD';
  
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return dateStr; // Fallback to raw string if invalid

  const options: Intl.DateTimeFormatOptions = {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    hour12: true
  };
  
  // If it's the current year, we can omit it to save space
  if (date.getFullYear() !== new Date().getFullYear()) {
    options.year = 'numeric';
  }
  
  return new Intl.DateTimeFormat('en-US', options).format(date);
};

/**
 * Formats a date for datetime-local input (YYYY-MM-DDTHH:mm)
 */
export const formatForInput = (dateStr?: string) => {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 16); 
};
