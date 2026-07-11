const userRepository = require("./auth.repository");
const comparePassword = require("../../utils/comparePassword");
const generateToken = require("../../utils/generateToken");

exports.login = async (email, password) => {
    const user = await userRepository.findByEmail(email);

    if (!user) {
        throw new Error("Invalid email or password");
    }

    const match = await comparePassword(password, user.password);

    if (!match) {
        throw new Error("Invalid email or password");
    }

    if (user.is_active === 0) {
        throw new Error("This account has been deactivated. Please contact support");
    }

    const token = generateToken({
        id: user.id,
        role: user.role,
        admin_level: user.role === "admin" ? user.admin_level : undefined
    });

    delete user.password;

    return {
        user,
        token
    };
};