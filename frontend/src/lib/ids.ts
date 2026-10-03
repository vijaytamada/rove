const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Query-string ids come from the URL, so check them before passing them to the API. */
export const isUuid = (value: string | undefined): value is string => value !== undefined && UUID.test(value);
