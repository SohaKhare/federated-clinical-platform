import { completeOnboarding } from "../services/user.service.js";
export async function onboardUser(req, res) {
    const userId = req.session.user?.userId;
    if (!userId || !isOnboardingInput(req.body)) {
        return res.status(400).json({
            message: "hospitalName, pincode, and geolocation are required.",
        });
    }
    try {
        const user = await completeOnboarding(userId, req.body);
        req.session.user = user;
        return res.json({ user });
    }
    catch (error) {
        console.error("User onboarding error:", error);
        return res.status(500).json({ message: "Unable to complete onboarding." });
    }
}
function isOnboardingInput(value) {
    if (!value || typeof value !== "object") {
        return false;
    }
    const input = value;
    return (typeof input.hospitalName === "string" &&
        input.hospitalName.trim().length > 0 &&
        typeof input.pincode === "string" &&
        input.pincode.trim().length > 0 &&
        typeof input.geolocation === "object" &&
        input.geolocation !== null &&
        !Array.isArray(input.geolocation));
}
//# sourceMappingURL=onboarding.controller.js.map