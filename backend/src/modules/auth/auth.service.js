const generateToken = require("../../utils/generateToken");
const hashPassword = require("../../utils/hashPassword");

const userRepository = require("./auth.repository");

exports.register = async (userData) => {
    const { email, phone, password } = userData;

    // Check email
    const existingEmail = await userRepository.findByEmail(email);
    if (existingEmail) {
        throw new Error("Email already exists");
    }

    // Check phone
    const existingPhone = await userRepository.findByPhone(phone);
    if (existingPhone) {
        throw new Error("Phone number already exists");
    }

    // Hash password
    const hashedPassword = await hashPassword(password);

    const userId = await userRepository.createUser({
        ...userData,
        password: hashedPassword
    });

   const token = generateToken({
    id: userId,
    role: userData.role
});

    return {
        userId,
        token
    };
};