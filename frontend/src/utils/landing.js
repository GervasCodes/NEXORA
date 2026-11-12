// Where a person goes right after signing in when they did not arrive from a specific page (no ?returnTo).
// Sellers, delivery agents and admins used to land on the public home page and had to find their area;
// now they land in it. Buyers, and any unknown role, still land on "/".
const LANDING = {
    seller: "/seller",
    delivery_agent: "/delivery",
    admin: "/admin"
};

export const landingPathFor = (role) => LANDING[role] || "/";
