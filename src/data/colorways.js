// Standard saree colorways — single source of truth exposed via
// GET /api/colorways. Consumed by the admin panel dropdowns and, in
// the future, by the storefront. Mirrors the STANDARD_COLORWAYS array
// in Tridhavarnam-main/lib/sarees.ts — keep both in sync until the
// storefront also fetches from this endpoint.
//
// Ordered by hue family so a rendered swatch row reads warm → cool
// with neutrals at the seams.
const COLORWAYS = [
  // Reds
  { id: 'red', name: 'Red', hex: '#DC2626' },
  { id: 'maroon', name: 'Maroon', hex: '#7E1D1D' },
  { id: 'wine', name: 'Wine', hex: '#4A0815' },
  // Pinks
  { id: 'pink', name: 'Pink', hex: '#DB2777' },
  { id: 'magenta', name: 'Magenta', hex: '#A21CAF' },
  // Oranges / rust
  { id: 'orange', name: 'Orange', hex: '#F97316' },
  { id: 'rust', name: 'Rust', hex: '#C2410C' },
  // Yellows / golds
  { id: 'yellow', name: 'Yellow', hex: '#EAB308' },
  { id: 'mustard', name: 'Mustard', hex: '#A16207' },
  { id: 'gold', name: 'Gold', hex: '#DAA520' },
  // Neutrals
  { id: 'cream', name: 'Cream', hex: '#FEF3C7' },
  { id: 'ivory', name: 'Ivory', hex: '#F2E9D8' },
  { id: 'beige', name: 'Beige', hex: '#D6BD8C' },
  { id: 'white', name: 'White', hex: '#FFFFFF' },
  // Greens
  { id: 'mint', name: 'Mint', hex: '#34D399' },
  { id: 'green', name: 'Green', hex: '#16A34A' },
  { id: 'olive', name: 'Olive', hex: '#65A30D' },
  { id: 'forest', name: 'Dark Green', hex: '#166534' },
  // Blue-greens
  { id: 'teal', name: 'Teal', hex: '#0D9488' },
  { id: 'peacock', name: 'Peacock', hex: '#0E7490' },
  // Blues
  { id: 'sky', name: 'Sky Blue', hex: '#0EA5E9' },
  { id: 'blue', name: 'Blue', hex: '#2563EB' },
  { id: 'navy', name: 'Navy Blue', hex: '#1E40AF' },
  { id: 'midnight', name: 'Dark Blue', hex: '#1E1B4B' },
  // Purples
  { id: 'lavender', name: 'Lavender', hex: '#C4B5FD' },
  { id: 'purple', name: 'Purple', hex: '#9333EA' },
  // Browns / blacks / grays
  { id: 'brown', name: 'Brown', hex: '#92400E' },
  { id: 'grey', name: 'Grey', hex: '#6B7280' },
  { id: 'black', name: 'Black', hex: '#000000' },
]

module.exports = COLORWAYS
