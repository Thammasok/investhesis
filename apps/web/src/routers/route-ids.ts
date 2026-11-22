/** Route id of the signed-in area. Its middleware is the sign-in guard; its loader reads `GET /me`. */
export const APP_ROUTE_ID = 'app'

/** Route id of `/stocks/:id`: its loader holds the stock, read by the detail and edit pages. */
export const STOCK_ROUTE_ID = 'stock'
