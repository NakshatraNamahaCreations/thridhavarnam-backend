// Initial demo data — mirrors the frontend's original mock data so a fresh
// database looks identical to the old localStorage demo.

const categories = [
  { id: 'silk', name: 'Silk', color: 'maroon' },
  { id: 'kanjivaram', name: 'Kanjivaram', color: 'gold' },
  { id: 'banarasi', name: 'Banarasi', color: 'maroon' },
  { id: 'cotton', name: 'Cotton', color: 'ink' },
  { id: 'georgette', name: 'Georgette', color: 'maroon' },
  { id: 'chiffon', name: 'Chiffon', color: 'gold' },
]

const products = [
  { id: 'SAR-1042', name: 'Royal Kanjivaram Silk', category: 'kanjivaram', fabric: 'Pure Silk', color: 'Maroon & Gold', description: 'Handwoven pure silk with intricate temple-border zari work. Ideal for weddings.', price: 18999, mrp: 24999, stock: 12, sold: 84, rating: 4.8, status: 'active', image: '🥻' },
  { id: 'SAR-1043', name: 'Banarasi Zari Weave', category: 'banarasi', fabric: 'Banarasi Silk', color: 'Royal Blue', description: 'Classic Banarasi with dense gold zari motifs and a contrast blouse piece.', price: 12499, mrp: 15999, stock: 4, sold: 132, rating: 4.7, status: 'active', image: '🥻' },
  { id: 'SAR-1044', name: 'Handloom Cotton Jamdani', category: 'cotton', fabric: 'Cotton', color: 'Ivory', description: 'Breathable handloom jamdani, perfect for daily and office wear.', price: 3299, mrp: 4499, stock: 38, sold: 210, rating: 4.5, status: 'active', image: '🥻' },
  { id: 'SAR-1045', name: 'Mysore Pure Silk', category: 'silk', fabric: 'Mysore Silk', color: 'Emerald Green', description: 'Lightweight Mysore silk with a subtle sheen and fine gold border.', price: 9999, mrp: 12999, stock: 0, sold: 76, rating: 4.6, status: 'out_of_stock', image: '🥻' },
  { id: 'SAR-1046', name: 'Designer Georgette Drape', category: 'georgette', fabric: 'Georgette', color: 'Wine', description: 'Flowy designer georgette with sequin detailing for party occasions.', price: 5499, mrp: 7999, stock: 22, sold: 58, rating: 4.4, status: 'active', image: '🥻' },
  { id: 'SAR-1047', name: 'Floral Chiffon Saree', category: 'chiffon', fabric: 'Chiffon', color: 'Blush Pink', description: 'Soft chiffon with a delicate floral print and scalloped edge.', price: 4199, mrp: 5999, stock: 7, sold: 41, rating: 4.3, status: 'active', image: '🥻' },
  { id: 'SAR-1048', name: 'Bridal Kanjivaram Gold', category: 'kanjivaram', fabric: 'Pure Silk', color: 'Crimson Red', description: 'Heavy bridal Kanjivaram with full gold body and broad contrast border.', price: 32999, mrp: 41999, stock: 3, sold: 28, rating: 4.9, status: 'active', image: '🥻' },
  { id: 'SAR-1049', name: 'Soft Silk Temple Border', category: 'silk', fabric: 'Soft Silk', color: 'Mustard Yellow', description: 'Soft silk with a traditional temple border, easy to drape.', price: 7499, mrp: 9499, stock: 16, sold: 93, rating: 4.5, status: 'active', image: '🥻' },
  { id: 'SAR-1050', name: 'Linen Cotton Casual', category: 'cotton', fabric: 'Linen', color: 'Sky Blue', description: 'Crisp linen-cotton blend for an effortless everyday look.', price: 2799, mrp: 3799, stock: 45, sold: 167, rating: 4.2, status: 'active', image: '🥻' },
  { id: 'SAR-1051', name: 'Banarasi Katan Silk', category: 'banarasi', fabric: 'Katan Silk', color: 'Purple', description: 'Pure Katan silk Banarasi with all-over butti and rich pallu.', price: 14999, mrp: 18999, stock: 9, sold: 64, rating: 4.7, status: 'draft', image: '🥻' },
]

