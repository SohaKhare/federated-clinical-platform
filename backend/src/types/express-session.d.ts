import "express-session";

declare module "express-session" {
  interface SessionData {
    oauthState?: string;

    oauthNode?: "local" | "global";

    user?: {
      googleId: string;
      email: string;
      name?: string;
      picture?: string;
      node: "local" | "global";
    };
  }
}
