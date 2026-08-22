import { prisma } from "../config/prisma.js";
import { isValidRole } from "../auth/roles.js";
/**
 * All Google logins create a "local" user by default. A user is promoted to
 * "global" by manually updating their role in the database.
 */
export async function upsertLocalUser(input) {
    const user = await prisma.user.upsert({
        where: { googleId: input.googleId },
        update: {
            email: input.email,
            ...(input.picture !== undefined ? { picture: input.picture } : {}),
        },
        create: {
            googleId: input.googleId,
            email: input.email,
            role: "local",
            ...(input.picture !== undefined ? { picture: input.picture } : {}),
        },
    });
    return toUserSession(user);
}
export async function completeOnboarding(userId, input) {
    const user = await prisma.user.update({
        where: { userId },
        data: {
            hospitalName: input.hospitalName,
            pincode: input.pincode,
            geolocation: input.geolocation,
        },
    });
    return toUserSession(user);
}
function toUserSession(user) {
    if (!isValidRole(user.role)) {
        throw new Error(`User ${user.userId} has an invalid role: ${user.role}`);
    }
    return {
        userId: user.userId,
        googleId: user.googleId,
        email: user.email,
        ...(user.hospitalName ? { hospitalName: user.hospitalName } : {}),
        ...(user.picture ? { picture: user.picture } : {}),
        node: user.role,
        role: user.role,
        onboarded: Boolean(user.hospitalName && user.pincode),
    };
}
//# sourceMappingURL=user.service.js.map