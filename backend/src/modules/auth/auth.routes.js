const express = require("express");
const router = express.Router();

const { register, login } = require("./auth.controller");
const { registerValidation } = require("./auth.validator");


router.post("/register", registerValidation, register);

router.post("/login", login);

module.exports = router;