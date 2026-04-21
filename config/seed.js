require('dotenv').config();
const mongoose = require('mongoose');
const User     = require('../models/User');
const Product  = require('../models/Product');

mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/luxiven')
  .then(() => console.log('✓ Connected to MongoDB'));

const PRODUCTS = [
  {
    name: 'Velvet Meridian Sofa',
    slug: 'velvet-meridian-sofa',
    description: 'Hand-stitched in Italian velvet with a solid walnut frame. The Meridian is a statement of quiet authority — a sofa that commands a room without raising its voice. Each cushion is individually filled with premium goose down and covered in Grade-A Italian velvet.',
    shortDesc: 'Hand-stitched Italian velvet on solid walnut legs.',
    category: 'living-room',
    tags: ['sofa', 'velvet', 'walnut', 'bestseller'],
    images: [
      'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=800&q=80',
      'https://images.unsplash.com/photo-1567538096630-e0c55bd6374c?w=800&q=80',
    ],
    price: 2490,
    compareAt: 3200,
    cost: 890,
    stock: 12,
    sku: 'LUX-SOF-001',
    badge: 'Best Seller',
    isFeatured: true,
    materials: ['Italian Velvet', 'Solid Walnut', 'Goose Down Fill'],
    dimensions: { width: 220, height: 85, depth: 95, unit: 'cm' },
    weight: 48,
    features: ['Grade-A Italian velvet upholstery', 'Solid walnut frame', 'Removable & washable cushion covers', 'Available in 6 colorways', '10-year structural warranty'],
    supplier: 'Artisan Furnishings Co.',
  },
  {
    name: 'Aurel Marble Coffee Table',
    slug: 'aurel-marble-coffee-table',
    description: 'White Carrara marble top on a hand-formed brushed brass base. Where geology meets artistry — the Aurel brings millions of years of natural beauty into your living room. Each marble slab is unique; no two tables are identical.',
    shortDesc: 'White Carrara marble top on a brushed brass base.',
    category: 'living-room',
    tags: ['table', 'marble', 'brass', 'new-arrival'],
    images: [
      'https://images.unsplash.com/photo-1538688525198-9b88f6f53126?w=800&q=80',
      'https://images.unsplash.com/photo-1616047006789-b7af5afb8c20?w=800&q=80',
    ],
    price: 1890,
    compareAt: 2400,
    cost: 620,
    stock: 8,
    sku: 'LUX-TAB-001',
    badge: 'New Arrival',
    isFeatured: true,
    materials: ['Carrara Marble', 'Brushed Brass'],
    dimensions: { width: 120, height: 42, depth: 65, unit: 'cm' },
    weight: 38,
    features: ['Carrara marble surface', 'Brushed brass hand-formed base', 'Waterproof sealant applied', 'Each piece unique', 'Made to order in 4–6 weeks'],
    supplier: 'Stone & Metal Atelier',
  },
  {
    name: 'Nordic Arc Floor Lamp',
    slug: 'nordic-arc-floor-lamp',
    description: 'A sculptural arc lamp in matte black with a warm-toned linen shade. The Nordic Arc draws the eye upward and casts a pool of warm light that transforms the feel of any room. The counterweighted base ensures perfect stability.',
    shortDesc: 'Sculptural arc in matte black with a warm linen shade.',
    category: 'lighting',
    tags: ['lamp', 'floor-lamp', 'nordic', 'arc'],
    images: [
      'https://images.unsplash.com/photo-1507652313519-d4e9174996dd?w=800&q=80',
      'https://images.unsplash.com/photo-1565193566173-7a0ee3dbe261?w=800&q=80',
    ],
    price: 680,
    compareAt: 890,
    cost: 210,
    stock: 24,
    sku: 'LUX-LMP-001',
    badge: '',
    isFeatured: false,
    materials: ['Matte Black Steel', 'Linen', 'Marble Base'],
    dimensions: { width: 60, height: 185, depth: 140, unit: 'cm' },
    weight: 9,
    features: ['Matte black powder-coated steel', 'Handmade linen drum shade', 'Dimmable LED bulb included (8W, 2700K)', 'Marble counterweight base', '10-minute assembly'],
    supplier: 'Scandinavian Light Co.',
  },
  {
    name: 'Sable Platform Bed',
    slug: 'sable-platform-bed',
    description: 'Ultra-low profile platform bed in hand-smoked oak. The Sable sits close to the ground with architectural precision — a bed that belongs in a curated space. The smoked finish is applied by hand using traditional Japanese techniques.',
    shortDesc: 'Ultra-low platform bed in hand-smoked solid oak.',
    category: 'bedroom',
    tags: ['bed', 'oak', 'platform', 'japanese', 'signature'],
    images: [
      'https://images.unsplash.com/photo-1631049307264-da0ec9d70304?w=800&q=80',
      'https://images.unsplash.com/photo-1616594039964-ae9021a400a0?w=800&q=80',
    ],
    price: 3200,
    compareAt: 4100,
    cost: 1100,
    stock: 6,
    sku: 'LUX-BED-001',
    badge: 'Signature',
    isFeatured: true,
    materials: ['Solid Smoked Oak', 'Steel Joinery'],
    dimensions: { width: 200, height: 28, depth: 220, unit: 'cm' },
    weight: 72,
    features: ['Hand-smoked solid oak', 'Japanese Shou Sugi Ban technique', 'Integrated slatted base (no box spring needed)', 'Available in Queen & King', 'Custom dimensions available'],
    supplier: 'Kyoto Wood Workshop',
  },
  {
    name: 'Arco Writing Desk',
    slug: 'arco-writing-desk',
    description: 'A slim, purposeful desk in solid ash with a single full-grain leather drawer pull. The Arco is designed for those who work with intention — a surface that earns its place in a considered room. The wax finish is applied by hand in three coats.',
    shortDesc: 'Slim solid ash desk with full-grain leather pull.',
    category: 'office',
    tags: ['desk', 'ash', 'leather', 'workspace'],
    images: [
      'https://images.unsplash.com/photo-1593696140826-c58b021acf8b?w=800&q=80',
      'https://images.unsplash.com/photo-1524758631624-e2822e304c36?w=800&q=80',
    ],
    price: 1450,
    compareAt: null,
    cost: 480,
    stock: 14,
    sku: 'LUX-DSK-001',
    badge: '',
    isFeatured: false,
    materials: ['Solid Ash', 'Full-Grain Leather', 'Solid Brass'],
    dimensions: { width: 140, height: 76, depth: 65, unit: 'cm' },
    weight: 28,
    features: ['Solid ash with 3-coat hand wax finish', 'Full-grain vegetable-tanned leather drawer pull', 'Cable management slot', 'Brass hardware', 'Built to last 50+ years'],
    supplier: 'Nordic Craft Studio',
  },
  {
    name: 'Onyx Vessel Vase',
    slug: 'onyx-vessel-vase',
    description: 'Hand-thrown ceramic vessel in a deep onyx reactive glaze. Each piece is entirely unique — the glaze reacts differently in every firing, creating one-of-a-kind surface patterns. Signed on the base by the artisan.',
    shortDesc: 'Hand-thrown ceramic in unique onyx reactive glaze.',
    category: 'decor',
    tags: ['vase', 'ceramic', 'artisan', 'limited'],
    images: [
      'https://images.unsplash.com/photo-1602928298849-e5d4b53f4c6c?w=800&q=80',
      'https://images.unsplash.com/photo-1578500494198-246f612d3b3d?w=800&q=80',
    ],
    price: 340,
    compareAt: 460,
    cost: 95,
    stock: 18,
    sku: 'LUX-DCR-001',
    badge: 'Limited',
    isFeatured: true,
    materials: ['Stoneware Ceramic', 'Onyx Reactive Glaze'],
    dimensions: { width: 18, height: 34, depth: 18, unit: 'cm' },
    weight: 1.4,
    features: ['Hand-thrown stoneware', 'Unique onyx reactive glaze', 'Artisan-signed base', 'Waterproof interior', 'Each piece one-of-a-kind'],
    supplier: 'Atelier Ceramique Paris',
  },
  {
    name: 'Linen Cloud Bedding Set',
    slug: 'linen-cloud-bedding-set',
    description: 'Pure French linen bedding in soft stone — washed 12 times for unparalleled softness from the first night. The Cloud set includes duvet cover, fitted sheet, and two pillowcases. Gets softer with every wash.',
    shortDesc: 'Pure French linen, stone-washed 12 times for cloud-soft comfort.',
    category: 'bedroom',
    tags: ['bedding', 'linen', 'french', 'sleep'],
    images: [
      'https://images.unsplash.com/photo-1584100936595-c0654b55a2e2?w=800&q=80',
      'https://images.unsplash.com/photo-1566665797739-1674de7a421a?w=800&q=80',
    ],
    price: 380,
    compareAt: 520,
    cost: 110,
    stock: 35,
    sku: 'LUX-BED-002',
    badge: 'New Arrival',
    isFeatured: false,
    materials: ['100% French Linen', 'Natural Stone Wash'],
    dimensions: { width: 0, height: 0, depth: 0, unit: 'cm' },
    weight: 1.8,
    features: ['100% French linen (Normandy origin)', 'Stone-washed 12× for instant softness', 'OEKO-TEX certified', 'Queen & King available', 'Machine washable — gets better with age'],
    supplier: 'Maison du Lin, Normandy',
  },
  {
    name: 'Meridian Accent Chair',
    slug: 'meridian-accent-chair',
    description: 'A compact accent chair with a high curved back and solid brass legs. Upholstered in boucle fabric that catches the light. The Meridian Chair makes a bold statement in a small footprint — perfect for a reading corner or bedroom alcove.',
    shortDesc: 'High-back boucle accent chair on solid brass legs.',
    category: 'living-room',
    tags: ['chair', 'boucle', 'brass', 'accent'],
    images: [
      'https://images.unsplash.com/photo-1567538096630-e0c55bd6374c?w=800&q=80',
      'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=800&q=80',
    ],
    price: 1290,
    compareAt: 1680,
    cost: 420,
    stock: 10,
    sku: 'LUX-CHR-001',
    badge: '',
    isFeatured: false,
    materials: ['Boucle Fabric', 'Solid Brass', 'Solid Beech Frame'],
    dimensions: { width: 72, height: 95, depth: 78, unit: 'cm' },
    weight: 18,
    features: ['Boucle upholstery', 'Solid brass legs', 'High curved back', 'Solid beech internal frame', 'Available in ivory & charcoal'],
    supplier: 'Artisan Furnishings Co.',
  },
];

async function seed() {
  try {
    console.log('\n🌱 Seeding Luxiven database...\n');

    // Clear existing
    await Product.deleteMany({});
    await User.deleteMany({ role: 'admin' });
    console.log('✓ Cleared existing products and admin users');

    // Create products
    const products = await Product.insertMany(PRODUCTS);
    console.log(`✓ Created ${products.length} products`);

    // Create admin user
    const admin = await User.create({
      firstName: 'Luxiven',
      lastName:  'Admin',
      email:     process.env.ADMIN_EMAIL || 'admin@luxiven.com',
      password:  'Luxiven@2024!',
      role:      'admin',
      isVerified: true,
    });
    console.log(`✓ Admin created: ${admin.email} / Luxiven@2024!`);

    console.log('\n✅ Seed complete!\n');
    process.exit(0);
  } catch (err) {
    console.error('✗ Seed error:', err);
    process.exit(1);
  }
}

seed();
