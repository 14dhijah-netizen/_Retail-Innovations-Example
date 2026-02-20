-- ============================================================
-- RETAIL INNOVATIONS LTD - Supabase Database Schema
-- Run this in Supabase SQL Editor (Dashboard > SQL Editor)
-- ============================================================

-- ============================================================
-- 1. USER PROFILES TABLE (links to Supabase Auth)
-- ============================================================
CREATE TABLE IF NOT EXISTS user_profiles (
    id              UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email           TEXT NOT NULL,
    full_name       TEXT,
    role            TEXT DEFAULT 'customer' CHECK (role IN ('customer', 'admin')),
    created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_profiles_role ON user_profiles (role);

-- Auto-create a profile row when a new user signs up
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO user_profiles (id, email, full_name, role)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data ->> 'full_name', ''),
        COALESCE(NEW.raw_user_meta_data ->> 'role', 'customer')
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ============================================================
-- 2. PRODUCTS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS products (
    id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name            TEXT NOT NULL,
    description     TEXT,
    price           NUMERIC(10, 2) NOT NULL CHECK (price >= 0),
    category        TEXT NOT NULL,
    image_url       TEXT,
    stock_quantity  INTEGER NOT NULL DEFAULT 0 CHECK (stock_quantity >= 0),
    sku             TEXT UNIQUE NOT NULL,
    is_active       BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_products_category ON products (category);

-- ============================================================
-- 3. CUSTOMERS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS customers (
    id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id         UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    email           TEXT UNIQUE NOT NULL,
    full_name       TEXT NOT NULL,
    phone           TEXT,
    loyalty_points  INTEGER DEFAULT 0 CHECK (loyalty_points >= 0),
    loyalty_tier    TEXT DEFAULT 'Bronze' CHECK (loyalty_tier IN ('Bronze', 'Silver', 'Gold', 'Platinum')),
    total_spent     NUMERIC(12, 2) DEFAULT 0.00,
    joined_at       TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_customers_email ON customers (email);
CREATE INDEX IF NOT EXISTS idx_customers_user ON customers (user_id);

-- ============================================================
-- 4. ORDERS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS orders (
    id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    customer_id     UUID REFERENCES customers(id) ON DELETE SET NULL,
    user_id         UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    total_amount    NUMERIC(10, 2) NOT NULL CHECK (total_amount >= 0),
    status          TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'shipped', 'delivered', 'cancelled')),
    payment_method  TEXT,
    notes           TEXT,
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders (customer_id);
CREATE INDEX IF NOT EXISTS idx_orders_user ON orders (user_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders (status);

-- ============================================================
-- 5. ORDER ITEMS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS order_items (
    id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    order_id        UUID REFERENCES orders(id) ON DELETE CASCADE,
    product_id      UUID REFERENCES products(id) ON DELETE SET NULL,
    quantity        INTEGER NOT NULL CHECK (quantity > 0),
    unit_price      NUMERIC(10, 2) NOT NULL CHECK (unit_price >= 0),
    subtotal        NUMERIC(10, 2) GENERATED ALWAYS AS (quantity * unit_price) STORED
);

-- ============================================================
-- 6. LOYALTY REWARDS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS loyalty_rewards (
    id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name            TEXT NOT NULL,
    description     TEXT,
    points_required INTEGER NOT NULL CHECK (points_required > 0),
    reward_type     TEXT NOT NULL CHECK (reward_type IN ('discount_percent', 'discount_fixed', 'free_product', 'free_shipping')),
    reward_value    NUMERIC(10, 2) NOT NULL,
    is_active       BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- 7. LOYALTY TRANSACTIONS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS loyalty_transactions (
    id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    customer_id     UUID REFERENCES customers(id) ON DELETE CASCADE,
    points_change   INTEGER NOT NULL,
    reason          TEXT NOT NULL,
    order_id        UUID REFERENCES orders(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- 8. AUTO-UPDATE TIMESTAMPS
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_products_updated ON products;
CREATE TRIGGER trg_products_updated
    BEFORE UPDATE ON products FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trg_customers_updated ON customers;
CREATE TRIGGER trg_customers_updated
    BEFORE UPDATE ON customers FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trg_orders_updated ON orders;
CREATE TRIGGER trg_orders_updated
    BEFORE UPDATE ON orders FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- 9. ADMIN HELPER FUNCTION
-- ============================================================
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM user_profiles
        WHERE id = auth.uid() AND role = 'admin'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 10. ROW LEVEL SECURITY
-- ============================================================
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE loyalty_rewards ENABLE ROW LEVEL SECURITY;
ALTER TABLE loyalty_transactions ENABLE ROW LEVEL SECURITY;

-- Profiles
CREATE POLICY "Users see own profile" ON user_profiles FOR SELECT USING (id = auth.uid() OR is_admin());
CREATE POLICY "Users update own profile" ON user_profiles FOR UPDATE USING (id = auth.uid());

-- Products: everyone reads, admins write
CREATE POLICY "Anyone can view products" ON products FOR SELECT USING (true);
CREATE POLICY "Admins insert products" ON products FOR INSERT WITH CHECK (is_admin());
CREATE POLICY "Admins update products" ON products FOR UPDATE USING (is_admin());
CREATE POLICY "Admins delete products" ON products FOR DELETE USING (is_admin());

-- Customers: admins all, users own
CREATE POLICY "View customers" ON customers FOR SELECT USING (is_admin() OR user_id = auth.uid());
CREATE POLICY "Admins manage customers" ON customers FOR ALL USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "Users insert own customer" ON customers FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users update own customer" ON customers FOR UPDATE USING (user_id = auth.uid());

-- Orders: admins see ALL + edit ALL, users see own only
CREATE POLICY "Admins see all orders" ON orders FOR SELECT USING (is_admin());
CREATE POLICY "Users see own orders" ON orders FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Admins manage all orders" ON orders FOR ALL USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "Users insert own orders" ON orders FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users update own pending" ON orders FOR UPDATE USING (user_id = auth.uid() AND status = 'pending');

-- Order items
CREATE POLICY "View order items" ON order_items FOR SELECT
    USING (EXISTS (SELECT 1 FROM orders WHERE orders.id = order_items.order_id AND (orders.user_id = auth.uid() OR is_admin())));
CREATE POLICY "Admins manage items" ON order_items FOR ALL USING (is_admin()) WITH CHECK (is_admin());

-- Loyalty rewards: public read, admin write
CREATE POLICY "Anyone view rewards" ON loyalty_rewards FOR SELECT USING (true);
CREATE POLICY "Admins manage rewards" ON loyalty_rewards FOR ALL USING (is_admin()) WITH CHECK (is_admin());

-- Loyalty transactions
CREATE POLICY "View own transactions" ON loyalty_transactions FOR SELECT
    USING (EXISTS (SELECT 1 FROM customers WHERE customers.id = loyalty_transactions.customer_id AND customers.user_id = auth.uid()) OR is_admin());
CREATE POLICY "Admins manage transactions" ON loyalty_transactions FOR ALL USING (is_admin()) WITH CHECK (is_admin());

-- ============================================================
-- 11. SEED DATA
-- ============================================================
INSERT INTO products (name, description, price, category, stock_quantity, sku, image_url) VALUES
    ('Organic Green Tea', 'Premium loose-leaf green tea sourced from organic farms.', 12.99, 'Beverages', 150, 'BEV-001', 'https://images.unsplash.com/photo-1556881286-fc6915169721?w=400'),
    ('Artisan Sourdough Bread', 'Freshly baked sourdough with a crispy crust.', 6.50, 'Bakery', 45, 'BAK-001', 'https://images.unsplash.com/photo-1585478259715-876acc5be8eb?w=400'),
    ('Wireless Bluetooth Earbuds', 'High-fidelity audio with noise cancellation.', 79.99, 'Electronics', 200, 'ELE-001', 'https://images.unsplash.com/photo-1590658268037-6bf12f032f55?w=400'),
    ('Handmade Ceramic Mug', 'Beautifully crafted ceramic mug, dishwasher safe.', 18.00, 'Homeware', 80, 'HOM-001', 'https://images.unsplash.com/photo-1514228742587-6b1558fcca3d?w=400'),
    ('Running Shoes - Trail Edition', 'Durable trail running shoes with superior grip.', 124.95, 'Sports', 60, 'SPO-001', 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=400'),
    ('Bamboo Desk Organiser', 'Eco-friendly desk organiser with multiple compartments.', 29.99, 'Office', 120, 'OFF-001', 'https://images.unsplash.com/photo-1586281380349-632531db7ed4?w=400'),
    ('Cold Pressed Olive Oil', 'Extra virgin olive oil from Mediterranean groves.', 15.50, 'Food', 90, 'FOD-001', 'https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?w=400'),
    ('Yoga Mat - Premium', 'Non-slip, extra-thick yoga mat for comfort.', 45.00, 'Sports', 70, 'SPO-002', 'https://images.unsplash.com/photo-1601925260368-ae2f83cf8b7f?w=400'),
    ('Scented Soy Candle Set', 'Hand-poured soy candles in three fragrances.', 22.00, 'Homeware', 100, 'HOM-002', 'https://images.unsplash.com/photo-1602607663923-bc2f5e90a730?w=400'),
    ('Stainless Steel Water Bottle', 'Insulated bottle keeps drinks cold for 24 hours.', 19.99, 'Accessories', 180, 'ACC-001', 'https://images.unsplash.com/photo-1602143407151-7111542de6e8?w=400')
ON CONFLICT (sku) DO NOTHING;

INSERT INTO loyalty_rewards (name, description, points_required, reward_type, reward_value) VALUES
    ('10% Off Next Order', 'Get 10% discount on your next purchase.', 500, 'discount_percent', 10.00),
    ('£5 Off', 'Flat £5 discount on orders over £25.', 300, 'discount_fixed', 5.00),
    ('Free Shipping', 'Free standard shipping on your next order.', 200, 'free_shipping', 0.00),
    ('25% VIP Discount', 'Exclusive 25% off for Platinum members.', 2000, 'discount_percent', 25.00);

-- ============================================================
-- 12. MAKE YOUR FIRST ADMIN
-- ============================================================
-- 1. Sign up via the app
-- 2. Then run this in SQL Editor:
--
--   UPDATE user_profiles SET role = 'admin'
--   WHERE email = 'your-email@example.com';
--
-- ============================================================
