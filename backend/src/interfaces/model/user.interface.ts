import type { UserRole } from "../../auth/roles.js";

export interface Geolocation {
  latitude?: number;
  longitude?: number;
  [key: string]: unknown;
}

export interface OnboardingInput {
  hospitalName: string;
  pincode: string;
  geolocation: Geolocation;
}

export interface UserSession {
  userId: string;
  googleId: string;
  email: string;
  hospitalName?: string;
  picture?: string;
  node: UserRole;
  role: UserRole;
  onboarded: boolean;
}