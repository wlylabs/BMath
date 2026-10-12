/** Brand colors used outside CSS: manifest, theme-color, Open Graph image and icons. Keep in sync with globals.css. */
export const BRAND = {
  sun: '#f2c53d',
  spot: '#1f3dff',
  ink: '#0e0e0e',
  chalk: '#f4f4f2',
  darkBg: '#17191c',
  lightBg: '#e6e6e3',
  darkInk: '#eef0f2',
  darkInk2: '#cfd3d8',
  darkLine: '#4d535b',
} as const;

/**
 * The BMath mark on a 16-pixel grid: a pixel "b" whose bowl is a ring, with a slice of the ring
 * knocked out and flying off. That slice is the cut a Bordrless hook takes from every trade.
 */
export const MARK = {
  glyph: 'M1 0h3v1H1zM1 1h3v1H1zM1 2h3v1H1zM1 3h3v1H1zM1 4h3v1H1zM6 4h2v1H6zM1 5h3v1H1zM5 5h4v1H5zM1 6h9v1H1zM1 7h6v1H1zM10 7h1v1H10zM1 8h6v1H1zM10 8h3v1H10zM1 9h6v1H1zM10 9h3v1H10zM1 10h6v1H1zM10 10h3v1H10zM1 11h6v1H1zM10 11h3v1H10zM1 12h12v1H1zM1 13h3v1H1zM5 13h7v1H5zM1 14h3v1H1zM6 14h5v1H6z',
  slice: 'M10 2h3v1H10zM11 3h3v1H11zM12 4h3v1H12zM13 5h2v1H13z',
} as const;
