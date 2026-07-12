const db = require("../../config/db");

exports.findByEmail = async (email) => {
    const [rows] = await db.query(
        "SELECT * FROM users WHERE email = ?",
        [email]
    );
    return rows[0];
};

exports.findById = async (id) => {
    const [rows] = await db.query(
        "SELECT * FROM users WHERE id = ?",
        [id]
    );
    return rows[0];
};

exports.findByPhone = async (phone) => {
    const [rows] = await db.query(
        "SELECT * FROM users WHERE phone = ?",
        [phone]
    );
    return rows[0];
};

exports.createUser = async (user) => {
    const {
        first_name,
        last_name,
        email,
        phone,
        password,
        role
    } = user;

    const [result] = await db.query(
        `INSERT INTO users
        (first_name,last_name,email,phone,password,role)
        VALUES (?,?,?,?,?,?)`,
        [first_name, last_name, email, phone, password, role]
    );

    return result.insertId;
};

