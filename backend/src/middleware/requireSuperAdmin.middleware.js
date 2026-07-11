// Guards admin-management routes (add/remove admins, change admin
// permissions). Regular admins can moderate the platform, but only a
// super_admin can create or remove other admin accounts - otherwise any
// admin could grant themselves (or a friend) full control.
module.exports = (req, res, next) => {
    if (req.user.role !== "admin" || req.user.admin_level !== "super_admin") {
        return res.status(403).json({
            success: false,
            message: "This action requires super admin access."
        });
    }

    next();
};
