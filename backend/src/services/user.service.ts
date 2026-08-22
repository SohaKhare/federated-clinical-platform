import { prisma } from "../config/prisma.js";
import type { Prisma } from "@prisma/client";
import type { OnboardingInput, UserSession } from "../interfaces/model/user.interface.js";

export async function upsertLocalUser(input: {
  googleId: string;
  email: string;
  picture?: string;
}): Promise<UserSession> {
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
      nodeId: "PENDING",
      ...(input.picture !== undefined ? { picture: input.picture } : {}),
    },
  });

  return toUserSession(user);
}

export async function completeOnboarding(
  userId: string,
  input: OnboardingInput,
): Promise<UserSession> {
  const user = await prisma.user.update({
    where: { userId },
    data: {
      name: input.hospitalName,
      pincode: input.pincode,
      geolocation: input.geolocation as Prisma.InputJsonValue,
    },
  });

  return toUserSession(user);
}

function toUserSession(user: {
  userId: string;
  googleId: string;
  email: string;
  name: string | null;
  picture: string | null;
  role: "local" | "global";
  nodeId: string | null;
  pincode: string | null;
  geolocation: unknown;
}): UserSession {
  return {
    userId: user.userId,
    googleId: user.googleId,
    email: user.email,
    ...(user.name ? { name: user.name } : {}),
    ...(user.picture ? { picture: user.picture } : {}),
    node: "local",
    role: "local",
    onboarded: Boolean(user.name && user.pincode),
  };
}