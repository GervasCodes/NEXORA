#!/usr/bin/env node

/**
 * NEXORA seed script.
 *
 * Populates reference data (categories) and, if none exists yet, a single
 * admin account so you can log in on a fresh database. Safe to re-run:
 * everything is inserted with "skip if already present" checks.
 *
 * Usage: node database/seed.js
 *
 * Reads DB_* and ADMIN_* variables from backend/.env — see backend/.env.example
 * for ADMIN_EMAIL / ADMIN_PASSWORD / ADMIN_PHONE.
 */

const path = require("path");
const fs = require("fs");
const bcrypt = require("bcrypt");
const mysql = require("mysql2/promise");
require("dotenv").config({ path: path.join(__dirname, "..", "backend", ".env") });

const CATEGORIES = [
    { name: "Phones & Electronics", slug: "phones-electronics", description: "Phones, computers, and accessories", display_order: 1 },
    { name: "Fashion & Beauty", slug: "fashion-beauty", description: "Clothing, shoes, accessories, and personal care", display_order: 2 },
    { name: "Home & Living", slug: "home-living", description: "Furniture, decor, and household goods", display_order: 3 },
    { name: "Groceries & Food", slug: "groceries-food", description: "Food and everyday essentials", display_order: 4 },
    { name: "Vehicles & Transport", slug: "vehicles-transport", description: "Cars, motorcycles, parts, and accessories", display_order: 5 },
    { name: "Services", slug: "services", description: "Local services from trusted sellers", display_order: 6 },
    { name: "Sports & Outdoors", slug: "sports-outdoors", description: "Sporting goods, fitness, and outdoor gear", display_order: 7 }
];

// Same SSL handling as backend/src/config/db.js - see the comment there.
const buildSslConfig = () => {
    if (process.env.DB_SSL_CA_PATH) {
        return { ca: fs.readFileSync(process.env.DB_SSL_CA_PATH).toString() };
    }
    if (process.env.DB_SSL_CA) {
        return { ca: process.env.DB_SSL_CA.replace(/\\n/g, "\n") };
    }
    if (process.env.DB_SSL === "true") {
        return { rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED === "true" };
    }
    return undefined;
};

async function getConnection() {
    return mysql.createConnection({
        host: process.env.DB_HOST,
        port: process.env.DB_PORT || 3306,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        ssl: buildSslConfig()
    });
}

async function seedCategories(connection) {
    for (const category of CATEGORIES) {
        const [existing] = await connection.query(
            "SELECT id FROM categories WHERE slug = ?",
            [category.slug]
        );

        if (existing.length > 0) {
            console.log(`Category "${category.name}" already exists, skipping.`);
            continue;
        }

        await connection.query(
            "INSERT INTO categories (name, slug, description, display_order) VALUES (?, ?, ?, ?)",
            [category.name, category.slug, category.description, category.display_order || 0]
        );
        console.log(`Created category "${category.name}".`);
    }
}

async function seedAdmin(connection) {
    const [existingAdmins] = await connection.query(
        "SELECT id FROM users WHERE role = 'admin' LIMIT 1"
    );

    if (existingAdmins.length > 0) {
        console.log("An admin account already exists, skipping admin seed.");
        return;
    }

    const email = process.env.ADMIN_EMAIL;
    const password = process.env.ADMIN_PASSWORD;
    const phone = process.env.ADMIN_PHONE;

    if (!email || !password || !phone) {
        console.warn(
            "ADMIN_EMAIL / ADMIN_PASSWORD / ADMIN_PHONE not set in backend/.env " +
            "- skipping admin account creation. Set these and re-run " +
            "`node database/seed.js` to create the first admin."
        );
        return;
    }

    const hashed = await bcrypt.hash(password, 10);

    await connection.query(
        `INSERT INTO users (first_name, last_name, email, phone, password, role)
         VALUES (?, ?, ?, ?, ?, 'admin')`,
        ["NEXORA", "Admin", email, phone, hashed]
    );

    console.log(`Created initial admin account (${email}). Change the password after first login.`);
}

async function run() {
    const connection = await getConnection();

    try {
        await seedCategories(connection);
        await seedAdmin(connection);
        console.log("Seeding complete.");
    } catch (error) {
        console.error("Seeding failed:", error.message);
        process.exitCode = 1;
    } finally {
        await connection.end();
    }
}

run();