const customers = [
  { id: 'CUS-301', name: 'Ananya Iyer', email: 'ananya.iyer@gmail.com', phone: '+91 98765 43210', city: 'Chennai', orders: 14, spent: 142500, segment: 'VIP', joined: '2023-02-11', avatar: 'AI' },
  { id: 'CUS-302', name: 'Priya Sharma', email: 'priya.sharma@gmail.com', phone: '+91 99887 66554', city: 'Delhi', orders: 8, spent: 68400, segment: 'Loyal', joined: '2023-05-22', avatar: 'PS' },
  { id: 'CUS-303', name: 'Meera Nair', email: 'meera.nair@gmail.com', phone: '+91 97654 32109', city: 'Kochi', orders: 21, spent: 218900, segment: 'VIP', joined: '2022-11-03', avatar: 'MN' },
  { id: 'CUS-304', name: 'Lakshmi Reddy', email: 'lakshmi.r@gmail.com', phone: '+91 96543 21098', city: 'Hyderabad', orders: 3, spent: 24700, segment: 'New', joined: '2024-08-17', avatar: 'LR' },
  { id: 'CUS-305', name: 'Sneha Patel', email: 'sneha.patel@gmail.com', phone: '+91 95432 10987', city: 'Ahmedabad', orders: 11, spent: 96300, segment: 'Loyal', joined: '2023-07-30', avatar: 'SP' },
  { id: 'CUS-306', name: 'Divya Menon', email: 'divya.menon@gmail.com', phone: '+91 94321 09876', city: 'Bangalore', orders: 6, spent: 51200, segment: 'Loyal', joined: '2024-01-09', avatar: 'DM' },
  { id: 'CUS-307', name: 'Kavya Rao', email: 'kavya.rao@gmail.com', phone: '+91 93210 98765', city: 'Pune', orders: 2, spent: 14900, segment: 'New', joined: '2024-10-25', avatar: 'KR' },
  { id: 'CUS-308', name: 'Ritu Agarwal', email: 'ritu.a@gmail.com', phone: '+91 92109 87654', city: 'Jaipur', orders: 18, spent: 187600, segment: 'VIP', joined: '2022-09-14', avatar: 'RA' },
]

const orders = [
  { id: '#ORD-9921', customer: 'Ananya Iyer', avatar: 'AI', product: 'Royal Kanjivaram Silk', items: 2, amount: 37998, status: 'delivered', payment: 'paid', date: '2026-06-02', city: 'Chennai' },
  { id: '#ORD-9920', customer: 'Meera Nair', avatar: 'MN', product: 'Bridal Kanjivaram Gold', items: 1, amount: 32999, status: 'shipped', payment: 'paid', date: '2026-06-02', city: 'Kochi' },
  { id: '#ORD-9919', customer: 'Priya Sharma', avatar: 'PS', product: 'Banarasi Zari Weave', items: 1, amount: 12499, status: 'processing', payment: 'paid', date: '2026-06-01', city: 'Delhi' },
  { id: '#ORD-9918', customer: 'Kavya Rao', avatar: 'KR', product: 'Floral Chiffon Saree', items: 3, amount: 12597, status: 'pending', payment: 'pending', date: '2026-06-01', city: 'Pune' },
  { id: '#ORD-9917', customer: 'Ritu Agarwal', avatar: 'RA', product: 'Banarasi Katan Silk', items: 1, amount: 14999, status: 'delivered', payment: 'paid', date: '2026-05-31', city: 'Jaipur' },
  { id: '#ORD-9916', customer: 'Sneha Patel', avatar: 'SP', product: 'Designer Georgette Drape', items: 2, amount: 10998, status: 'cancelled', payment: 'refunded', date: '2026-05-30', city: 'Ahmedabad' },
  { id: '#ORD-9915', customer: 'Divya Menon', avatar: 'DM', product: 'Handloom Cotton Jamdani', items: 4, amount: 13196, status: 'shipped', payment: 'paid', date: '2026-05-30', city: 'Bangalore' },
  { id: '#ORD-9914', customer: 'Lakshmi Reddy', avatar: 'LR', product: 'Soft Silk Temple Border', items: 1, amount: 7499, status: 'delivered', payment: 'paid', date: '2026-05-29', city: 'Hyderabad' },
  { id: '#ORD-9913', customer: 'Ananya Iyer', avatar: 'AI', product: 'Mysore Pure Silk', items: 1, amount: 9999, status: 'processing', payment: 'paid', date: '2026-05-29', city: 'Chennai' },
  { id: '#ORD-9912', customer: 'Priya Sharma', avatar: 'PS', product: 'Linen Cotton Casual', items: 2, amount: 5598, status: 'delivered', payment: 'paid', date: '2026-05-28', city: 'Delhi' },
]

const buildPayments = () =>
  orders.map((o, i) => ({
    id: `PAY-${4400 - i}`,
    orderId: o.id,
    customer: o.customer,
    avatar: o.avatar,
    amount: o.amount,
    method: o.payment === 'pending' ? '—' : ['UPI', 'Card', 'Net Banking', 'Wallet', 'COD'][i % 5],
    status: o.payment,
    date: o.date,
  }))

const adminUser = {
  name: 'Riya Verma',
  email: 'riya@vastrasarees.in',
  password: 'password',
  role: 'Store Admin',
}

module.exports = { categories, products, customers, orders, buildPayments, adminUser }
