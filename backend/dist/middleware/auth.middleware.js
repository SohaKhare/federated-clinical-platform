export function requireAuth(req, res, next) {
    if (!req.session.user) {
        return res.status(401).json({
            message: "Authentication required.",
        });
    }
    next();
}
/**
 * Must be used after requireAuth.
 *
 * Usage:
 *   router.get("/admin", requireAuth, requireRole("global"), handler)
 *   router.get("/hospital", requireAuth, requireRole("local"), handler)
 */
export function requireRole(...roles) {
    return (req, res, next) => {
        const user = req.session.user;
        if (!user) {
            return res.status(401).json({
                message: "Authentication required.",
            });
        }
        if (!roles.includes(user.role)) {
            return res.status(403).json({
                message: `Access denied. Requires role: ${roles.join(" or ")}.`,
                yourRole: user.role,
            });
        }
        next();
    };
}
//# sourceMappingURL=auth.middleware.js.map